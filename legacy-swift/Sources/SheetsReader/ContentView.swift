import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @State private var mainTextView: NSTextView?

    var body: some View {
        VStack(spacing: 0) {
            controlPanel
            Divider()
            if !model.rows.isEmpty {
                summaryBar
                Divider()
            }
            content
        }
    }

    // MARK: - Controls

    private var controlPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("วิธีอ่าน", selection: $model.readMode) {
                ForEach(ReadMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if model.readMode == .serviceAccount {
                serviceAccountRow
            }

            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Spreadsheet URL หรือ ID")
                        .font(.caption).foregroundStyle(.secondary)
                    TextField("วางลิงก์ Google Sheets ที่นี่", text: $model.spreadsheetInput)
                        .textFieldStyle(.roundedBorder)
                }
                if model.readMode == .serviceAccount {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Range")
                            .font(.caption).foregroundStyle(.secondary)
                        TextField("Sheet1!A1:Z1000", text: $model.range)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 180)
                    }
                }
            }

            HStack(spacing: 12) {
                Toggle("แถวแรกเป็นหัวตาราง", isOn: $model.firstRowIsHeader)
                Spacer()
                if model.isLoading {
                    ProgressView().controlSize(.small)
                }
                Button {
                    Task { await model.fetch() }
                } label: {
                    Label("อ่านข้อมูล", systemImage: "arrow.clockwise")
                }
                .keyboardShortcut(.return, modifiers: [.command])
                .disabled(model.isLoading)
            }

            if let err = model.errorMessage {
                Text(err)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding()
    }

    private var serviceAccountRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Service Account")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Image(systemName: model.serviceAccountPath.isEmpty ? "key.slash" : "key.fill")
                    .foregroundStyle(model.serviceAccountPath.isEmpty ? Color.secondary : Color.green)
                Text(model.serviceAccountPath.isEmpty
                     ? "ยังไม่ได้เลือกไฟล์"
                     : (model.serviceAccountEmail ?? model.serviceAccountPath))
                    .lineLimit(1).truncationMode(.middle)
                    .textSelection(.enabled)
                Spacer()
                Button("เลือกไฟล์…") { model.pickServiceAccount() }
            }
        }
    }

    // MARK: - Summary

    private var summaryBar: some View {
        HStack(spacing: 16) {
            summaryCard(
                title: "งานของ \"\(model.nameQuery)\"",
                value: "\(model.matchCount)",
                accent: true
            )
            summaryCard(title: "ทั้งหมด", value: "\(model.totalCount)")

            Divider().frame(height: 36)

            VStack(alignment: .leading, spacing: 4) {
                Text("ชื่อที่ต้องการนับ")
                    .font(.caption).foregroundStyle(.secondary)
                TextField("เช่น POND", text: $model.nameQuery)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 140)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("ค้นจากคอลัมน์")
                    .font(.caption).foregroundStyle(.secondary)
                Picker("", selection: $model.nameColumn) {
                    Text("ทุกคอลัมน์").tag(Int?.none)
                    ForEach(0..<model.columnCount, id: \.self) { col in
                        Text(columnLabel(col)).tag(Int?.some(col))
                    }
                }
                .labelsHidden()
                .frame(width: 160)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                Toggle("เฉพาะงานที่ตรง", isOn: $model.showOnlyMatches)
                    .toggleStyle(.switch)
                Toggle("แสดงตารางเต็ม", isOn: $model.showFullTable)
                    .toggleStyle(.switch)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func summaryCard(title: String, value: String, accent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(accent ? Color.accentColor : Color.primary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(accent ? Color.accentColor.opacity(0.12) : Color.gray.opacity(0.08))
        )
    }

    private func columnLabel(_ col: Int) -> String {
        if model.firstRowIsHeader, col < model.headers.count {
            let h = model.headers[col].trimmingCharacters(in: .whitespacesAndNewlines)
            if !h.isEmpty { return h }
        }
        return "คอลัมน์ \(col + 1)"
    }

    // MARK: - Main content

    @ViewBuilder
    private var content: some View {
        if model.rows.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "doc.text")
                    .font(.system(size: 42))
                    .foregroundStyle(.secondary)
                Text("ยังไม่มีข้อมูล")
                    .foregroundStyle(.secondary)
                Text("วางลิงก์ Google Sheets แล้วกด \"อ่านข้อมูล\"")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                if model.readMode == .publicLink {
                    Text("ชีทต้อง Share เป็น Anyone with the link (Viewer)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            resultTextPanel
        }
    }

    private var resultTextPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(model.showFullTable ? "ตารางทั้งหมด (คัดลอกไป Excel ได้)" : "รายการงาน")
                    .font(.headline)
                Spacer()
                if let notice = model.copyNotice {
                    Text(notice)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button {
                    mainTextView?.selectEntireContents()
                } label: {
                    Label("เลือกทั้งหมด", systemImage: "selection.pin.in.out")
                }
                Button {
                    model.copyMainTextToPasteboard()
                } label: {
                    Label("คัดลอก", systemImage: "doc.on.doc")
                }
                .keyboardShortcut("c", modifiers: [.command, .shift])
            }
            .padding(.horizontal)
            .padding(.vertical, 10)

            SelectableTextView(
                text: model.mainDisplayText,
                font: .monospacedSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)
            ) { textView in
                mainTextView = textView
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(nsColor: .textBackgroundColor))
            .overlay(
                Rectangle()
                    .stroke(Color.gray.opacity(0.25), lineWidth: 1)
            )
            .padding(.horizontal)
            .padding(.bottom, 10)

            Text("ลากเลือกข้อความได้ · ⌘A เลือกทั้งหมด · ⌘C คัดลอก · ⇧⌘C ปุ่มคัดลอก")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .padding(.horizontal)
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
