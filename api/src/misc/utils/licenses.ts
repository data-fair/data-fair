export const findLicense = (str: string, licenses: any[]) => {
  str = str.toLowerCase()
  for (const l of licenses) {
    if (str === l.href) return l
    if (l.title && str === l.title.toLowerCase()) return l
    if (l.alternate_urls && l.alternate_urls.some((u: any) => u === str)) return l
    if (l.alternate_titles && l.alternate_titles.some((t: any) => t.toLowerCase() === str)) return l
  }
}
