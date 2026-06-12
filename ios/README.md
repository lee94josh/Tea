# Lookback iOS — getting started

Phase 1: a SwiftUI app that reads your photos (with real GPS/date) and uploads
one to the live backend. Run it on your iPhone to prove the whole toolchain.

## One-time setup

1. **Install Xcode** from the Mac App Store, then sign in: Xcode → Settings →
   Accounts → add your Apple ID (free "Personal Team" is enough to run on your
   own device).

2. **Create the project** (Xcode handles signing + Info.plist so you don't fight
   it by hand):
   - Xcode → File → New → Project → iOS → **App** → Next
   - Product Name: **Lookback**, Interface: **SwiftUI**, Language: **Swift**
   - Save it inside this `ios/` folder
   - Delete the auto-generated `ContentView.swift` and `LookbackApp.swift`

3. **Add the source files**: drag the four files in `ios/Lookback/`
   (`LookbackApp.swift`, `ContentView.swift`, `PhotoLibrary.swift`,
   `Uploader.swift`, `Config.swift`) into the project navigator
   ("Copy items if needed" can be off since they're already in the folder).

4. **Add the photo-permission string**: select the project → your target →
   **Info** tab → add a row:
   - Key: **Privacy - Photo Library Usage Description**
     (`NSPhotoLibraryUsageDescription`)
   - Value: `Lookback reads your photos to find moments worth talking about.`

5. **Run on your phone**: plug in your iPhone, select it as the run target, hit
   ▶. First run: on the phone, Settings → General → VPN & Device Management →
   trust your developer certificate.

## Use it

1. Paste your **app token** into the Server section.
2. Tap **Grant photo access** → "Allow Full Access".
3. You'll see recent photos with their **GPS + date** (native = metadata intact).
4. Tap **Upload most recent photo**, then open the web app's **Status/Dev** tab
   to watch it move through the existing pipeline.

That's the full client→server loop on real hardware. Next: `ios/PLAN.md` Phase 2.

## Notes
- No secrets in source — the token is stored on-device via `@AppStorage`.
- Free Apple ID runs on-device for 7 days, then re-run from Xcode. TestFlight
  (untethered) needs the $99/yr Apple Developer Program.
