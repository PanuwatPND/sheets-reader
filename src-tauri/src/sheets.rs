use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
}

#[derive(Debug, Serialize)]
struct JwtClaims {
    iss: String,
    scope: String,
    aud: String,
    exp: usize,
    iat: usize,
}
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

fn column_to_a1(col: u32) -> String {
    let mut n = col + 1;
    let mut letters = String::new();
    while n > 0 {
        n -= 1;
        letters.insert(0, (b'A' + (n % 26) as u8) as char);
        n /= 26;
    }
    letters
}

fn sheet_range(sheet_name: &str, col: u32, row: u32) -> String {
    let escaped = sheet_name.replace('\'', "''");
    format!("'{escaped}'!{}{row}", column_to_a1(col))
}

async fn service_account_token(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err(
            "ยังไม่ได้ตั้งค่า Service Account — เปิด ⚙ แล้วใส่ path ไฟล์ JSON".into(),
        );
    }

    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("อ่าน service account ไม่ได้: {e}"))?;
    let sa: ServiceAccount =
        serde_json::from_str(&text).map_err(|e| format!("ไฟล์ service account ไม่ถูกต้อง: {e}"))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as usize;

    let claims = JwtClaims {
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets".to_string(),
        aud: "https://oauth2.googleapis.com/token".to_string(),
        exp: now + 3600,
        iat: now,
    };

    let key = jsonwebtoken::EncodingKey::from_rsa_pem(sa.private_key.as_bytes())
        .map_err(|e| format!("private key ไม่ถูกต้อง: {e}"))?;
    let jwt = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256),
        &claims,
        &key,
    )
    .map_err(|e| format!("สร้าง JWT ไม่ได้: {e}"))?;

    let client = reqwest::Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ])
        .send()
        .await
        .map_err(|e| format!("ขอ access token ไม่ได้: {e}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("อ่าน token response ไม่ได้: {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("error_description")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Google OAuth ปฏิเสธ: {msg}"));
    }

    let token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "ไม่มี access_token ใน response".to_string())?;

    Ok(token.to_string())
}

pub fn service_account_email(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("ยังไม่ได้เลือกไฟล์".into());
    }
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("อ่านไฟล์ไม่ได้: {e}"))?;
    let sa: ServiceAccount =
        serde_json::from_str(&text).map_err(|e| format!("ไฟล์ JSON ไม่ถูกต้อง: {e}"))?;
    if sa.client_email.trim().is_empty() {
        return Err("ไม่พบ client_email ในไฟล์".into());
    }
    Ok(sa.client_email)
}

pub async fn test_service_account(path: &str) -> Result<(), String> {
    service_account_token(path).await?;
    Ok(())
}

pub async fn update_sheet_cell(
    service_account_path: &str,
    spreadsheet_input: &str,
    sheet_name: &str,
    column: u32,
    row: u32,
    value: &str,
) -> Result<(), String> {
    let spreadsheet_id = extract_spreadsheet_id(spreadsheet_input);
    if spreadsheet_id.is_empty() {
        return Err("ใส่ลิงก์ Google Sheets ก่อน".into());
    }
    if sheet_name.trim().is_empty() {
        return Err("ไม่พบชื่อแท็บ".into());
    }
    if row == 0 {
        return Err("แถวไม่ถูกต้อง".into());
    }

    let token = service_account_token(service_account_path).await?;
    let a1 = sheet_range(sheet_name, column, row);
    let range = urlencoding::encode(&a1);
    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range}?valueInputOption=USER_ENTERED"
    );

    let client = reqwest::Client::new();
    let response = client
        .put(&url)
        .bearer_auth(&token)
        .json(&serde_json::json!({ "values": [[value]] }))
        .send()
        .await
        .map_err(|e| format!("อัปเดตชีทไม่สำเร็จ: {e}"))?;

    let status = response.status();
    if status.is_success() {
        return Ok(());
    }

    let body: serde_json::Value = response
        .json()
        .await
        .unwrap_or(serde_json::json!({}));
    let msg = body
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .unwrap_or("ไม่ทราบสาเหตุ");
    Err(format!(
        "อัปเดตสถานะไม่ได้ ({status}): {msg}\n\
         เช็กว่าแชร์ชีทให้ service account เป็น Editor"
    ))
}
