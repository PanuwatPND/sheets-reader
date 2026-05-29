import Foundation
import SwiftUI
import AppKit
import UniformTypeIdentifiers

enum ReadMode: String, CaseIterable, Identifiable {
    case publicLink
    case serviceAccount

    var id: String { rawValue }
    var label: String {
        switch self {
        case .publicLink: return "ลิงก์ public (ไม่ต้องใช้ key)"
        case .serviceAccount: return "Service Account"
        }
    }
}

@MainActor
final class AppModel: ObservableObject {
    // Settings (persisted)
    @Published var readMode: ReadMode {
        didSet { UserDefaults.standard.set(readMode.rawValue, forKey: "readMode") }
    }
    @Published var serviceAccountPath: String {
        didSet { UserDefaults.standard.set(serviceAccountPath, forKey: "saPath") }
    }
    @Published var spreadsheetInput: String {
        didSet { UserDefaults.standard.set(spreadsheetInput, forKey: "ssInput") }
    }
    @Published var range: String {
        didSet { UserDefaults.standard.set(range, forKey: "range") }
    }
    @Published var firstRowIsHeader: Bool {
        didSet { UserDefaults.standard.set(firstRowIsHeader, forKey: "firstRowIsHeader") }
    }
    @Published var nameQuery: String {
        didSet { UserDefaults.standard.set(nameQuery, forKey: "nameQuery") }
    }

    // nil = ค้นหาทุกคอลัมน์
    @Published var nameColumn: Int?
    @Published var showOnlyMatches = false
    @Published var showFullTable = false
    @Published var copyNotice: String?

    // Runtime state
    @Published var rows: [[String]] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var serviceAccountEmail: String?

    init() {
        let d = UserDefaults.standard
        readMode = ReadMode(rawValue: d.string(forKey: "readMode") ?? "") ?? .publicLink
        serviceAccountPath = d.string(forKey: "saPath") ?? ""
        spreadsheetInput = d.string(forKey: "ssInput") ?? ""
        range = d.string(forKey: "range") ?? "Sheet1!A1:Z1000"
        firstRowIsHeader = d.object(forKey: "firstRowIsHeader") as? Bool ?? true
        nameQuery = d.string(forKey: "nameQuery") ?? "POND"
        loadServiceAccountEmail()
    }

    // MARK: - Derived data

    /// Header labels (only when first row is treated as header).
    var headers: [String] {
        guard firstRowIsHeader, let first = rows.first else { return [] }
        return first
    }

    var columnCount: Int {
        rows.map(\.count).max() ?? 0
    }

    /// Data rows excluding the header row.
    var dataRows: [[String]] {
        guard firstRowIsHeader, rows.count > 1 else {
            return firstRowIsHeader ? [] : rows
        }
        return Array(rows.dropFirst())
    }

    private func normalized(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .folding(options: .diacriticInsensitive, locale: .current)
    }

    func matches(_ row: [String]) -> Bool {
        let q = normalized(nameQuery)
        guard !q.isEmpty else { return false }
        let cells: [String]
        if let col = nameColumn {
            guard col < row.count else { return false }
            cells = [row[col]]
        } else {
            cells = row
        }
        return cells.contains { normalized($0).contains(q) }
    }

    var matchCount: Int {
        dataRows.filter(matches).count
    }

    var totalCount: Int {
        dataRows.count
    }

    var matchedRows: [[String]] {
        dataRows.filter(matches)
    }

    /// Primary column for bullet text: explicit picker, else first non-empty cell.
    func summaryLine(for row: [String]) -> String {
        if let col = nameColumn, col < row.count {
            let v = row[col].trimmingCharacters(in: .whitespacesAndNewlines)
            if !v.isEmpty { return v }
        }
        let parts = row
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if parts.isEmpty { return "(ว่าง)" }
        if parts.count == 1 { return parts[0] }
        return parts.joined(separator: " · ")
    }

