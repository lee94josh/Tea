import Photos
import Foundation
import Combine // ObservableObject/@Published live here

/// Phase 2: incremental sync. Finds photos not yet uploaded, sends originals
/// (EXIF intact) to the existing /upload endpoint one at a time, and records
/// them so they're never re-sent. Also observes the library so photos taken
/// while the app is open are picked up.
///
/// Cost guardrails (important): every uploaded photo flows into the Gemini
/// research pipeline. Until on-device triage (Phase 4) filters first, sync
/// deliberately limits itself to a recent window and a per-run cap rather than
/// blasting an entire library into the pipeline.
@MainActor
final class SyncEngine: NSObject, ObservableObject {
    enum State: Equatable {
        case idle
        case scanning
        case uploading(done: Int, total: Int, current: String)
        case finished(uploaded: Int, failed: Int)
        case error(String)
    }

    @Published var state: State = .idle
    @Published var pendingCount = 0

    /// Only consider photos taken in the last N days (cost guardrail).
    var syncWindowDays = 30
    /// Max uploads per run (cost guardrail; run sync again for more).
    var maxPerRun = 25

    private var observing = false

    // MARK: scan

    /// Photos inside the window that haven't been uploaded yet, oldest first
    /// (so moments form in chronological order server-side).
    func pendingAssets() -> [PHAsset] {
        let options = PHFetchOptions()
        let cutoff = Calendar.current.date(byAdding: .day, value: -syncWindowDays, to: Date())!
        options.predicate = NSPredicate(format: "creationDate > %@", cutoff as NSDate)
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        let result = PHAsset.fetchAssets(with: .image, options: options)

        var out: [PHAsset] = []
        result.enumerateObjects { asset, _, _ in
            if !SyncStore.shared.contains(asset.localIdentifier) {
                out.append(asset)
            }
        }
        return out
    }

    func refreshPendingCount() {
        state = .scanning
        let pending = pendingAssets()
        pendingCount = pending.count
        state = .idle
    }

    // MARK: sync

    func sync(serverURL: String, token: String, library: PhotoLibrary) async {
        guard !token.isEmpty else {
            state = .error("Set the app token first")
            return
        }
        state = .scanning
        let pending = Array(pendingAssets().prefix(maxPerRun))
        pendingCount = pending.count
        guard !pending.isEmpty else {
            state = .finished(uploaded: 0, failed: 0)
            return
        }

        var uploaded = 0
        var failed = 0
        for (i, asset) in pending.enumerated() {
            state = .uploading(done: i, total: pending.count,
                               current: asset.creationDate?.formatted(date: .abbreviated, time: .omitted) ?? "photo")
            guard let (data, filename, mime) = await library.originalData(for: asset) else {
                failed += 1
                continue
            }
            do {
                let result = try await Uploader.upload(
                    serverURL: serverURL, token: token,
                    data: data, filename: filename, mime: mime
                )
                if result.accepted.count > 0 {
                    SyncStore.shared.markUploaded(asset.localIdentifier)
                    uploaded += 1
                } else {
                    failed += 1
                }
            } catch {
                failed += 1
                // Network/server problem: stop the run rather than fail down the list.
                if (error as NSError).domain == NSURLErrorDomain { break }
            }
        }
        pendingCount = pendingAssets().count
        state = .finished(uploaded: uploaded, failed: failed)
    }

    // MARK: library observation (photos taken while the app is open)

    func startObserving() {
        guard !observing else { return }
        observing = true
        PHPhotoLibrary.shared().register(self)
    }

    deinit {
        PHPhotoLibrary.shared().unregisterChangeObserver(self)
    }
}

extension SyncEngine: PHPhotoLibraryChangeObserver {
    nonisolated func photoLibraryDidChange(_ changeInstance: PHChange) {
        Task { @MainActor in
            self.refreshPendingCount()
        }
    }
}
