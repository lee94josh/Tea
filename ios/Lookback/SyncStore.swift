import Foundation

/// Persistent record of which photos (PHAsset.localIdentifier) have already
/// been uploaded — so sync only ever sends new ones. Stored as a JSON file in
/// Application Support (survives app restarts; tiny even at thousands of IDs).
final class SyncStore {
    static let shared = SyncStore()

    private let fileURL: URL
    private var uploaded: Set<String>
    private let queue = DispatchQueue(label: "lookback.syncstore")

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("uploaded-assets.json")
        if let data = try? Data(contentsOf: fileURL),
           let ids = try? JSONDecoder().decode(Set<String>.self, from: data) {
            uploaded = ids
        } else {
            uploaded = []
        }
    }

    func contains(_ id: String) -> Bool {
        queue.sync { uploaded.contains(id) }
    }

    func markUploaded(_ id: String) {
        queue.sync {
            uploaded.insert(id)
            persist()
        }
    }

    var count: Int { queue.sync { uploaded.count } }

    /// For testing: forget everything (photos would re-upload).
    func reset() {
        queue.sync {
            uploaded = []
            persist()
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(uploaded) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}
