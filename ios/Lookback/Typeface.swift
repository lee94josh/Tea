import SwiftUI

/// The canvas's display fonts. We mix a heavy grotesque, a tall condensed face,
/// an editorial serif (roman + italic), and a bitmap/typewriter accent — the
/// magazine-index look.
///
/// `Font.custom` falls back to the system font when a face isn't installed, so
/// the app always builds and runs; it just won't look right until the four
/// font families are added to the target (one-time — see ios/FONTS.md).
enum Typeface {
    // PostScript names — must match the bundled .ttf files (see FONTS.md).
    static let grotesqueName = "ArchivoBlack-Regular"      // headline workhorse
    static let condensedName = "Anton-Regular"             // tall condensed punch
    static let serifName = "LibreCaslonText-Regular"       // editorial serif
    static let serifItalicName = "LibreCaslonText-Italic"
    static let pixelName = "PixelifySans-SemiBold"         // bitmap accent

    static func grotesque(_ size: CGFloat) -> Font { .custom(grotesqueName, size: size) }
    static func condensed(_ size: CGFloat) -> Font { .custom(condensedName, size: size) }
    static func serif(_ size: CGFloat) -> Font { .custom(serifName, size: size) }
    static func serifItalic(_ size: CGFloat) -> Font { .custom(serifItalicName, size: size) }
    static func pixel(_ size: CGFloat) -> Font { .custom(pixelName, size: size) }

    /// The warm off-white the whole canvas sits on (kept constant in light/dark
    /// so the editorial palette holds).
    static let paper = Color(red: 0.957, green: 0.949, blue: 0.910)
    static let ink = Color(red: 0.09, green: 0.09, blue: 0.08)
}

/// One headline font role, chosen deterministically per card so the mix feels
/// hand-set but never reshuffles between launches.
enum HeadlineFace {
    case grotesque, condensed, serif, serifItalic, pixel

    func font(_ size: CGFloat) -> Font {
        switch self {
        case .grotesque: return Typeface.grotesque(size)
        case .condensed: return Typeface.condensed(size)
        case .serif: return Typeface.serif(size)
        case .serifItalic: return Typeface.serifItalic(size)
        case .pixel: return Typeface.pixel(size)
        }
    }
}
