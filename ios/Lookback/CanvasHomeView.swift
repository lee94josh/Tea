import SwiftUI
import UIKit

/// The home screen: not a newspaper but a canvas. Articles are scattered across
/// a plane wider and taller than the screen; you open at the top-center (the
/// strongest pieces) and pan in any direction to roam. Each card anchors on a
/// photo, wears its worthiness score in little circles, a category bubble, and
/// a headline set in mixed display fonts — the magazine-index look.
struct CanvasHomeView: View {
    @State private var articles: [Article] = []
    @State private var loading = false
    @State private var errorText: String?
    @State private var lastLoaded: Date?

    var body: some View {
        GeometryReader { geo in
            let placements = Self.layout(articles, screenW: geo.size.width)
            let canvas = Self.canvasSize(placements, screenW: geo.size.width)
            ScrollView([.horizontal, .vertical], showsIndicators: false) {
                ZStack(alignment: .topLeading) {
                    ForEach(placements) { p in
                        NavigationLink(value: p.article) {
                            ArticleCard(article: p.article, seed: p.seed,
                                        width: p.size.width)
                        }
                        .buttonStyle(CardPress())
                        .rotationEffect(.degrees(p.rotation))
                        .position(p.center)
                    }
                }
                .frame(width: canvas.width, height: canvas.height, alignment: .topLeading)
            }
            .defaultScrollAnchor(UnitPoint(x: 0.5, y: 0))
            .background(Typeface.paper.ignoresSafeArea())
            .overlay { stateOverlay }
        }
        .navigationDestination(for: Article.self) { ArticleReaderView(article: $0) }
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("LOOKBACK")
                    .font(.system(size: 17, weight: .black, design: .serif))
                    .kerning(2)
                    .foregroundStyle(Typeface.ink)
            }
        }
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
                    "Sync some photos from the gear, and cards will appear here as research finishes.")
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

    // MARK: layout

    struct Placement: Identifiable {
        let id: String
        let article: Article
        let center: CGPoint
        let size: CGSize
        let seed: Int
        let rotation: Double
    }

    /// Masonry over three columns on a plane ~2.1× the screen wide. Entries are
    /// small and the space between them is large — the reference index works
    /// because the whitespace outweighs the content. Columns start staggered so
    /// nothing reads as a row; the strongest article seeds the center column
    /// (the top-center start); the rest drop into whichever column is shortest.
    static func layout(_ articles: [Article], screenW: CGFloat) -> [Placement] {
        guard !articles.isEmpty, screenW > 0 else { return [] }
        let canvasW = screenW * 2.1
        let cols = [0.18, 0.5, 0.82].map { canvasW * CGFloat($0) }
        let topPad: CGFloat = 160
        var colY: [CGFloat] = [topPad + 130, topPad, topPad + 230]

        let ranked = articles.sorted { ($0.score ?? -1) > ($1.score ?? -1) }
        var out: [Placement] = []
        for (i, a) in ranked.enumerated() {
            let seed = stableSeed(a.id)
            // Three card sizes, so the canvas reads hand-set, not gridded.
            let cardW = ([152, 176, 198] as [CGFloat])[seed % 3]
            let h = estimatedHeight(a, seed: seed)
            let col = i == 0 ? 1 : (colY.indices.min { colY[$0] < colY[$1] } ?? 0)
            let jitterX = CGFloat((seed % 25) - 12) // small — never enough to touch a neighbor
            let center = CGPoint(x: cols[col] + jitterX, y: colY[col] + h / 2)
            let rot = (Double(seed % 17) - 8) / 10.0 // ±0.8°
            out.append(Placement(id: a.id, article: a, center: center,
                                 size: CGSize(width: cardW, height: h), seed: seed, rotation: rot))
            // The 2:1 rhythm — every entry is followed by at least half its own
            // height in empty paper, so a third of each column is air.
            colY[col] += h + max(96, h * 0.5) + CGFloat(seed % 33)
        }
        return out
    }

    static func canvasSize(_ placements: [Placement], screenW: CGFloat) -> CGSize {
        let bottom = placements.map { $0.center.y + $0.size.height / 2 }.max() ?? screenW
        return CGSize(width: screenW * 2.1, height: bottom + 220)
    }

    /// What the card will actually occupy, computed from its content (line
    /// count, image treatment) so entries never collide — fixed guesses did.
    static func estimatedHeight(_ a: Article, seed: Int) -> CGFloat {
        let lines = MagazineHeadline.split(indexTitle(a.headline).uppercased())
        let size = MagazineHeadline.size(for: lines)
        var h: CGFloat = 21 + 6 + 14 + 6 // score badge + kind label + spacing
        h += CGFloat(lines.count) * size * 1.18
        if a.photos.first != nil {
            let stamp = ([64, 78, 92] as [CGFloat])[seed % 3]
            h += 12 + (seed % 3 == 0 ? stamp + 24 : stamp) // cutouts float a little taller
        }
        return h
    }

    /// An index entry is a title, not a sentence. Cut at the first clause break
    /// ("Wimbledon Centre Court, and the year-round…" → "WIMBLEDON CENTRE
    /// COURT"); the full headline still opens the reader.
    static func indexTitle(_ headline: String) -> String {
        let breaks: Set<Character> = [",", ":", ";", "—", "–"]
        if let idx = headline.firstIndex(where: { breaks.contains($0) }) {
            let clause = headline[..<idx].trimmingCharacters(in: .whitespaces)
            if clause.split(separator: " ").count >= 2 { return clause }
        }
        let words = headline.split(separator: " ")
        return words.count <= 7 ? headline : words.prefix(7).joined(separator: " ")
    }
}

