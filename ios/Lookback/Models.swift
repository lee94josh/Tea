import Foundation

// Codable mirrors of the server's JSON (shared/src/index.ts shapes).
// Dates stay as ISO strings; views format for display.

struct PhotoRef: Codable, Identifiable {
    let id: String
    let thumbUrl: String?
    let visionUrl: String?
    let takenAt: String?
}

struct MomentListItem: Codable, Identifiable {
    let momentId: String
    let seedId: String
    var conversationId: String?
    let title: String?
    let venueName: String?
    let startedAt: String?
    let qualityScore: Double?
    var opener: String
    let openers: [String]
    let suggestedReplies: [String]
    let photos: [PhotoRef]
    var id: String { momentId }

    var openerOptions: [String] { openers.isEmpty ? [opener] : openers }
    var displayTitle: String { title ?? venueName ?? "A moment" }
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    let role: String     // "user" | "assistant"
    let content: String
}

struct ConversationRef: Codable { let id: String }

struct StartedConversation: Codable {
    let conversation: ConversationRef
    let opener: String
    let suggestedReplies: [String]
}

struct ConversationHistory: Codable {
    let conversation: ConversationRef
    let messages: [ChatMessage]
    let photos: [PhotoRef]
}

struct FeedItem: Codable, Identifiable {
    let photoId: String
    let momentId: String
    let url: String?
    let thumbUrl: String?
    let takenAt: String?
    let title: String?
    let venueName: String?
    let comment: String?
    var id: String { photoId }
}

struct FactEntity: Codable, Hashable {
    let name: String
    let topicId: String?
}

struct FunFact: Codable, Identifiable {
    let id: String
    let momentId: String
    let fact: String
    let source: String?
    let sourceUrl: String?
    let venueName: String?
    let momentTitle: String?
    let takenAt: String?
    let thumbUrl: String?
    let entities: [FactEntity]
}

struct DiscoverTopic: Codable, Identifiable {
    let id: String
    let momentId: String
    let name: String
    let kind: String?
    let blurb: String?
    let venueName: String?
    let momentTitle: String?
    let hasDive: Bool
    let verdict: String?
}

struct DeepDive: Codable {
    let title: String
    let body_paragraphs: [String]
    let fun_facts: [String]
    let further_questions: [String]
}

struct FactDive: Codable {
    let text: String
    let usedSearch: Bool
}
