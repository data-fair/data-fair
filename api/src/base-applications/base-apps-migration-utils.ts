// Pure helpers of the base-apps-to-registry migration, exported for unit testing.
// No #config import here on purpose: this module must be statically importable
// from unit specs without loading node-config.

/** Deterministic mapping from a legacy base-app url to its registry artefact id.
 * Must be a pure function of the url so every environment (including federated
 * on-prem installs that only rewrite references) computes the same id. */
export const mapUrlToArtefact = (url: string): { artefactId: string, packageName: string, minor: string, npmPackage?: string } | null => {
  let m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/(@[\w.-]+\/[\w.-]+)@(\d+\.\d+)(?:\.\d+)?\/dist\/$/)
  if (m) return { artefactId: `${m[1]}@${m[2]}`, packageName: m[1], minor: m[2], npmPackage: m[1] }
  m = url.match(/^https:\/\/(?:staging-)?koumoul\.com\/apps\/([\w.-]+)\/(\d+\.\d+)(?:\.\d+)?\/$/)
  if (m) return { artefactId: `@koumoul/${m[1]}@${m[2]}`, packageName: `@koumoul/${m[1]}`, minor: m[2], npmPackage: undefined }
  return null
}

export const newBaseAppUrl = (publicUrl: string, packageName: string, minor: string) =>
  `${publicUrl.replace(/\/$/, '')}/app-assets/${packageName}/${minor}/`

/** Replace the app's own absolute url prefix with a relative one.
 * html and js always resolve to './': html is the document itself, and js chunk/asset
 * urls are built by webpack's runtime public-path variable then used in <script>/<link>
 * tags the browser resolves against the *document* location, not the (possibly nested,
 * e.g. js/app.js) chunk file that computed them. css is different: `url(...)` inside a
 * stylesheet is resolved by the browser against the *stylesheet's own* location, so a
 * nested css file (css/app.css) must climb back to the bundle root with '../'. */
export const rewriteTextAsset = (content: string, absPrefixes: string[], filePath: string): string => {
  const isCss = filePath.toLowerCase().endsWith('.css')
  const depth = isCss ? filePath.split('/').length - 1 : 0
  const relPrefix = depth === 0 ? './' : '../'.repeat(depth)
  let out = content
  for (const prefix of absPrefixes) {
    out = out.split(prefix).join(relPrefix)
    // protocol variants seen in old deployments
    out = out.split(prefix.replace('https://', 'http://')).join(relPrefix)
    out = out.split(prefix.replace('https:', '')).join(relPrefix)
  }
  return out
}

/** Collect src/href attribute values from an html string (regex is fine here:
 * these are build outputs, not arbitrary documents). */
export const extractHtmlAssetRefs = (html: string): string[] => {
  const refs: string[] = []
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) refs.push(m[1])
  return refs
}

/** Reconstruct lazy-chunk urls from a webpack4/vue-cli (and nuxt2) runtime.
 * Two shapes are seen in the wild:
 *  - named chunks (vue-cli with named dynamic imports): `"<dir>/" + (nameMap[id]||id) + "." + hashMap[id] + ".<ext>"`
 *  - unnamed/numeric chunks (plain webpack4/nuxt2, confirmed against a live nuxt2 bundle on
 *    koumoul.com): `"<dir>/" + hashMap[id] + ".<ext>"` — a single map, filename IS the hash.
 * We locate every such construction, parse the object literal(s), and enumerate.
 * Returns [] when the pattern is absent (vite builds, or apps with no lazy-loaded chunks —
 * most real koumoul.com/apps/ deployments sampled during migration have none). */
export const parseWebpackChunkUrls = (entryJs: string, absPrefix: string): string[] => {
  const urls: string[] = []
  const constructionRe = /"((?:js|css|_nuxt)\/)"\s*\+\s*(?:\(?\s*(\{[^{}]*\})\s*\[[\w$]+\]\s*\|\|\s*[\w$]+\s*\)?\s*\+\s*"\."\s*\+\s*)?(\{[^{}]*\})\s*\[[\w$]+\]\s*\+\s*"\.(js|css)"/g
  for (const m of entryJs.matchAll(constructionRe)) {
    const dir = m[1]
    const nameMap = m[2] ? parseFlatObjectLiteral(m[2]) : null
    const hashMap = parseFlatObjectLiteral(m[3])
    const ext = m[4]
    for (const id of Object.keys(hashMap)) {
      if (nameMap) {
        const name = nameMap[id] ?? id
        urls.push(`${absPrefix}${dir}${name}.${hashMap[id]}.${ext}`)
      } else {
        // single-map shape: the filename is the hash itself, no separate name segment
        urls.push(`${absPrefix}${dir}${hashMap[id]}.${ext}`)
      }
    }
  }
  return urls
}

/** Parse a flat object literal like {1:"about",3:"map"} or {"chunk-a":"11aa22bb"}. */
const parseFlatObjectLiteral = (src: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/(?:"([^"]+)"|([\w$-]+))\s*:\s*"([^"]+)"/g)) {
    out[m[1] ?? m[2]] = m[3]
  }
  return out
}
