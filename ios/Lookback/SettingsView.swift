import SwiftUI
import Photos

/// Connection + sync + under-the-hood pipeline status. Behind the gear.
struct SettingsView: View {
    @AppStorage("appToken") private var token = ""
    @AppStorage("serverURL") private var serverURL = Config.defaultServerURL
    @ObservedObject var library: PhotoLibrary
    @ObservedObject var sync: SyncEngine
    @Environment(\.dismiss) private var dismiss

    @State private var status: PipelineStatus?
    @State private var statusError: String?
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            Form {
                pipelineSection
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
                            sync.maxPerRun = 25
                            Task { await sync.sync(serverURL: serverURL, token: token, library: library) }
                        }
                        .disabled(token.isEmpty || isSyncing)

                        Button("Index everything in window") {
                            // One-shot bulk backfill: drain the whole window so
                            // there's a big, fresh pool for inspiration mode.
                            sync.maxPerRun = 5000
                            Task { await sync.sync(serverURL: serverURL, token: token, library: library) }
                        }
                        .disabled(token.isEmpty || isSyncing)
                    } header: {
                        Text("Sync")
                    } footer: {
                        Text("“Index everything” uploads every photo in the last \(sync.syncWindowDays) days for inspiration mode. New feed stories are researched after upload — give it a few minutes, then pull to refresh.")
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
            .task { startPolling() }
            .onDisappear { pollTask?.cancel() }
            .onChange(of: sync.state) { _, _ in Task { await refreshStatus() } }
        }
    }

    // MARK: under the hood

    @ViewBuilder
    private var pipelineSection: some View {
        Section {
            if let s = status {
                StatRow(label: "Photos synced",
                        value: "\(s.photos.done)",
                        detail: s.photos.processing > 0 ? "\(s.photos.processing) processing" : nil)
                StatRow(label: "Moments",
                        value: "\(s.moments.done)/\(s.moments.total)",
                        detail: (s.moments.pending + s.moments.researching) > 0
                            ? "\(s.moments.pending + s.moments.researching) in research" : nil)
                StatRow(label: "Articles written",
                        value: "\(s.articles.written)",
                        detail: s.articles.pending > 0 ? "\(s.articles.pending) being written" : nil)

                HStack(spacing: 8) {
                    if s.isPaused {
                        Image(systemName: "pause.circle.fill").foregroundStyle(.orange)
                        Text(s.statusText).font(.footnote).foregroundStyle(.secondary)
                    } else if s.working {
                        ProgressView().controlSize(.small)
                        Text(s.statusText).font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        Text(s.statusText).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 2)
            } else if let statusError {
                Text(statusError).font(.footnote).foregroundStyle(.red)
            } else {
                HStack { ProgressView().controlSize(.small); Text("Loading status…").foregroundStyle(.secondary) }
            }
        } header: {
            Text("Under the hood")
        } footer: {
            if let s = status, s.isPaused {
                Text("The AI key hit its daily free-tier limit. Generation resumes automatically when the quota refreshes (or enable billing on the Gemini key to remove the cap).")
            } else if let s = status, s.articles.pending > 0 {
                Text("New articles are written one at a time after research. Pull to refresh the front page as they land.")
            } else {
                Text("Photos → research → one article per worthy topic. This refreshes live while work is in flight.")
            }
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task {
            while !Task.isCancelled {
                await refreshStatus()
                // Poll faster while working, slower when idle.
                let working = status?.working ?? false
                try? await Task.sleep(for: .seconds(working ? 6 : 30))
            }
        }
    }

    private func refreshStatus() async {
        guard !token.isEmpty else { return }
        do {
            status = try await API.pipeline()
            statusError = nil
        } catch {
            if status == nil { statusError = error.localizedDescription }
        }
    }

    private var isSyncing: Bool {
        if case .uploading = sync.state { return true }
        if case .scanning = sync.state { return true }
        return false
    }
}

private struct StatRow: View {
    let label: String
    let value: String
    var detail: String?
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(value).font(.body.monospacedDigit())
                if let detail {
                    Text(detail).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}
