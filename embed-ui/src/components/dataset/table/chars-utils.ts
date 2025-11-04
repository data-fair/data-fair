// built using pages/_dev/char-sizes.vue
// char sizes with Nunito font at 14px font size

const baseDefaultWidth = 9

const fontSizesInfos: Record<number, { charsWidths: Record<string, number>, defaultWidth: number }> = {}

function getFontSizeInfos (baseCharsWidths: Record<string, number>, fontSize = 14) {
  fontSizesInfos[fontSize] = fontSizesInfos[fontSize] || {
    charsWidths: Object.entries(baseCharsWidths).reduce((charsWidths, [char, width]) => { charsWidths[char] = width * (fontSize / 14); return charsWidths }, {} as Record<string, number>),
    defaultWidth: baseDefaultWidth * (fontSize / 14)
  }
  return fontSizesInfos[fontSize]
}

export function estimateTextSize (baseCharsWidths: Record<string, number>, text: string, fontSize = 14) {
  const fontSizeInfos = getFontSizeInfos(baseCharsWidths, fontSize)
  let size = 0
  for (const char of text) {
    if (char.charCodeAt(0) === 146) continue // empty UTF char
    if (!fontSizeInfos.charsWidths[char]) console.warn(`missing char for text size estimation "${char}" ${char.charCodeAt(0)}`)
    size += fontSizeInfos.charsWidths[char] || fontSizeInfos.defaultWidth
  }
  return size
}
