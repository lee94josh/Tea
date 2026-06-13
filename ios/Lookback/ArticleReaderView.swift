import SwiftUI

/// The reading experience: photos small at the top, then the ~500-word piece
/// in serif with generous leading. Sparse — the words carry it.
struct ArticleReaderView: View {
    let article: Article

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Your photos, small, at the top — the reason this article exists.
                if !article.photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(article.photos) { photo in
                                if let url = API.absoluteURL(photo.thumbUrl ?? photo.visionUrl) {
                                    ArticleImage(url: url, height: 96)
                                        .frame(width: 96)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                }

                VStack(alignment: .leading, spacing: 14) {
                    KindTag(kind: article.kind, venue: article.venueName)

                    Text(article.headline)
                        .font(.system(size: 30, weight: .bold, design: .serif))
                        .foregroundStyle(Typeface.ink)
                        .lineSpacing(3)

                    if !article.dek.isEmpty {
                        Text(article.dek)
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(Typeface.ink.opacity(0.6))
                            .lineSpacing(3)
                    }

                    if let dateline = article.dateline {
                        Text("From your photos · \(dateline)")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .textCase(.uppercase)
                            .kerning(0.5)
                    }

                    Rectangle()
                        .frame(width: 48, height: 2)
                        .padding(.vertical, 4)

                    ForEach(Array(article.bodyParagraphs.enumerated()), id: \.offset) { index, paragraph in
                        if isBullet(paragraph) {
                            bulletRow(paragraph)
                        } else if index == 0 {
                            leadParagraph(paragraph)
                        } else {
                            Text(paragraph)
                                .font(.system(size: 17, design: .serif))
                                .foregroundStyle(Typeface.ink)
                                .lineSpacing(6)
                        }
                    }

                    Text("◼︎")
                        .font(.caption2)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 8)
                        .foregroundStyle(.secondary)

                    TierRatingView(article: article)
                        .padding(.top, 16)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 640) // readable line length on big phones/landscape
                .frame(maxWidth: .infinity)
            }
        }
        .background(Typeface.paper.ignoresSafeArea())
        .toolbarBackground(Typeface.paper, for: .navigationBar)
        .navigationBarTitleDisplayMode(.inline)
    }

    /// First paragraph opens with a small-caps lead-in — a newspaper signature
    /// without resorting to a (fragile) drop cap.
    private func leadParagraph(_ paragraph: String) -> some View {
        let words = paragraph.split(separator: " ", omittingEmptySubsequences: true)
        let leadCount = min(4, words.count)
        let lead = words.prefix(leadCount).joined(separator: " ").uppercased()
        let rest = words.dropFirst(leadCount).joined(separator: " ")
        // iOS 26 deprecates Text + Text; styled segments via interpolation.
        let leadText = Text(lead)
            .font(.system(size: 15, weight: .semibold, design: .serif))
            .kerning(1.2)
        let restText = Text(rest.isEmpty ? "" : " " + rest)
            .font(.system(size: 17, design: .serif))
        return Text("\(leadText)\(restText)")
            .foregroundStyle(Typeface.ink)
            .lineSpacing(6)
    }

    private func isBullet(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        return t.hasPrefix("•") || t.hasPrefix("- ")
    }

    /// A scannable bullet: a hanging ink dot, then the fact. The model marks the
    /// lead-in with **bold** Markdown; we render it bold and drop the asterisks.
    private func bulletRow(_ paragraph: String) -> some View {
        var text = paragraph.trimmingCharacters(in: .whitespaces)
        for prefix in ["•", "-"] where text.hasPrefix(prefix) {
            text = String(text.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
        }
        let opts = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace)
        let styled = (try? AttributedString(markdown: text, options: opts))
            ?? AttributedString(text)
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            Circle()
                .fill(Typeface.ink)
                .frame(width: 5, height: 5)
                .offset(y: -3)
            Text(styled)
                .font(.system(size: 17, design: .serif))
                .foregroundStyle(Typeface.ink)
                .lineSpacing(5)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 2)
    }
}

/// The calibration loop, in one row: Lookback states its own tier call
/// (1 = front page, 5 = shouldn't exist), the reader corrects it. Every
/// correction teaches the topic judge what this paper's front page is.
private struct TierRatingView: View {
    let article: Article
    @State private var rating: Int?
    @State private var saveFailed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            if let tier = article.predictedTier {
                Text("Lookback's call: Tier \(tier)\(tier == 1 ? " — front page" : "")")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Text(rating == nil ? "Your verdict — was this worth printing?" : "Your verdict")
                .font(.footnote.weight(.semibold))

            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { tier in
                    Button {
                        setRating(tier)
                    } label: {
                        Text("\(tier)")
                            .font(.system(.subheadline, design: .serif).weight(.semibold))
                            .frame(width: 40, height: 40)
                            .background(
                                Circle().fill(current == tier ? Color.primary : Color.clear)
                            )
                            .overlay(Circle().strokeBorder(.quaternary, lineWidth: 1))
                            .foregroundStyle(current == tier ? Color(.systemBackground) : .primary)
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            Text("1 = best, 5 = skip it. Your ratings tune what gets written next.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
            if saveFailed {
                Text("Couldn't save — try again.")
                    .font(.caption2)
                    .foregroundStyle(.red)
            }
        }
        .onAppear { rating = article.userRating }
    }

    private var current: Int? { rating ?? article.userRating }

    private func setRating(_ tier: Int) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        rating = tier
        saveFailed = false
        Task {
            do { try await API.rate(articleId: article.id, rating: tier) }
            catch { saveFailed = true }
        }
    }
}
