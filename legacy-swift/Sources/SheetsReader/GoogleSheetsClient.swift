import Foundation
import JWTKit

// MARK: - Errors

enum SheetsError: LocalizedError {
    case invalidPrivateKey
    case tokenRequest(String)
    case api(status: Int, body: String)
    case badURL

    var errorDescription: String? {
        switch self {
        case .invalidPrivateKey:
            return "อ่าน private key จากไฟล์ Service Account ไม่ได้ (ไฟล์อาจไม่ถูกต้อง)"
        case .tokenRequest(let detail):
            return "ขอ access token ไม่สำเร็จ: \(detail)"
        case .api(let status, let body):
            if body.contains("PERMISSION_DENIED") || status == 403 {
                return "ไม่มีสิทธิ์เข้าถึงชีท (\(status))\nอย่าลืมกด Share ชีทให้อีเมล Service Account ก่อน\n\n\(body)"
            }
            if status == 404 {
                return "ไม่พบชีทหรือ range นี้ (404)\nเช็ก Spreadsheet ID และชื่อชีท/range ให้ถูก\n\n\(body)"
            }
            return "Google Sheets API error (\(status)):\n\(body)"
        case .badURL:
            return "สร้าง URL ไม่สำเร็จ"
        }
    }
}

// MARK: - JWT payload for the service-account assertion

struct GoogleJWTPayload: JWTPayload {
    var iss: IssuerClaim
    var scope: String
    var aud: AudienceClaim
    var iat: IssuedAtClaim
    var exp: ExpirationClaim

    func verify(using signer: JWTSigner) throws {
        // We only sign; verification is done by Google.
    }
}

// MARK: - API response models

private struct TokenResponse: Codable {
    let access_token: String
    let expires_in: Int
    let token_type: String
}

/// A single cell. Google returns FORMATTED_VALUE as strings, but we decode
/// defensively so numbers / booleans don't break decoding.
private struct Cell: Decodable {
    let text: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { text = s }
        else if let i = try? c.decode(Int.self) { text = String(i) }
        else if let d = try? c.decode(Double.self) { text = String(d) }
        else if let b = try? c.decode(Bool.self) { text = b ? "TRUE" : "FALSE" }
        else { text = "" }
    }
}

private struct ValueRangeResponse: Decodable {
    let range: String?
    let majorDimension: String?
    let values: [[Cell]]?
}

// MARK: - Client

/// Reads values from Google Sheets using a service-account key.
actor GoogleSheetsClient {
    private let key: ServiceAccountKey
    private var cachedToken: String?
    private var tokenExpiry: Date?

    init(key: ServiceAccountKey) {
        self.key = key
    }

    private func accessToken() async throws -> String {
        if let token = cachedToken, let expiry = tokenExpiry,
           expiry > Date().addingTimeInterval(60) {
            return token
        }

        let now = Date()
        let payload = GoogleJWTPayload(
            iss: .init(value: key.clientEmail),
            scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
            aud: .init(value: key.tokenUri ?? "https://oauth2.googleapis.com/token"),
            iat: .init(value: now),
            exp: .init(value: now.addingTimeInterval(3600))
        )

        let signers = JWTSigners()
        do {
            try signers.use(.rs256(key: .private(pem: key.privateKey)))
        } catch {
            throw SheetsError.invalidPrivateKey
        }
        let assertion = try signers.sign(payload)

        guard let url = URL(string: key.tokenUri ?? "https://oauth2.googleapis.com/token") else {
            throw SheetsError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let body = "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=\(assertion)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let detail = String(data: data, encoding: .utf8) ?? "unknown"
            throw SheetsError.tokenRequest(detail)
        }
        let token = try JSONDecoder().decode(TokenResponse.self, from: data)
        cachedToken = token.access_token
        tokenExpiry = now.addingTimeInterval(TimeInterval(token.expires_in))
        return token.access_token
    }

    /// Fetches the values for the given spreadsheet + A1 range.
    func fetchValues(spreadsheetId: String, range: String) async throws -> [[String]] {
        let token = try await accessToken()

        let encodedRange = range.addingPercentEncoding(
            withAllowedCharacters: .urlQueryAllowed
        ) ?? range
        let urlString = "https://sheets.googleapis.com/v4/spreadsheets/\(spreadsheetId)/values/\(encodedRange)"
        guard let url = URL(string: urlString) else { throw SheetsError.badURL }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SheetsError.api(status: -1, body: "no response")
        }
        guard http.statusCode == 200 else {
            let bodyText = String(data: data, encoding: .utf8) ?? "unknown"
            throw SheetsError.api(status: http.statusCode, body: bodyText)
        }
        let decoded = try JSONDecoder().decode(ValueRangeResponse.self, from: data)
        return (decoded.values ?? []).map { row in row.map { $0.text } }
    }
}
