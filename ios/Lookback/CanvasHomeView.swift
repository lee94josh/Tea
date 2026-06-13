import SwiftUI
import UIKit

/// The home screen: a vertical editorial feed. One composed block per story —
/// score circles, a small kind label, a centered headline in mixed display
/// faces, then the photo (half of them lifted out of their backgrounds).
/// The structure repeats; the variety lives in type, photo treatment, and
/// scale. No photo ever appears twice: when two topics share a moment's
/// photos, each takes a different key photo.
struct CanvasHomeView: View {
    @State private var articles: [Article] = []
    @State private var loading = false
    @State private var errorText: String?
    @State private var lastLoaded: Date?

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Self.makeEntries(articles)) { entry in
                    NavigationLink(value: entry.article) {
                        FeedCard(article: entry.article, seed: entry.seed,
                                 keyPhoto: entry.keyPhoto)
                    }
                    .buttonStyle(CardPress())
                    .padding(.bottom, 84 + CGFloat(entry.seed % 32))
                }
            }
            .padding(.top, 32)
            .padding(.bottom, 60)
            .frame(maxWidth: .infinity)
        }
        .background(Typeface.paper.ignoresSafeArea())
        .overlay { stateOverlay }
        .navigationDestination(for: Article.self) { ArticleReaderView(article: $0) }
        .toolbarBackground(Typeface.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .refreshable { await load() }
        .task {
            if articles.isEmpty || (lastLoaded.map { Date().timeIntervalSince($0) > 300 } ?? true) {
                await load()
            }
        }
    }

    @ViewBuilder private var stateOverlay: some View {
        if let errorText, articles.isEmpty {
            message("Couldn't load", errorText)
        } else if articles.isEmpty && loading {
            ProgressView().controlSize(.large).tint(Typeface.ink)
        } else if articles.isEmpty {
            message("No stories yet",
                    "Sync some photos from the gear, and stories will appear here as research finishes.")
        }
    }

    private func message(_ title: String, _ body: String) -> some View {
        VStack(spacing: 8) {
            Text(title).font(Typeface.serif(22)).foregroundStyle(Typeface.ink)
            Text(body)
                .font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await API.articles()
            let isNew = fresh.map(\.id) != articles.map(\.id)
            withAnimation(.easeOut(duration: 0.25)) {
                articles = fresh
                errorText = nil
            }
            lastLoaded = Date()
            if isNew && !fresh.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        } catch {
            if articles.isEmpty { errorText = error.localizedDescription }
        }
    }

    // MARK: feed assembly

    struct Entry: Identifiable {
        let article: Article
        let seed: Int
        /// The one photo this story leads with — globally unique in the feed.
        /// nil = every photo in this story already appeared above; run text-only.
        let keyPhoto: PhotoRef?
        var id: String { article.id }
    }

    /// Best stories first, and every photo used at most once across the whole
    /// feed. Assignment runs most-constrained-first — a story with one photo
    /// picks before a story with five — so nobody goes photoless just because
    /// a richer story upstream grabbed their only shot.
    static func makeEntries(_ articles: [Article]) -> [Entry] {
        let ranked = articles.sorted { ($0.score ?? -1) > ($1.score ?? -1) }
        var assigned: [String: PhotoRef] = [:]
        var used = Set<String>()
        for a in ranked.sorted(by: { $0.photos.count < $1.photos.count }) {
            if let p = a.photos.first(where: { !used.contains($0.id) }) {
                assigned[a.id] = p
                used.insert(p.id)
            }
        }
        return ranked.map {
            Entry(article: $0, seed: stableSeed($0.id), keyPhoto: assigned[$0.id])
        }
    }

    /// An index entry is a title, not a sentence. Cut at the first clause
    /// break; failing that, before the first "and"; never end on a connective
    /// ("…THE SYMBOLISM OF" is a typesetting crime). The full headline still
    /// opens the reader.
    static func indexTitle(_ headline: String) -> String {
        let breaks: Set<Character> = [",", ":", ";", "—", "–"]
        var words: [String]
        if let idx = headline.firstIndex(where: { breaks.contains($0) }),
           headline[..<idx].split(separator: " ").count >= 2 {
            words = headline[..<idx].split(separator: " ").map(String.init)
        } else {
            words = headline.split(separator: " ").map(String.init)
            // "X and Y" headlines: the first half is the title.
            if let cut = words.dropFirst(2).firstIndex(where: {
                $0.lowercased() == "and" || $0 == "&"
            }), cut >= 3 {
                words = Array(words[..<cut])
            } else if words.count > 8 {
                words = Array(words.prefix(8))
            }
        }
        let connectives: Set<String> = ["and", "of", "the", "a", "an", "at", "in",
                                        "on", "for", "with", "to", "its", "from"]
        while words.count > 2, let last = words.last,
              connectives.contains(last.lowercased()) {
            words.removeLast()
        }
        return words.joined(separator: " ")
    }
}

/// Deterministic 31-bit hash (FNV-1a) so a story's fonts and photo treatment
/// stay put across launches (Swift's String.hashValue is per-process).
func stableSeed(_ s: String) -> Int {
    var h: UInt64 = 1469598103934665603
    for b in s.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
    return Int(h & 0x7fffffff)
}

private struct CardPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - One story block

/// The block the whole feed is built from — the centered composition:
/// score circles, kind, headline, photo. Always in that order; the eye
/// learns the rhythm and the content carries the variety.
private struct FeedCard: View {
    let article: Article
    let seed: Int
    let keyPhoto: PhotoRef?

