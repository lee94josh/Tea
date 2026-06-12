import Foundation

/// Mirrors the server's UploadResult shape.
struct UploadResult: Decodable {
    struct Accepted: Decodable { let id: String; let filename: String }
    struct Rejected: Decodable { let filename: String; let reason: String }
    let batchId: String
    let accepted: [Accepted]
    let rejected: [Rejected]
}

enum Uploader {
    /// POST one original image to the existing /upload endpoint as multipart.
    /// The server extracts EXIF (incl. GPS) from the original bytes itself.
    static func upload(
        serverURL: String,
        token: String,
        data: Data,
        filename: String,
        mime: String
    ) async throws -> UploadResult {
        let base = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: base + "/upload") else { throw URLError(.badURL) }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        func append(_ string: String) { body.append(string.data(using: .utf8)!) }
        // The server reads each part's filename + content-type; field name is free.
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mime)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")

        let (respData, response) = try await URLSession.shared.upload(for: request, from: body)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let text = String(data: respData, encoding: .utf8) ?? "unknown error"
            throw NSError(domain: "Lookback", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Upload failed: \(text)"])
        }
        return try JSONDecoder().decode(UploadResult.self, from: respData)
    }
}
