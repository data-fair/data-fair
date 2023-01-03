// built using pages/_dev/char-sizes.vue
// char sizes with Nunito font at 14px font size
const fontSizesInfos = {
  14: {
    charsWidths: { 0: 8.41, 1: 8.41, 2: 8.41, 3: 8.41, 4: 8.41, 5: 8.41, 6: 8.41, 7: 8.41, 8: 8.41, 9: 8.41, a: 7.43, b: 8.18, c: 6.35, d: 8.18, e: 7.46, f: 4.47, g: 8.22, h: 7.96, i: 3.25, j: 3.32, k: 7, l: 4.16, m: 11.99, n: 7.96, o: 7.8, p: 8.18, q: 8.18, r: 4.96, s: 6.68, t: 4.91, u: 7.86, v: 7.49, w: 11.65, x: 7.22, y: 7.11, z: 6.35, é: 7.46, è: 7.46, à: 7.43, ç: 6.49, ù: 7.86, â: 7.43, ê: 7.46, ô: 7.8, û: 7.86, î: 3.49, ï: 3.25, ü: 7.86, ö: 7.8, ë: 7.46, œ: 12.75, A: 10.22, B: 9.47, C: 9.44, D: 10.4, E: 8.18, F: 7.46, G: 10.18, H: 10.66, I: 3.61, J: 4.55, K: 8.75, L: 7.61, M: 11.99, N: 10.38, O: 10.75, P: 8.77, Q: 10.75, R: 9.38, S: 8.41, T: 8.44, U: 10.21, V: 9.66, W: 15.22, X: 9.05, Y: 8.36, Z: 8.25, É: 8.18, È: 7.97, À: 10.05, Ç: 9.44, Ù: 10.13, Â: 10.22, Ê: 8.13, Ô: 10.75, Û: 10.21, Î: 3.61, Ï: 3.61, Ü: 10.21, Ö: 10.75, Ë: 8.13, Œ: 14.66, ' ': 3.63, '+': 8.41, '=': 8.41, '<': 8.41, '>': 8.41, '%': 13.04, '*': 6.18, '!': 3.27, '/': 3.69, ':': 3.21, '.': 3.21, ';': 3.21, ',': 2.21, '?': 6.21, '&': 9.71, '~': 8.41, '@': 13.25, "'": 3.11, '"': 5.5, _: 6.43, '-': 5.94, '|': 3.72, '#': 8.41, '(': 5, ')': 4.46, '[': 4.99, ']': 4.43, '{': 5.5, '}': 4.21, '°': 5.21, '²': 5.33, '–': 7, '\t': 3.63, '\\': 3.97 },
    defaultWidth: 9
  }
}

function getFontSizeInfos (fontSize = 14) {
  fontSizesInfos[fontSize] = fontSizesInfos[fontSize] || {
    charsWidths: Object.entries(fontSizesInfos['14'].charsWidths).reduce((charsWidths, [char, width]) => { charsWidths[char] = width * (fontSize / 14); return charsWidths }, {}),
    defaultWidth: fontSizesInfos['14'].defaultWidth * (fontSize / 14)
  }
  return fontSizesInfos[fontSize]
}

export function estimateTextSize (text, fontSize = 14) {
  const fontSizeInfos = getFontSizeInfos(fontSize)
  let size = 0
  for (const char of text) {
    if (!fontSizeInfos.charsWidths[char]) console.warn('missing char for text size estimation', char)
    size += fontSizeInfos.charsWidths[char] || fontSizeInfos.defaultWidth
  }
  return size
}
