import SwiftUI
import UIKit

/// The front page: a personalized newspaper generated from your photos.
/// Lead story gets a large photo; the rest run as compact rows under
/// hairline rules. Serif headlines, quiet metadata — NYT-ish restraint.
struct PaperView: View {
    @State private var articles: [Article] = []
    @State private var loading = false
    @State private var errorText: String?
    @State private var lastLoaded: Date?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                masthead

                if let errorText {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                        .padding(.top, 24)
                }

                if articles.isEmpty && !loading && errorText == nil {
                    emptyState
                }

                ForEach(Array(articles.enumerated()), id: \.element.id) { index, article in
                    NavigationLink(value: article) {
                        if index == 0 {
                            LeadStoryRow(article: article)
                        } else {
                            StoryRow(article: article)
                        }
                    }
                    .buttonStyle(PressableRow())
                    Divider().padding(.horizontal)
                }
            }
        }
        .navigationDestination(for: Article.self) { ArticleReaderView(article: $0) }
        .refreshable { await load() }
        .task {
            // Avoid refetch churn when bouncing between views.
            if articles.isEmpty || (lastLoaded.map { Date().timeIntervalSince($0) > 300 } ?? true) {
                await load()
            }
        }
        .background(Color(uiColor: .systemBackground))
    }

    private var masthead: some View {
        VStack(spacing: 6) {
            Text("LOOKBACK")
                .font(.system(size: 34, weight: .black, design: .serif))
                .kerning(2)
                .frame(maxWidth: .infinity)
            Text(Date().formatted(.dateTime.weekday(.wide).month(.wide).day().year()))
                .font(.caption)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .kerning(1)
            Rectangle().frame(height: 2).padding(.horizontal)
            Rectangle().frame(height: 0.5).padding(.horizontal).padding(.top, 1)
        }
        .padding(.top, 8)
        .padding(.bottom, 14)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Text("No stories yet")
                .font(.system(.title3, design: .serif, weight: .semibold))
            Text("Sync some photos (gear icon) and the day's edition will write itself as research finishes.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let fresh = try await API.articles()
            let isNewEdition = fresh.map(\.id) != articles.map(\.id)
            withAnimation(.easeOut(duration: 0.25)) {
                articles = fresh
                errorText = nil
            }
            lastLoaded = Date()
            if isNewEdition && !fresh.isEmpty {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
        } catch {
            if articles.isEmpty { errorText = error.localizedDescription }
        }
    }
}

/// Subtle press effect for story rows — no stock highlight, just a settle.
private struct PressableRow: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Big photo, big headline — the day's lead.
private struct LeadStoryRow: View {
    let article: Article
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let url = API.absoluteURL(article.photos.first?.visionUrl ?? article.photos.first?.thumbUrl) {
                ArticleImage(url: url, height: 230)
            }
            KindTag(kind: article.kind, venue: article.venueName)
            Text(article.headline)
                .font(.system(size: 28, weight: .bold, design: .serif))
                .lineSpacing(2)
            if !article.dek.isEmpty {
                Text(article.dek)
                    .font(.system(.subheadline, design: .serif))
                    .foregroundStyle(.secondary)
                    .lineSpacing(2)
            }
            if let dateline = article.dateline {
                Text("From your photos · \(dateline)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .textCase(.uppercase)
                    .kerning(0.5)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 16)
    }
}

/// Compact row: small photo strip up top, then headline + dek.
private struct StoryRow: View {
    let article: Article
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !article.photos.isEmpty {
                HStack(spacing: 6) {
                    ForEach(article.photos.prefix(4)) { photo in
                        if let url = API.absoluteURL(photo.thumbUrl) {
                            ArticleImage(url: url, height: 64)
                                .frame(width: 64)
                        }
                    }
                    Spacer()
                }
            }
            KindTag(kind: article.kind, venue: article.venueName)
            Text(article.headline)
                .font(.system(size: 20, weight: .bold, design: .serif))
                .lineSpacing(1)
            if !article.dek.isEmpty {
                Text(article.dek)
                    .font(.system(.footnote, design: .serif))
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 14)
    }
}

struct KindTag: View {
    let kind: String?
    let venue: String?
    var body: some View {
        Text([kind?.uppercased(), venue].compactMap { $0 }.joined(separator: " · "))
            .font(.caption2.weight(.semibold))
            .kerning(1)
            .foregroundStyle(.secondary)
    }
}

/// AsyncImage with a quiet placeholder; clips to a subtle rounded rect.
struct ArticleImage: View {
    let url: URL
    let height: CGFloat
    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                Rectangle().fill(Color(uiColor: .secondarySystemBackground))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}
