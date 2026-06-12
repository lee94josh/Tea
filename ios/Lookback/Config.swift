import Foundation

/// Connection config. No secrets in source — the app token is entered in the
/// app and stored on-device (UserDefaults via @AppStorage), like the web
/// token gate. The repo is public, so never hardcode the token here.
enum Config {
    static let defaultServerURL = "https://lookback-production.up.railway.app"
}
