use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MultiFetchResult {
    pub sheets: Vec<SheetData>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchResult {
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct ServiceAccountKey {
    private_key: String,
    client_email: String,
    token_uri: Option<String>,
}

#[derive(Debug, Serialize)]
struct JwtClaims {
    iss: String,
    scope: String,
    aud: String,
    iat: i64,
    exp: i64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct ValueRangeResponse {
    values: Option<Vec<Vec<serde_json::Value>>>,
}

pub fn extract_spreadsheet_id(input: &str) -> String {
    let trimmed = input.trim();
    if let Some(idx) = trimmed.find("/spreadsheets/d/") {
        let after = &trimmed[idx + "/spreadsheets/d/".len()..];
        if let Some(slash) = after.find('/') {
            return after[..slash].to_string();
        }
        return after.to_string();
    }
    trimmed.to_string()
}

pub fn extract_gid(input: &str) -> Option<String> {
    let idx = input.find("gid=")?;
    let after = &input[idx + 4..];
    let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

fn cell_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Bool(b) => {
            if *b {
                "TRUE".into()
            } else {
                "FALSE".into()
            }
        }
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Minimal RFC-4180 CSV parser.
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];
        if in_quotes {
            if c == '"' {
                if i + 1 < chars.len() && chars[i + 1] == '"' {
                    field.push('"');
                    i += 1;
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else {
            match c {
                '"' => in_quotes = true,
                ',' => {
                    row.push(field.clone());
                    field.clear();
                }
                '\n' => {
                    row.push(field.clone());
                    field.clear();
                    rows.push(row.clone());
                    row.clear();
                }
                '\r' => {}
                _ => field.push(c),
            }
        }
        i += 1;
    }

    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }

    rows
}

pub fn parse_tab_names(input: &str) -> Vec<String> {
    input
        .split(&[',', '\n', ';'][..])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}

fn is_html_error(text: &str) -> bool {
    let head = text.chars().take(200).collect::<String>().to_lowercase();
    head.contains("<!doctype html") || head.contains("<html")
}

async fn fetch_public_tab(spreadsheet_id: &str, sheet_name: &str) -> Result<Vec<Vec<String>>, String> {
    let encoded_sheet = urlencoding::encode(sheet_name);
    let url = format!(
        "https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?tqx=out:csv&sheet={encoded_sheet}"
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("โหลดไม่สำเร็จ: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("อ่านไม่สำเร็จ: {e}"))?;

    if !status.is_success() || is_html_error(&text) {
        return Err(format!(
            "อ่านแท็บ \"{sheet_name}\" ไม่ได้ — เช็กชื่อแท็บหรือ Share เป็น public"
        ));
    }

    Ok(parse_csv(&text))
}

pub async fn fetch_public_tabs(
    spreadsheet_input: &str,
    tab_names: &[String],
) -> Result<MultiFetchResult, String> {
    let id = extract_spreadsheet_id(spreadsheet_input);
    if id.is_empty() {
        return Err("ใส่ลิงก์ Google Sheets หรือ Spreadsheet ID ก่อน".into());
    }
    if tab_names.is_empty() {
        return Err("ระบุชื่อแท็บที่ต้องการอ่าน เช่น FE-tasks, Bugs".into());
    }

    let mut sheets = Vec::new();
    let mut warnings = Vec::new();

    for name in tab_names {
        match fetch_public_tab(&id, name).await {
            Ok(rows) => {
                if rows.is_empty() {
                    warnings.push(format!("แท็บ \"{name}\" ไม่มีข้อมูล"));
                }
                sheets.push(SheetData {
                    name: name.clone(),
                    rows,
                });
            }
            Err(err) => warnings.push(err),
        }
    }

    if sheets.is_empty() {
        return Err(
            "อ่านแท็บที่เลือกไม่ได้เลย\n\
             เช็กชื่อแท็บ (FE-tasks, Bugs) และ Share → Anyone with the link"
                .into(),
        );
    }

    Ok(MultiFetchResult { sheets, warnings })
}

pub async fn fetch_public(spreadsheet_input: &str) -> Result<FetchResult, String> {
    let id = extract_spreadsheet_id(spreadsheet_input);
    if id.is_empty() {
        return Err("ใส่ลิงก์ Google Sheets หรือ Spreadsheet ID ก่อน".into());
    }

    let mut url = format!(
        "https://docs.google.com/spreadsheets/d/{id}/export?format=csv"
    );
    if let Some(gid) = extract_gid(spreadsheet_input) {
        url.push_str(&format!("&gid={gid}"));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("โหลดข้อมูลไม่สำเร็จ: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("อ่านข้อมูลไม่สำเร็จ: {e}"))?;

    if !status.is_success() {
        return Err(
            "อ่านชีทไม่ได้ — ชีทนี้น่าจะยังไม่ได้เปิดเป็น public\n\
             ไปที่ Share → General access → ตั้งเป็น \"Anyone with the link\" (Viewer)"
                .into(),
        );
    }

    let head = text.chars().take(200).collect::<String>().to_lowercase();
    if head.contains("<!doctype html") || head.contains("<html") {
        return Err(
            "อ่านชีทไม่ได้ — ชีทนี้น่าจะยังไม่ได้เปิดเป็น public\n\
             ไปที่ Share → General access → ตั้งเป็น \"Anyone with the link\" (Viewer)"
                .into(),
        );
    }

    Ok(FetchResult {
        rows: parse_csv(&text),
    })
}

async fn get_access_token(key: &ServiceAccountKey) -> Result<String, String> {
    let token_uri = key
        .token_uri
        .clone()
        .unwrap_or_else(|| "https://oauth2.googleapis.com/token".to_string());

    let now = chrono::Utc::now().timestamp();
    let claims = JwtClaims {
        iss: key.client_email.clone(),
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly".into(),
        aud: token_uri.clone(),
        iat: now,
        exp: now + 3600,
    };

    let encoding_key = EncodingKey::from_rsa_pem(key.private_key.as_bytes())
        .map_err(|_| "อ่าน private key จากไฟล์ Service Account ไม่ได้")?;

    let assertion = encode(
        &Header::new(Algorithm::RS256),
        &claims,
        &encoding_key,
    )
    .map_err(|e| format!("สร้าง JWT ไม่สำเร็จ: {e}"))?;

    let mut form = HashMap::new();
    form.insert(
        "grant_type",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    form.insert("assertion", assertion.as_str());

    let client = reqwest::Client::new();
    let response = client
        .post(&token_uri)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("ขอ access token ไม่สำเร็จ: {e}"))?;

    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("ขอ access token ไม่สำเร็จ: {body}"));
    }

    let token: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("อ่าน token response ไม่สำเร็จ: {e}"))?;

    Ok(token.access_token)
}

fn format_sheet_range(sheet_name: &str, cell_range: &str) -> String {
    let range = cell_range.trim();
    if range.contains('!') {
        return range.to_string();
    }
    let escaped = sheet_name.replace('\'', "''");
    format!("'{escaped}'!{range}")
}

async fn fetch_service_account_range(
    spreadsheet_id: &str,
    token: &str,
    range: &str,
) -> Result<Vec<Vec<String>>, String> {
    let encoded_range = urlencoding::encode(range.trim());
    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{encoded_range}"
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("เรียก Sheets API ไม่สำเร็จ: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("อ่าน response ไม่สำเร็จ: {e}"))?;

    if status.as_u16() == 403 || body.contains("PERMISSION_DENIED") {
        return Err(format!(
            "ไม่มีสิทธิ์เข้าถึงชีท\n\
             อย่าลืมกด Share ชีทให้อีเมล Service Account ก่อน\n\n{body}"
        ));
    }

    if !status.is_success() {
        if status.as_u16() == 404 {
            return Err("ไม่พบชีทหรือ range นี้ (404)".into());
        }
        return Err(format!("Google Sheets API error ({}):\n{body}", status.as_u16()));
    }

    let decoded: ValueRangeResponse =
        serde_json::from_str(&body).map_err(|e| format!("แปลงข้อมูลไม่สำเร็จ: {e}"))?;

    Ok(decoded
        .values
        .unwrap_or_default()
        .into_iter()
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect())
}

pub async fn fetch_service_account_tabs(
    spreadsheet_input: &str,
    key_path: &str,
    tab_names: &[String],
    cell_range: &str,
) -> Result<MultiFetchResult, String> {
    let id = extract_spreadsheet_id(spreadsheet_input);
    if id.is_empty() {
        return Err("ใส่ลิงก์ Google Sheets หรือ Spreadsheet ID ก่อน".into());
    }
    if tab_names.is_empty() {
        return Err("ระบุชื่อแท็บที่ต้องการอ่าน เช่น FE-tasks, Bugs".into());
    }

    let key_json = std::fs::read_to_string(key_path)
        .map_err(|_| "อ่านไฟล์ Service Account ไม่ได้")?;
    let key: ServiceAccountKey =
        serde_json::from_str(&key_json).map_err(|_| "ไฟล์ Service Account ไม่ถูกต้อง")?;

    let token = get_access_token(&key).await?;

    let mut sheets = Vec::new();
    let mut warnings = Vec::new();

    for name in tab_names {
        let range = format_sheet_range(name, cell_range);
        match fetch_service_account_range(&id, &token, &range).await {
            Ok(rows) => {
                if rows.is_empty() {
                    warnings.push(format!("แท็บ \"{name}\" ไม่มีข้อมูล"));
                }
                sheets.push(SheetData {
                    name: name.clone(),
                    rows,
                });
            }
            Err(err) => warnings.push(format!("แท็บ \"{name}\": {err}")),
        }
    }

    if sheets.is_empty() {
        return Err("อ่านแท็บที่เลือกไม่ได้เลย — เช็กชื่อแท็บและสิทธิ์ Service Account".into());
    }

    Ok(MultiFetchResult { sheets, warnings })
}

pub async fn fetch_service_account(
    spreadsheet_input: &str,
    key_path: &str,
    range: &str,
) -> Result<FetchResult, String> {
    let id = extract_spreadsheet_id(spreadsheet_input);
    if id.is_empty() {
        return Err("ใส่ลิงก์ Google Sheets หรือ Spreadsheet ID ก่อน".into());
    }

    let key_json = std::fs::read_to_string(key_path)
        .map_err(|_| "อ่านไฟล์ Service Account ไม่ได้")?;
    let key: ServiceAccountKey =
        serde_json::from_str(&key_json).map_err(|_| "ไฟล์ Service Account ไม่ถูกต้อง")?;

    let token = get_access_token(&key).await?;
    let rows = fetch_service_account_range(&id, &token, range).await?;
    Ok(FetchResult { rows })
}
