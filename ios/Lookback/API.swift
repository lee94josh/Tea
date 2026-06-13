import Foundation

/// Thin client for the Lookback backend. Token + server come from
/// UserDefaults (same keys the settings UI writes via @AppStorage).
enum API {
    static var serverURL: String {
        let s = UserDefaults.standard.string(forKey: "serverURL") ?? Config.defaultServerURL
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
    }
    static var token: String {
        UserDefaults.standard.string(forKey: "appToken") ?? ""
    }

    /// Photo URLs from the server may be relative ("/files/…?token=…").
    static func absoluteURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: serverURL + path)
    }

    /// Shared GET helper: auth header, status check, JSON decode.
    private static func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: serverURL + path) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "Lookback", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Server error: \(text.prefix(120))"])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func articles() async throws -> [Article] { try await get("/articles") }
    static func pipeline() async throws -> PipelineStatus { try await get("/pipeline") }

    /// Rate an article 1–5 (1 = best). Fire-and-forget friendly; throws on failure.
    static func rate(articleId: String, rating: Int) async throws {
        guard let url = URL(string: serverURL + "/articles/\(articleId)/rating") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["rating": rating])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "Lookback", code: 3,
                          userInfo: [NSLocalizedDescriptionKey: "Server error: \(text.prefix(120))"])
        }
    }
}
