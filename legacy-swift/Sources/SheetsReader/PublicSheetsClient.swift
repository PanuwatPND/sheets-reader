import Foundation

/// Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, and
/// newlines inside quoted fields).
enum CSV {
    static func parse(_ text: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var inQuotes = false

        let chars = Array(text)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if inQuotes {
                if c == "\"" {
                    if i + 1 < chars.count, chars[i + 1] == "\"" {
                        field.append("\"")
                        i += 1
                    } else {
                        inQuotes = false
                    }
                } else {
                    field.append(c)
                }
            } else {
                switch c {
                case "\"":
                    inQuotes = true
                case ",":
                    row.append(field)
                    field = ""
                case "\n":
                    row.append(field)
                    field = ""
                    rows.append(row)
                    row = []
                case "\r":
                    break
                default:
                    field.append(c)
                }
            }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty {
            row.append(field)
            rows.append(row)
        }
        return rows
    }
}

/// Reads a publicly shared Google Sheet (no credentials) via the CSV export
/// endpoint. Works when the sheet is shared as "anyone with the link can view".
struct PublicSheetsClient {
    enum PublicError: LocalizedError {
        case badURL
        case notPublic
        case http(Int)

        var errorDescription: String? {
            switch self {
            case .badURL:
                return "สร้าง URL ไม่สำเร็จ"
            case .notPublic:
                return "อ่านชีทไม่ได้ — ชีทนี้น่าจะยังไม่ได้เปิดเป็น public\nไปที่ Share → General access → ตั้งเป็น \"Anyone with the link\" (Viewer)\nหรือสลับไปใช้โหมด Service Account"
            case .http(let code):
                return "โหลดข้อมูลไม่สำเร็จ (HTTP \(code))"
            }
        }
    }

    func fetch(spreadsheetId: String, gid: String?) async throws -> [[String]] {
        var urlString = "https://docs.google.com/spreadsheets/d/\(spreadsheetId)/export?format=csv"
        if let gid, !gid.isEmpty {
            urlString += "&gid=\(gid)"
        }
        guard let url = URL(string: urlString) else { throw PublicError.badURL }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw PublicError.http(-1)
        }
        guard http.statusCode == 200 else {
            // Private sheets redirect to a login page (often surfaced as 4xx here).
            throw PublicError.notPublic
        }

        let text = String(data: data, encoding: .utf8) ?? ""
        // If the sheet isn't public, Google serves an HTML login/error page.
        let head = text.prefix(200).lowercased()
        if head.contains("<!doctype html") || head.contains("<html") {
            throw PublicError.notPublic
        }
        return CSV.parse(text)
    }
}
