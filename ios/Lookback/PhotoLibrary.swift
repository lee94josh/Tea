import Photos
import CoreLocation
import UniformTypeIdentifiers
import Combine // ObservableObject/@Published live here

/// One photo from the library, with the metadata that matters to Lookback.
struct PhotoItem: Identifiable {
    let id: String          // PHAsset.localIdentifier
    let asset: PHAsset
    var creationDate: Date? { asset.creationDate }
    var coordinate: CLLocationCoordinate2D? { asset.location?.coordinate }
}

/// Thin wrapper over PhotoKit: permission, recent fetch, and original bytes.
/// Native PhotoKit hands us GPS + timestamp directly and lets us read the
/// untouched original file (EXIF intact) — no metadata-stripping problem.
@MainActor
final class PhotoLibrary: ObservableObject {
    @Published var status: PHAuthorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    @Published var items: [PhotoItem] = []

    var isAuthorized: Bool { status == .authorized || status == .limited }

    func refresh() {
        status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if isAuthorized { loadRecent() }
    }

    func requestAccess() async {
        status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        if isAuthorized { loadRecent() }
    }

    func loadRecent(limit: Int = 20) {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        options.fetchLimit = limit
        let result = PHAsset.fetchAssets(with: .image, options: options)
        var out: [PhotoItem] = []
        result.enumerateObjects { asset, _, _ in
            out.append(PhotoItem(id: asset.localIdentifier, asset: asset))
        }
        items = out
    }

    /// The ORIGINAL file bytes (EXIF intact) plus a filename + MIME type, ready
    /// to upload to the server's /upload endpoint.
    func originalData(for asset: PHAsset) async -> (data: Data, filename: String, mime: String)? {
        let resources = PHAssetResource.assetResources(for: asset)
        let filename = resources.first?.originalFilename ?? "photo.jpg"
        // Two steps: chaining .flatMap directly would map over the String's
        // Characters instead of the Optional.
        let typeIdentifier: String? = resources.first?.uniformTypeIdentifier
        let mime = typeIdentifier.flatMap { UTType($0)?.preferredMIMEType } ?? "image/jpeg"

        return await withCheckedContinuation { continuation in
            let options = PHImageRequestOptions()
            options.version = .original            // untouched original, with EXIF
            options.isNetworkAccessAllowed = true  // fetch from iCloud if needed
            options.deliveryMode = .highQualityFormat
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, _, _, _ in
                if let data {
                    continuation.resume(returning: (data, filename, mime))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
