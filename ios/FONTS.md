# Canvas display fonts (one-time setup)

The home canvas mixes four free, open-licensed (OFL) display faces. The app
**builds and runs without them** — `Font.custom` quietly falls back to the
system font — but the magazine look only appears once they're installed. Do this
once; git keeps them after.

## 1. Download the four families

All from Google Fonts (click "Download family", unzip, grab the listed `.ttf`):

| Family | File you need | Used for |
| --- | --- | --- |
| [Archivo Black](https://fonts.google.com/specimen/Archivo+Black) | `ArchivoBlack-Regular.ttf` | the heavy headline base |
| [Anton](https://fonts.google.com/specimen/Anton) | `Anton-Regular.ttf` | tall condensed headlines |
| [Libre Caslon Text](https://fonts.google.com/specimen/Libre+Caslon+Text) | `LibreCaslonText-Regular.ttf`, `LibreCaslonText-Italic.ttf` | editorial serif + the italic accent line |
| [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) | `PixelifySans-SemiBold.ttf` | the bitmap/typewriter accent line |

(That's 5 files total — Libre Caslon contributes two.)

## 2. Add them to the Xcode target

1. Drag all 5 `.ttf` files into the `Lookback` group in Xcode.
2. In the dialog, check **"Copy items if needed"** and tick the **Lookback**
   target under "Add to targets". (If a font isn't a target member it won't load.)

## 3. Register them with the app

The target generates its Info.plist, so add the list in **Build Settings / Info**:

1. Select the **Lookback** target → **Info** tab.
2. Add a key **"Fonts provided by application"** (raw key `UIAppFonts`), type Array.
3. Add one String item per file, exactly:
   - `ArchivoBlack-Regular.ttf`
   - `Anton-Regular.ttf`
   - `LibreCaslonText-Regular.ttf`
   - `LibreCaslonText-Italic.ttf`
   - `PixelifySans-SemiBold.ttf`

## 4. Verify

Build & run. If a headline still looks like the plain system font, the
PostScript name didn't match. Print the installed names once and compare to the
constants in `Typeface.swift`:

```swift
for family in UIFont.familyNames.sorted() {
    print(family, UIFont.fontNames(forFamilyName: family))
}
```

The names must match `Typeface.grotesqueName` / `condensedName` / `serifName` /
`serifItalicName` / `pixelName`. If Google ships a slightly different PostScript
name, update those constants — nothing else references the raw names.
