import Foundation

// Codable mirrors of the server's JSON (shared/src/index.ts).
// Dates stay ISO strings; views format them.

struct PhotoRef: Codable, Identifiable, Hashable {
    let id: String
    let thumbUrl: String?
    let visionUrl: String?
    let takenAt: String?
}

/// One definitive feature article (the personalized newspaper).
struct Article: Codable, Identifiable, Hashable {
    let id: String
    let momentId: String
    let headline: String
    let dek: String
    let bodyParagraphs: [String]
    let topicName: String
    let kind: String?
    let venueName: String?
    let momentDate: String?
    let generatedAt: String?
    let photos: [PhotoRef]

    /// "June 6, 2026" from the moment's ISO date, for the dateline.
    var dateline: String? {
        guard let iso = momentDate else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return nil }
        return date.formatted(.dateTime.month(.wide).day().year())
    }
}

/// Under-the-hood pipeline status (GET /pipeline).
struct PipelineStatus: Codable {
    struct Photos: Codable { let total, processing, done, error: Int }
    struct Moments: Codable { let total, pending, researching, done: Int }
    struct Topics: Codable { let total: Int }
    struct Articles: Codable { let written, pending: Int }
    let photos: Photos
    let moments: Moments
    let topics: Topics
    let articles: Articles
    let working: Bool
    let etaMinutes: Int?
    let rateLimited: Bool?
    let resumesInMinutes: Int?

    var isPaused: Bool { rateLimited == true }

    var statusText: String {
        if isPaused {
            if let m = resumesInMinutes, m > 0 {
                return m < 60 ? "Paused — daily AI limit reached. Retries in ~\(m) min."
                              : "Paused — daily AI limit reached. Resumes when quota refreshes."
            }
            return "Paused — daily AI limit reached."
        }
        guard working, let m = etaMinutes else { return "Edition up to date" }
        if m < 60 { return "~\(m) min remaining" }
        let h = m / 60, r = m % 60
        return r == 0 ? "~\(h)h remaining" : "~\(h)h \(r)m remaining"
    }
}
