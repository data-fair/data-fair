// Greps directories for reads of the legacy x-capabilities model.
// Usage: node --experimental-strip-types dev/spikes/indexing-rework/scan-capabilities-usage.ts <dir> [<dir>...]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// [pattern, label, standalone] — standalone=false patterns are only meaningful
// near an x-capabilities/capability= anchor and reported as "contextual"
const PATTERNS: Array<[RegExp, string, boolean]> = [
  [/x-capabilities/g, 'x-capabilities', true],
  [/capability=/g, 'capability= param', true],
  [/\btextStandard\b/g, 'key textStandard', true],
  [/\btextAgg\b/g, 'key textAgg', true],
  [/\bnativeWildcard\b/g, 'key nativeWildcard', true],
  [/\bgeoCorners\b/g, 'key geoCorners', true],
  [/\bvtPrepare\b/g, 'key vtPrepare', true],
  [/\bindexAttachment\b/g, 'key indexAttachment', true],
  [/\binsensitive\b/g, 'key insensitive', false],
  [/\bwildcard\b/g, 'key wildcard', false],
  [/\.text_standard\b/g, 'subfield .text_standard', true],
  [/\.keyword_insensitive\b/g, 'subfield .keyword_insensitive', true],
  [/\.wildcard\b/g, 'subfield .wildcard', true],
  [/\banalysis=/g, 'param analysis=', true],
  [/\bwords_agg\b/g, 'words_agg', true]
]
const EXT = /\.(js|mjs|cjs|ts|vue|json|html)$/
const SKIP = new Set(['node_modules', '.git', '.nuxt', 'coverage', 'test', 'tests'])

function * walk (dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue
    const p = join(dir, e)
    const st = statSync(p)
    if (st.isDirectory()) yield * walk(p)
    else if (st.isFile() && EXT.test(e) && st.size < 20_000_000) yield p
  }
}

for (const root of process.argv.slice(2)) {
  const hits: Record<string, Array<{ file: string, line: number, excerpt: string }>> = {}
  let files = 0
  for (const file of walk(root)) {
    files++
    const content = readFileSync(file, 'utf8')
    const hasAnchor = /x-capabilities|capability=/.test(content)
    for (const [re, label, standalone] of PATTERNS) {
      if (!standalone && !hasAnchor) continue
      const lines = content.split('\n')
      lines.forEach((l, i) => {
        re.lastIndex = 0
        if (re.test(l)) {
          (hits[label] ??= []).push({ file: relative(root, file), line: i + 1, excerpt: l.trim().slice(0, 160) })
        }
      })
    }
  }
  console.log(`\n## ${root} (${files} files scanned)`)
  if (!Object.keys(hits).length) { console.log('no hits'); continue }
  for (const [label, list] of Object.entries(hits)) {
    console.log(`\n### ${label} — ${list.length} hit(s)`)
    for (const h of list.slice(0, 30)) console.log(`- \`${h.file}:${h.line}\` ${h.excerpt}`)
    if (list.length > 30) console.log(`- … ${list.length - 30} more`)
  }
}