/// Deterministic 31-bit hash (FNV-1a) so a card's layout, fonts, and image
/// treatment stay put across launches (Swift's String.hashValue is per-process).
func stableSeed(_ s: String) -> Int {
    var h: UInt64 = 1469598103934665603
    for b in s.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
    return Int(h & 0x7fffffff)
}

private struct CardPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - One card

private struct ArticleCard: View {
    let article: Article
    let seed: Int
    let width: CGFloat

    /// ~40% of entries are center-set, like the reference index — the mix of
    /// ragged-left and centered is most of what makes it feel hand-composed.
    private var centered: Bool { seed % 5 >= 3 }

    var body: some View {
        let imageOnTop = seed % 2 == 0
        let wantsCutout = seed % 3 == 0
        VStack(alignment: centered ? .center : .leading, spacing: 12) {
            if imageOnTop {
                anchor(wantsCutout)
                textBlock
            } else {
                textBlock
                anchor(wantsCutout)
            }
        }
        .frame(width: width, alignment: .top)
    }

    private var textBlock: some View {
        VStack(alignment: centered ? .center : .leading, spacing: 6) {
            ScoreBadge(value: article.score ?? (40 + seed % 55))
            Text(kindLabel(article.kind))
                .font(Typeface.serif(11))
                .foregroundStyle(Typeface.ink.opacity(0.65))
            MagazineHeadline(text: CanvasHomeView.indexTitle(article.headline),
                             seed: seed, centered: centered)
        }
    }

    /// Stamp-sized, like the reference — the photo is a marginal note beside
    /// the title, not a billboard. Stamps come in three heights, drift to
    /// either edge (or sit centered), and only every other one carries the
    /// category pill (the tiny kind label above the title already says it).
    @ViewBuilder private func anchor(_ wantsCutout: Bool) -> some View {
        if let url = API.absoluteURL(article.photos.first?.visionUrl ?? article.photos.first?.thumbUrl) {
            let stampH = ([64, 78, 92] as [CGFloat])[seed % 3]
            AnchorImage(url: url, wantsCutout: wantsCutout,
                        width: min(150, width * 0.82), height: stampH,
                        pill: seed % 2 == 1 ? kindLabel(article.kind).uppercased() : nil)
                .frame(maxWidth: .infinity,
                       alignment: centered ? .center : (seed % 4 < 2 ? .leading : .trailing))
        }
    }
}

/// Two-digit worthiness score, each digit in its own ink circle (zero-padded so
/// it always reads as a pair, like the magazine page numbers).
private struct ScoreBadge: View {
    let value: Int
    var body: some View {
        let clamped = min(99, max(0, value))
        let digits = Array(String(format: "%02d", clamped))
        HStack(spacing: 4) {
            ForEach(Array(digits.enumerated()), id: \.offset) { _, d in
                Text(String(d))
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Typeface.paper)
                    .frame(width: 21, height: 21)
                    .background(Circle().fill(Typeface.ink))
            }
        }
    }
}

/// Headline split into short stacked lines, with the last line set in an accent
/// face (serif-italic or bitmap) over a grotesque/condensed base — a font mix
/// per card, chosen deterministically so it never reshuffles.
private struct MagazineHeadline: View {
    let text: String
    let seed: Int
    var centered: Bool = false

    var body: some View {
        let lines = Self.split(text.uppercased())
        let size = Self.size(for: lines)
        let base: HeadlineFace = seed % 5 == 0 ? .condensed : .grotesque
        let accent: HeadlineFace = seed % 2 == 0 ? .serifItalic : .pixel
        VStack(alignment: centered ? .center : .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                let isLast = i == lines.count - 1 && lines.count > 1
                Text(line)
                    .font((isLast ? accent : base).font(size))
                    .foregroundStyle(Typeface.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6) // a long line shrinks, never wraps —
                                             // wrapping would break the height estimate
            }
        }
    }

    static func size(for lines: [String]) -> CGFloat {
        let longest = lines.map(\.count).max() ?? 0
        if longest > 12 { return 15 }
        if longest > 8 { return 18 }
        return 21
    }

    /// Greedy balance into at most three lines, ~13 chars each.
    static func split(_ s: String) -> [String] {
        let words = s.split(separator: " ").map(String.init)
        guard words.count > 1 else { return words }
        let maxLines = min(3, max(1, Int((Double(s.count) / 13.0).rounded())))
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

/// The anchor photo: a framed inset, or — when chosen and the lift succeeds — a
/// background-knocked-out cut-out floating on the canvas. A category bubble
/// pins to the top-left.
private struct AnchorImage: View {
    let url: URL
    let wantsCutout: Bool
    let width: CGFloat
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
                    // Both axes capped — a wide subject must not bleed into
                    // the neighboring column.
                    .frame(maxWidth: width + 16, maxHeight: height + 24)
                    .shadow(color: .black.opacity(0.18), radius: 7, y: 4)
            } else {
                AsyncImage(url: url) { phase in
                    if case .success(let img) = phase {
                        img.resizable().scaledToFill()
                    } else {
                        Rectangle().fill(Typeface.ink.opacity(0.06))
                    }
                }
                .frame(width: width, height: height)
                .clipShape(RoundedRectangle(cornerRadius: 2))
            }
            // Half-on the corner, like the reference's tags.
            if let pill { BubblePill(text: pill).offset(x: -9, y: -9) }
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
            .font(.system(size: 9, weight: .semibold))
            .kerning(0.5)
            .foregroundStyle(Typeface.ink)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
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