    var body: some View {
        VStack(spacing: 0) {
            // No score yet → no badge. Honest beats decorative.
            if let score = article.score {
                ScoreBadge(value: score)
                    .padding(.bottom, 14)
            }
            Text(kindLabel(article.kind))
                .font(Typeface.serif(15))
                .foregroundStyle(Typeface.ink.opacity(0.55))
                .padding(.bottom, 10)
            MagazineHeadline(text: CanvasHomeView.indexTitle(article.headline), seed: seed)
                .padding(.bottom, 22)
            photo
        }
        .frame(maxWidth: 380)
        .padding(.horizontal, 24)
    }

    @ViewBuilder private var photo: some View {
        if let keyPhoto,
           let url = API.absoluteURL(keyPhoto.visionUrl ?? keyPhoto.thumbUrl) {
            AnchorImage(url: url,
                        wantsCutout: seed % 2 == 0, // half the feed floats free
                        height: ([210, 260, 330] as [CGFloat])[seed % 3],
                        pill: kindLabel(article.kind).uppercased())
        }
    }
}

/// Two-digit worthiness score, each digit in its own ink circle (zero-padded
/// so it always reads as a pair, like magazine page numbers).
private struct ScoreBadge: View {
    let value: Int
    var body: some View {
        let clamped = min(99, max(0, value))
        let digits = Array(String(format: "%02d", clamped))
        HStack(spacing: 5) {
            ForEach(Array(digits.enumerated()), id: \.offset) { _, d in
                Text(String(d))
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(Typeface.paper)
                    .frame(width: 27, height: 27)
                    .background(Circle().fill(Typeface.ink))
            }
        }
    }
}

/// Centered headline in short stacked lines, the last line in an accent face
/// over a display base — a deterministic font mix per story, drawn from the
/// full set of faces so the feed never feels templated.
private struct MagazineHeadline: View {
    let text: String
    let seed: Int

    var body: some View {
        let lines = Self.split(text.uppercased())
        let size = Self.size(for: lines)
        let (base, accent) = Self.pairing(seed)
        VStack(spacing: 1) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                let isLast = i == lines.count - 1 && lines.count > 1
                Text(line)
                    .font((isLast ? accent : base).font(isLast ? size * 0.92 : size))
                    .foregroundStyle(Typeface.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6) // long lines shrink, never wrap
            }
        }
        .multilineTextAlignment(.center)
    }

    /// Five pairings that all contrast well; the seed picks one for life.
    static func pairing(_ seed: Int) -> (HeadlineFace, HeadlineFace) {
        switch seed % 5 {
        case 0: return (.grotesque, .pixel)
        case 1: return (.condensed, .serifItalic)
        case 2: return (.grotesque, .serifItalic)
        case 3: return (.serif, .pixel)
        default: return (.condensed, .pixel)
        }
    }

    static func size(for lines: [String]) -> CGFloat {
        let longest = lines.map(\.count).max() ?? 0
        if longest > 14 { return 23 }
        if longest > 10 { return 27 }
        return 31
    }

    /// Greedy balance into at most three lines, ~14 chars each.
    static func split(_ s: String) -> [String] {
        let words = s.split(separator: " ").map(String.init)
        guard words.count > 1 else { return words }
        let maxLines = min(3, max(1, Int((Double(s.count) / 14.0).rounded())))
        let budget = Int(ceil(Double(s.count) / Double(maxLines)))
        var lines: [String] = []
        var cur = ""
        for w in words {
            if cur.isEmpty {
                cur = w
            } else if cur.count + 1 + w.count <= budget || lines.count == maxLines - 1 {
                cur += " " + w
            } else {
                lines.append(cur)
                cur = w
            }
        }
        if !cur.isEmpty { lines.append(cur) }
        return lines
    }
}

/// The story's photo: a clean framed image, or — for half the feed, when the
/// on-device lift succeeds — a subject floating free on the paper. Framed
/// photos carry the category pill half-off their corner; cutouts stay bare.
private struct AnchorImage: View {
    let url: URL
    let wantsCutout: Bool
    let height: CGFloat
    let pill: String?

    @State private var cutout: UIImage?
    @State private var tried = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            if wantsCutout, let cutout {
                Image(uiImage: cutout)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 320, maxHeight: height)
                    .shadow(color: .black.opacity(0.16), radius: 9, y: 5)
            } else {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFill()
                    } else {
                        Rectangle().fill(Typeface.ink.opacity(0.06))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(alignment: .topLeading) {
                    if let pill { BubblePill(text: pill).offset(x: -10, y: -11) }
                }
            }
        }
        .task {
            guard wantsCutout, !tried else { return }
            tried = true
            cutout = await SubjectLift.shared.cutout(from: url)
        }
    }
}

/// The outlined category capsule ("PLACE", "FOOD", "HISTORY").
private struct BubblePill: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .kerning(0.5)
            .foregroundStyle(Typeface.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(Typeface.paper))
            .overlay(Capsule().strokeBorder(Typeface.ink.opacity(0.85), lineWidth: 1))
    }
}

/// Our `kind` enum → the lowercase label above a headline.
private func kindLabel(_ kind: String?) -> String {
    switch kind {
    case "place": return "place"
    case "food": return "food"
    case "artwork": return "art"
    case "person": return "profile"
    case "event": return "memory"
    case "history": return "history"
    default: return "note"
    }
}
