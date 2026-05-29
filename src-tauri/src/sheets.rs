use serde::{Deserialize, Serialize};

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
