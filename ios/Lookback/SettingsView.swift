import SwiftUI
import Photos

/// Connection + sync. Lives behind the gear; the paper is the product.
struct SettingsView: View {
    @AppStorage("appToken") private var token = ""
    @AppStorage("serverURL") private var serverURL = Config.defaultServerURL
    @ObservedObject var library: PhotoLibrary
    @ObservedObject var sync: SyncEngine
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $serverURL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    SecureField("App token", text: $token)
                }

                Section("Photos") {
                    if library.isAuthorized {
                        LabeledContent("Access", value: "Granted")
                        LabeledContent("Already synced", value: "\(SyncStore.shared.count)")
                        LabeledContent("Pending (last \(sync.syncWindowDays) days)",
                                       value: "\(sync.pendingCount)")
                    } else {
                        Button("Grant photo access") {
                            Task { await library.requestAccess() }
                        }
                    }
                }

                if library.isAuthorized {
                    Section {
                        switch sync.state {
                        case .uploading(let done, let total, let current):
                            VStack(alignment: .leading, spacing: 4) {
                                ProgressView(value: Double(done), total: Double(max(total, 1)))
                                Text("Uploading \(done + 1) of \(total) (\(current))…")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        case .finished(let uploaded, let failed):
                            Text("✓ Synced \(uploaded)\(failed > 0 ? " · \(failed) failed" : "")")
                                .font(.footnote)
                        case .error(let message):
                            Text("✗ \(message)").font(.footnote).foregroundStyle(.red)
                        case .scanning:
                            Text("Scanning…").font(.footnote).foregroundStyle(.secondary)
                        case .idle:
                            EmptyView()
                        }
                        Button("Sync now") {
                            Task { await sync.sync(serverURL: serverURL, token: token, library: library) }
                        }
                        .disabled(token.isEmpty || isSyncing)
                    } header: {
                        Text("Sync")
                    } footer: {
                        Text("New stories are researched and written after photos upload — give the paper a few minutes, then pull to refresh.")
                    }

                    Section {
                        Text("For hands-free syncing: open **Shortcuts → Automation → +**, pick a trigger (“Time of Day” or “Charger Connects”), choose **Run Immediately**, and add the action **Sync Lookback Photos**. iOS will then sync without you ever opening the app.")
                            .font(.footnote)
                    } header: {
                        Text("Automatic sync")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var isSyncing: Bool {
        if case .uploading = sync.state { return true }
        if case .scanning = sync.state { return true }
        return false
    }
}
