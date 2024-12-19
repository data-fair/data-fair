export const findLicense = (/** @type {string} */str, licenses) => {
  str = str.toLowerCase()
  for (const l of licenses) {
    if (str === l.href) return l
    if (l.title && str === l.title.toLowerCase()) return l
    if (l.alternate_urls && l.alternate_urls.some(u => u === str)) return l
    if (l.alternate_titles && l.alternate_titles.some(t => t.toLowerCase() === str)) return l
  }
}
