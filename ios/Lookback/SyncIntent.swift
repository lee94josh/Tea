import AppIntents

/// "Sync Lookback Photos" — exposed to Shortcuts. The seamless-ingestion
/// sleeper: iOS won't let apps run continuously, but Shortcuts AUTOMATIONS run
/// App Intents headlessly, no app launch, no tap (after one-time setup).
///
/// Recommended automations (Shortcuts app → Automation → +):
///   • "At 7:30 AM daily"        → Sync Lookback Photos  (the morning edition)
///   • "When charger connects"   → Sync Lookback Photos  (the overnight sweep)
/// Set each to "Run Immediately" so they don't ask for confirmation.
struct SyncPhotosIntent: AppIntent {
    static var title: LocalizedStringResource = "Sync Lookback Photos"
    static var description = IntentDescription(
        "Uploads new photos to Lookback so fresh articles can be researched and written."
    )
    // Runs in the background; does not open the app.
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = await SyncRunner.run(limit: 20)
        return .result(dialog: IntentDialog(stringLiteral: result.message))
    }
}

/// Surfaces the intent in Shortcuts' gallery with a friendly phrase.
struct LookbackShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SyncPhotosIntent(),
            phrases: ["Sync \(.applicationName) photos"],
            shortTitle: "Sync Photos",
            systemImageName: "arrow.triangle.2.circlepath"
        )
    }
}
