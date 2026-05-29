import Foundation

/// Decoded representation of a Google Cloud service-account JSON key file.
struct ServiceAccountKey: Codable {
    let type: String
    let projectId: String?
    let privateKeyId: String?
    let privateKey: String
    let clientEmail: String
    let tokenUri: String?

    enum CodingKeys: String, CodingKey {
        case type
        case projectId = "project_id"
        case privateKeyId = "private_key_id"
        case privateKey = "private_key"
        case clientEmail = "client_email"
        case tokenUri = "token_uri"
    }

    static func load(fromPath path: String) throws -> ServiceAccountKey {
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        return try JSONDecoder().decode(ServiceAccountKey.self, from: data)
    }
}
