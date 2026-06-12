import Foundation
import BackgroundTasks
import Photos

/// Every legal lever iOS gives us for "scan without the user opening the app":
///
/// 1. BGAppRefreshTask  — ~30s, opportunistic, a few times a day if iOS feels
///    like it. We use it to top-up a handful of photos.
/// 2. BGProcessingTask  — minutes of work, usually overnight on charge. The
///    nightly edition: uploads the day's backlog.
/// 3. App Intent (SyncIntent.swift) — the sleeper: Shortcuts AUTOMATIONS can
///    run it headlessly ("every day 7am", "when charger connects") with no
///    user interaction after one-time setup.
/// 4. Foreground: quiet auto-sync on open + PHPhotoLibraryChangeObserver.
///
/// Both task identifiers MUST be listed in Info.plist under
/// "Permitted background task scheduler identifiers", and Background Modes
/// (fetch + processing) enabled in Signing & Capabilities. See ios/README.md.
enum BackgroundSync {
    static let refreshID = "com.lookback.refresh"
    static let processingID = "com.lookback.processing"

    /// Call once, early in app launch (before didFinishLaunching returns).
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshID, using: nil) { task in
            handle(task: task, limit: 5)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: processingID, using: nil) { task in
            handle(task: task, limit: 40)
        }
    }

    /// (Re)schedule both. Call whenever the app goes to background and after
    /// each background run — schedules don't repeat by themselves.
    static func scheduleAll() {
        let refresh = BGAppRefreshTaskRequest(identifier: refreshID)
        refresh.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(refresh)

        let processing = BGProcessingTaskRequest(identifier: processingID)
        processing.requiresNetworkConnectivity = true
        processing.requiresExternalPower = false // also run un-plugged when iOS allows
        processing.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 60 * 60)
        try? BGTaskScheduler.shared.submit(processing)
    }

    private static func handle(task: BGTask, limit: Int) {
        scheduleAll() // chain the next run first
        let work = Task {
            let result = await SyncRunner.run(limit: limit)
            task.setTaskCompleted(success: result.ok)
        }
        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}

/// Headless sync usable from background tasks, the App Intent, and foreground
/// auto-sync. Skips silently when unauthorized/unconfigured (background code
/// must never prompt).
enum SyncRunner {
    struct Result { let ok: Bool; let uploaded: Int; let message: String }

    static func run(limit: Int) async -> Result {
        let token = UserDefaults.standard.string(forKey: "appToken") ?? ""
        guard !token.isEmpty else { return Result(ok: false, uploaded: 0, message: "No token set") }
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            return Result(ok: false, uploaded: 0, message: "Photos not authorized")
        }

        let server = UserDefaults.standard.string(forKey: "serverURL") ?? Config.defaultServerURL

        let engine = await MainActor.run { () -> SyncEngine in
            let e = SyncEngine()
            e.maxPerRun = limit
            return e
        }
        let library = await MainActor.run { PhotoLibrary() }

        await engine.sync(serverURL: server, token: token, library: library)

        let state = await MainActor.run { engine.state }
        if case .finished(let uploaded, let failed) = state {
            return Result(ok: true, uploaded: uploaded,
                          message: "Uploaded \(uploaded)\(failed > 0 ? ", \(failed) failed" : "")")
        }
        return Result(ok: false, uploaded: 0, message: "Sync did not finish")
    }
}
