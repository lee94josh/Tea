import SwiftUI
import UIKit
import Vision
import CoreImage
import CoreVideo

/// On-device subject lifting: knocks the background out of an anchor photo so
/// the subject (a chair, a cup, a cake) floats on the canvas — the cut-out look
/// from the references. Uses Vision's foreground-instance mask (iOS 17+),
/// entirely on-device. Results are cached per URL; failures fall back to the
/// framed photo at the call site.
actor SubjectLift {
    static let shared = SubjectLift()

    // nil value = "tried, didn't produce a clean cut-out" (don't retry).
    private var cache: [String: UIImage?] = [:]
    private var inFlight: [String: Task<UIImage?, Never>] = [:]

    func cutout(from url: URL) async -> UIImage? {
        let key = url.absoluteString
        if let cached = cache[key] { return cached }
        if let task = inFlight[key] { return await task.value }

        let task = Task<UIImage?, Never> {
            await Self.makeCutout(url: url)
        }
        inFlight[key] = task
        let result = await task.value
        inFlight[key] = nil
        cache[key] = result
        return result
    }

    private static func makeCutout(url: URL) async -> UIImage? {
        guard #available(iOS 17.0, *) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let input = CIImage(data: data) else { return nil }
        let context = CIContext(options: nil)

        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(ciImage: input, options: [:])
        do {
            try handler.perform([request])
            guard let result = request.results?.first,
                  !result.allInstances.isEmpty else { return nil }
            let masked = try result.generateMaskedImage(
                ofInstances: result.allInstances,
                from: handler,
                croppedToInstancesExtent: true,
            )
            let ciImage = CIImage(cvPixelBuffer: masked)
            guard let cg = context.createCGImage(ciImage, from: ciImage.extent) else { return nil }
            let image = UIImage(cgImage: cg)
            // Reject near-empty masks (tiny or sliver subjects look like noise).
            guard image.size.width > 40, image.size.height > 40 else { return nil }
            return image
        } catch {
            return nil
        }
    }
}
