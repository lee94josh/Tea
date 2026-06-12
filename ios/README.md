# Lookback iOS — the personalized newspaper

A bespoke SwiftUI app: open it and read feature articles written from your own
photos. Photos sync in the background (as much as iOS allows); the backend
researches and writes; the front page updates itself.

## Project setup (10 minutes)

> ⚠️ The template matters: pick the **iOS** tab when creating the project.
> (A macOS-template project shows "Custom **macOS** Application Target
> Properties" in the Info tab and fails with ~15 iOS-API errors.)

1. **Create the project**: Xcode → File → New → Project → **iOS** → **App**.
   Name: `Look` (anything works) · Interface: **SwiftUI** · Language: Swift.
   Save anywhere (inside this `ios/` folder keeps things tidy).

2. **Remove the two template files**: right-click `ContentView.swift` and
   `LookApp.swift` (or `<Name>App.swift`) in the sidebar → Delete → **Move to
   Trash**. (My `LookbackApp.swift` has the app's one `@main` entry point.)

3. **Add the source files**: in Finder open `Tea/ios/Lookback/`, select **all
   .swift files** (⌘A), drag onto the yellow project folder in Xcode's sidebar.
   In the dialog: ✅ Copy items if needed · ✅ Add to target.

4. **Target → Info tab** (blue project icon → TARGETS → your target → Info).
   It should read "Custom **iOS** Target Properties". Add **two** entries
   (hover a row → +):
   - `Privacy - Photo Library Usage Description` →
     `Lookback reads your photos to find stories worth writing.`
   - `Permitted background task scheduler identifiers` → type
     **BGTaskSchedulerPermittedIdentifiers** (it becomes an Array) → add two
     items: `com.lookback.refresh` and `com.lookback.processing`

5. **Target → Signing & Capabilities tab**:
   - Team: your Personal Team (sign into Xcode with your Apple ID if empty).
   - **+ Capability** → **Background Modes** → check ✅ *Background fetch* and
     ✅ *Background processing*.

6. **Run**: plug in the iPhone, pick it as the destination (not "My Mac"), ▶.
   First time: enable Developer Mode on the phone (Settings → Privacy &
   Security) and trust the cert (Settings → General → VPN & Device Management).

### If the build floods with "concurrency" / "Sendable" errors
New Xcode templates sometimes default to Swift 6 strict mode. Fix: target →
Build Settings → search "Swift Language Version" → set **Swift 5**.

## Using it

- First run: paste the app token → **Start the presses** → allow Full photo
  access. The paper appears as articles finish writing (pull to refresh).
- The gear (top right) has server/token, sync status, and **Sync now**.

## Hands-free syncing (recommended, one-time)

iOS forbids continuous background scanning, but Shortcuts **automations run
App Intents without opening the app**:

1. Shortcuts app → **Automation** → **+**
2. Trigger: **Time of Day** (e.g. 7:30 AM, repeats daily) — and add a second
   one for **Charger** (When connected).
3. Choose **Run Immediately** (no confirmation).
4. Action: search **Sync Lookback Photos**.

Combined with the app's own background tasks (opportunistic; often overnight on
charge) and the quiet top-up sync on every open, this is the practical maximum
"seamless" iOS allows.

## Files

| File | Role |
| --- | --- |
| `LookbackApp.swift` | entry point; registers background tasks; image cache |
| `ContentView.swift` | shell: first-run setup → the paper; settings sheet |
| `PaperView.swift` | the front page (masthead, lead story, story rows) |
| `ArticleReaderView.swift` | the article reading experience |
| `SettingsView.swift` | server/token, sync status & controls |
| `API.swift`, `Models.swift` | backend client + Codable mirrors |
| `PhotoLibrary.swift` | PhotoKit: permission, originals with EXIF intact |
| `Uploader.swift` | multipart upload to `/upload` |
| `SyncStore.swift`, `SyncEngine.swift` | what's-been-sent ledger + sync runs |
| `BackgroundSync.swift` | BGTaskScheduler wiring + headless SyncRunner |
| `SyncIntent.swift` | "Sync Lookback Photos" App Intent for automations |

TestFlight (untethered installs) needs the $99/yr Apple Developer Program —
enroll when ready; nothing else here requires it.