    var summaryBulletText: String {
        let q = nameQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            return "พิมพ์ชื่อที่ต้องการนับในช่องด้านบน แล้วรายการจะอัปเดตทันที"
        }
        let rowsToShow = showOnlyMatches ? matchedRows : dataRows
        if rowsToShow.isEmpty {
            return showOnlyMatches
                ? "ไม่พบงานที่ตรงกับ \"\(q)\" (ลองเปลี่ยนคอลัมน์ค้นหา หรือปิด \"เฉพาะงานที่ตรง\")"
                : "ไม่มีแถวข้อมูล (ลองปิด \"แถวแรกเป็นหัวตาราง\" ถ้าชีทไม่มีหัว)"
        }
        return rowsToShow.map { row in
            let bullet = matches(row) ? "•" : "–"
            return "\(bullet) \(summaryLine(for: row))"
        }.joined(separator: "\n")
    }

    var fullTableText: String {
        rows.map { row in
            row.map { $0.replacingOccurrences(of: "\t", with: " ") }.joined(separator: "\t")
        }.joined(separator: "\n")
    }

    var mainDisplayText: String {
        showFullTable ? fullTableText : summaryBulletText
    }

    func copyMainTextToPasteboard() {
        let text = mainDisplayText
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        copyNotice = "คัดลอกแล้ว (\(text.components(separatedBy: "\n").count) บรรทัด)"
    }

    func flashCopyNotice(_ message: String) {
        copyNotice = message
    }

    // MARK: - Actions

    func pickServiceAccount() {
        let panel = NSOpenPanel()
        panel.title = "เลือกไฟล์ Service Account JSON"
        panel.allowedContentTypes = [.json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            serviceAccountPath = url.path
            loadServiceAccountEmail()
        }
    }

    func loadServiceAccountEmail() {
        guard !serviceAccountPath.isEmpty,
              let key = try? ServiceAccountKey.load(fromPath: serviceAccountPath) else {
            serviceAccountEmail = nil
            return
        }
        serviceAccountEmail = key.clientEmail
    }

    /// Accepts either a full Google Sheets URL or a raw spreadsheet ID.
    func extractSpreadsheetId(_ input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let r = trimmed.range(of: "/spreadsheets/d/") {
            let after = trimmed[r.upperBound...]
            if let slash = after.firstIndex(where: { $0 == "/" }) {
                return String(after[..<slash])
            }
            return String(after)
        }
        return trimmed
    }

    /// Extracts the sheet tab id (gid) from the URL, if present.
    func extractGid(_ input: String) -> String? {
        guard let r = input.range(of: "gid=") else { return nil }
        let after = input[r.upperBound...]
        let digits = after.prefix { $0.isNumber }
        return digits.isEmpty ? nil : String(digits)
    }

    func fetch() async {
        errorMessage = nil

        let id = extractSpreadsheetId(spreadsheetInput)
        guard !id.isEmpty else {
            errorMessage = "ใส่ลิงก์ Google Sheets หรือ Spreadsheet ID ก่อน"
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            switch readMode {
            case .publicLink:
                let gid = extractGid(spreadsheetInput)
                rows = try await PublicSheetsClient().fetch(spreadsheetId: id, gid: gid)
            case .serviceAccount:
                guard !serviceAccountPath.isEmpty else {
                    errorMessage = "เลือกไฟล์ Service Account JSON ก่อน"
                    return
                }
                let key = try ServiceAccountKey.load(fromPath: serviceAccountPath)
                let client = GoogleSheetsClient(key: key)
                rows = try await client.fetchValues(spreadsheetId: id, range: range)
            }

            if let col = nameColumn, col >= columnCount {
                nameColumn = nil
            }
            if rows.isEmpty {
                errorMessage = "ไม่พบข้อมูล"
            }
        } catch let e as PublicSheetsClient.PublicError {
            rows = []
            errorMessage = e.errorDescription
        } catch let e as SheetsError {
            rows = []
            errorMessage = e.errorDescription
        } catch {
            rows = []
            errorMessage = error.localizedDescription
        }
    }
}
