import SwiftUI
import Photos

/// App shell: the paper IS the app. Setup appears only when unconfigured;
/// settings live behind the gear. Background sync gets scheduled whenever we
/// leave the foreground; a quiet top-up sync runs on every return.
struct ContentView: View {
    @AppStorage("appToken") private var token = ""
    @AppStorage("serverURL") private var serverURL = Config.defaultServerURL
    @StateObject private var library = PhotoLibrary()
    @StateObject private var sync = SyncEngine()
    @State private var showSettings = false
    @Environment(\.scenePhase) private var scenePhase

    /// Headless sync, matching the per-run cap used everywhere else. Skips
    /// silently when unconfigured; SyncRunner already dedupes via the ledger.
    private func kickQuietSync() {
        guard !token.isEmpty, library.isAuthorized else { return }
        Task.detached(priority: .utility) {
            _ = await SyncRunner.run(limit: 25)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if token.isEmpty {
                    FirstRunView(token: $token, serverURL: $serverURL, library: library)
                } else {
                    CanvasHomeView()
                }
            }
            .toolbar {
                if !token.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .tint(.primary)
                    }
                }
            }
        }
        .tint(.primary)
        .sheet(isPresented: $showSettings) {
            SettingsView(library: library, sync: sync)
        }
        .task {
            library.refresh()
            if library.isAuthorized {
                sync.startObserving()
                sync.refreshPendingCount()
            }
            // Cold launch counts as "opening the app": kick a quiet sync so
            // photos flow without ever visiting Settings.
            kickQuietSync()
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                BackgroundSync.scheduleAll()
            case .active:
                // Every return to the foreground tops up quietly, no UI. New
                // articles arrive on the next pull-to-refresh once research
                // finishes.
                kickQuietSync()
            default:
                break
            }
        }
    }
}

/// One-screen onboarding: token, photo access, done. No tabs, no tour.
private struct FirstRunView: View {
    @Binding var token: String
    @Binding var serverURL: String
    @ObservedObject var library: PhotoLibrary
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer()
            Text("LOOKBACK")
                .font(.system(size: 40, weight: .black, design: .serif))
                .kerning(2)
            Text("A newspaper written from your photos.")
                .font(.system(.title3, design: .serif))
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 10) {
                SecureField("App token", text: $draft)
                    .textFieldStyle(.roundedBorder)
                Button {
                    token = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { await library.requestAccess() }
                } label: {
                    Text("Start the presses")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.primary)
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            Spacer()
            Spacer()
        }
        .padding(28)
    }
}

#Preview {
    ContentView()
}
