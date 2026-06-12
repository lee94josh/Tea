# Lookback iOS — build plan

The iOS app is a **client of the existing backend** (Fastify + pg-boss + Gemini),
plus a new **on-device triage** layer. The server does the expensive thinking;
the phone decides *what's worth sending*.

Target: iPhone 17 Pro, SwiftUI, iOS 26+. Apple Intelligence available, so the
on-device Foundation Models LLM is on the table for triage (Phase 4).

## The one hard constraint

iOS does **not** allow continuous background scanning. Realistic model:
- **Process-on-open** — the reliable workhorse; sweep new photos when foregrounded.
- **`BGProcessingTask`** — minutes of work, opportunistic, usually while charging
  overnight. Good for daily catch-up. Not on-demand, not every-N-hours.
- **`BGAppRefreshTask`** — ~30s, sparse, iOS-scheduled.

Design for "eventually consistent within a day," not "live."

## Phases

### Phase 1 — thin vertical slice (DONE, in ios/Lookback) ✅
SwiftUI app: request PhotoKit access, list recent photos with real GPS/date,
upload one original (EXIF intact) to `/upload`, watch it flow through the
pipeline. Proves the toolchain (Xcode, signing, PhotoKit, device run) and the
client→server loop. Ship this to your phone first; everything else builds on it.

### Phase 2 — sync engine (code written, pending first device build) ✅
Track which `PHAsset.localIdentifier`s have been uploaded (local store). On app
open, upload new originals (with metadata) that aren't yet processed. Add a
`PHPhotoLibraryChangeObserver` to catch additions while running. Show progress.

### Phase 3 — background catch-up
Register a `BGProcessingTask` (require network; prefer power) to upload/triage
the backlog overnight. Add `BGAppRefreshTask` for light top-ups. Accept that
scheduling is opportunistic.

### Phase 4 — on-device triage (the cost/privacy win)
Before upload, filter + cluster locally so only interesting moments leave the phone:
- **Vision**: `VNRecognizeTextRequest` (read menus/signs), scene/object
  classification, face clustering, `VNGenerateImageFeaturePrintRequest`
  (embeddings → on-device moment clustering).
- **Foundation Models** (iOS 26, A19): on-device "is this interesting / what's
  the gist?" first pass. Skip screenshots, receipts, random utility shots.
Only genuinely interesting moments get their originals uploaded for the server's
Gemini research + conversation generation.

### Phase 5 — native views
Rebuild Talk / Feed / Discover / Fun Facts natively against the existing JSON
APIs (or webview them initially to move fast, then nativize).

## Deferred prerequisites
- Apple Developer Program ($99/yr): needed for TestFlight + push. Enroll when
  Phase 1 runs on your phone and you want it untethered.
- Per-user auth: current single `APP_TOKEN` is fine for personal use.
- App Store review concerns (full-library access + background purpose strings):
  later, not a TestFlight blocker.
