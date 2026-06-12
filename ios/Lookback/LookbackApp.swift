import SwiftUI

@main
struct LookbackApp: App {
    init() {
        // Must happen before launch completes.
        BackgroundSync.register()
        // Article images re-load constantly without a real cache; AsyncImage
        // rides URLCache, so give it room (64 MB memory / 256 MB disk).
        URLCache.shared = URLCache(
            memoryCapacity: 64 * 1024 * 1024,
            diskCapacity: 256 * 1024 * 1024
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
