// Shared scoring for the judged query runs. A run is { q, kind, expect: [slug], count, top: [slug] }.
//
// Metrics: hit@1 / hit@5 (an expected slug in the top 1 / top 5), MRR (1 / rank of the first
// expected slug, 0 if absent from the top 10) and the median result count (how much of the
// catalog a query drags in — the stopword symptom).

const rankOf = (run) => {
  const idx = run.top.findIndex(slug => run.expect.includes(slug))
  return idx === -1 ? null : idx + 1
}
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

export const score = (runs) => {
  const ranks = runs.map(rankOf)
  return {
    n: runs.length,
    'hit@1': ranks.filter(r => r === 1).length,
    'hit@5': ranks.filter(r => r && r <= 5).length,
    mrr: Number((ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / runs.length).toFixed(2)),
    medianCount: median(runs.map(r => r.count))
  }
}

const byKind = (runs) => {
  const kinds = [...new Set(runs.map(r => r.kind))]
  return Object.fromEntries(kinds.map(k => [k, score(runs.filter(r => r.kind === k))]))
}

// variants: { name: runs[] } — the same queries in the same order for every variant
export const renderReport = (title, variants) => {
  const names = Object.keys(variants)
  const lines = [`# ${title}`, '']
  lines.push('## summary', '', '| variant | hit@1 | hit@5 | MRR | median count |', '|---|---|---|---|---|')
  for (const name of names) {
    const s = score(variants[name])
    lines.push(`| ${name} | ${s['hit@1']}/${s.n} | ${s['hit@5']}/${s.n} | ${s.mrr} | ${s.medianCount} |`)
  }
  lines.push('', '## by kind (hit@5 / n, MRR)', '', `| kind | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`)
  const kinds = [...new Set(variants[names[0]].map(r => r.kind))]
  for (const kind of kinds) {
    const cells = names.map(name => { const s = byKind(variants[name])[kind]; return `${s['hit@5']}/${s.n} (${s.mrr})` })
    lines.push(`| ${kind} | ${cells.join(' | ')} |`)
  }
  lines.push('', '## per query (rank of first expected · result count)', '', `| q | kind | ${names.join(' | ')} |`, `|---|---|${names.map(() => '---').join('|')}|`)
  variants[names[0]].forEach((_, i) => {
    const run = variants[names[0]][i]
    const cells = names.map(name => { const r = variants[name][i]; const rk = rankOf(r); return `${rk ?? '—'} · ${r.count}` })
    lines.push(`| ${run.q} | ${run.kind} | ${cells.join(' | ')} |`)
  })
  return lines.join('\n') + '\n'
}
