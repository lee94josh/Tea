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
                        .lineSpacing(3)

                    if !article.dek.isEmpty {
                        Text(article.dek)
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(.secondary)
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
                        if index == 0 {
                            leadParagraph(paragraph)
                        } else {
                            Text(paragraph)
                                .font(.system(size: 17, design: .serif))
                                .lineSpacing(6)
                        }
                    }

                    Text("◼︎")
                        .font(.caption2)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 8)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 640) // readable line length on big phones/landscape
                .frame(maxWidth: .infinity)
            }
        }
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
            .lineSpacing(6)
    }
}
