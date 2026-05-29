import SwiftUI

@main
struct SheetsReaderApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup("Google Sheets Reader") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 720, minHeight: 520)
        }
        .windowResizability(.contentMinSize)
    }
}
