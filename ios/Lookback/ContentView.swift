import SwiftUI
import Photos

/// Phase 1 thin slice: prove the toolchain + the client→server loop.
/// Paste your app token, grant photo access, see recent photos WITH their
/// real GPS/date, and upload the most recent original to the live pipeline.
struct ContentView: View {
    @AppStorage("appToken") private var token = ""
    @AppStorage("serverURL") private var serverURL = Config.defaultServerURL
    @StateObject private var library = PhotoLibrary()
    @StateObject private var sync = SyncEngine()
    @State private var statusText = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("Server URL", text: $serverURL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    SecureField("App token", text: $token)
                }

                Section("Photos") {
                    if library.isAuthorized {
                        Text("\(library.items.count) recent photos")
                            .foregroundStyle(.secondary)
                        ForEach(library.items.prefix(8)) { item in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.creationDate?.formatted(date: .abbreviated, time: .shortened)
                                     ?? "no date")
                                    .font(.callout)
                                Text(item.coordinate.map {
                                    String(format: "GPS  %.4f, %.4f", $0.latitude, $0.longitude)
                                } ?? "no GPS")
                                    .font(.caption)
                                    .foregroundStyle(item.coordinate == nil ? .secondary : .green)
                            }
                        }
                    } else {
                        Button("Grant photo access") {
                            Task { await library.requestAccess() }
                        }
                    }
                }

                Section {
                    Button(busy ? "Uploading…" : "Upload most recent photo") {
                        Task { await uploadLatest() }
                    }
                    .disabled(busy || token.isEmpty || library.items.isEmpty)
                    if !statusText.isEmpty {
                        Text(statusText).font(.footnote)
                    }
                } footer: {
                    Text("Then open the web app (Status / Dev) to watch it flow through the pipeline.")
                }

                if library.isAuthorized {
                    Section("Sync") {
                        HStack {
                            Text("New photos (last \(sync.syncWindowDays) days)")
                            Spacer()
                            Text("\(sync.pendingCount)").foregroundStyle(.secondary)
                        }
                        switch sync.state {
                        case .uploading(let done, let total, let current):
                            VStack(alignment: .leading, spacing: 4) {
                                ProgressView(value: Double(done), total: Double(total))
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
                        Button("Sync new photos") {
                            Task { await sync.sync(serverURL: serverURL, token: token, library: library) }
                        }
                        .disabled(token.isEmpty || isSyncing)
                    } footer: {
                        Text("Capped at \(sync.maxPerRun) per run until on-device triage lands — every upload feeds the research pipeline.")
                    }
                }
            }
            .navigationTitle("Lookback")
            .task {
                library.refresh()
                if library.isAuthorized {
                    sync.startObserving()
                    sync.refreshPendingCount()
                }
            }
        }
    }

    private var isSyncing: Bool {
        if case .uploading = sync.state { return true }
        if case .scanning = sync.state { return true }
        return false
    }

    private func uploadLatest() async {
        guard let item = library.items.first else { return }
        busy = true
        defer { busy = false }
        statusText = "Reading original…"
        guard let (data, filename, mime) = await library.originalData(for: item.asset) else {
            statusText = "Couldn't read photo data"
            return
        }
        statusText = "Uploading \(filename) (\(data.count / 1024) KB)…"
        do {
            let result = try await Uploader.upload(
                serverURL: serverURL, token: token,
                data: data, filename: filename, mime: mime
            )
            statusText = "✓ Uploaded — accepted \(result.accepted.count), rejected \(result.rejected.count)."
        } catch {
            statusText = "✗ \(error.localizedDescription)"
        }
    }
}

#Preview {
    ContentView()
}
