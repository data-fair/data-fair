// Pure logic behind `read_dataset_changes`.
//
// This used to serialize both sides through `describe_dataset.formatResult` and diff the
// text. That representation carries neither capabilities, nor groups, nor value labels,
// nor column order — so the change summary was blind to most of what the agent tools can
// now write, and the user could save a schema reshuffle the summary never mentioned.
// It is a structured field-by-field diff instead.

const METADATA_FIELDS: { key: string, label: string }[] = [
  { key: 'title', label: 'titre' },
  { key: 'summary', label: 'résumé' },
  { key: 'description', label: 'description' },
  { key: 'license', label: 'licence' },
  { key: 'topics', label: 'thématiques' },
  { key: 'keywords', label: 'mots-clés' },
  { key: 'origin', label: 'provenance' },
  { key: 'creator', label: 'créateur' },
  { key: 'frequency', label: 'fréquence' },
  { key: 'spatial', label: 'couverture spatiale' },
  { key: 'temporal', label: 'couverture temporelle' },
  { key: 'image', label: 'vignette' }
]

const COLUMN_FIELDS: { key: string, label: string }[] = [
  { key: 'title', label: 'libellé' },
  { key: 'description', label: 'description' },
  { key: 'x-refersTo', label: 'concept' },
  { key: 'x-group', label: 'groupe' },
  { key: 'x-labels', label: 'libellés de valeurs' },
  { key: 'x-capabilities', label: 'capacités' },
  { key: 'x-transform', label: 'type forcé' },
  { key: 'separator', label: 'séparateur' },
  { key: 'x-display', label: 'format d\'affichage' }
]

const equal = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const short = (v: any, max = 70): string => {
  if (v == null || v === '') return '(vide)'
  if (Array.isArray(v)) {
    if (!v.length) return '(vide)'
    return v.map(x => typeof x === 'object' && x ? (x.title ?? x.id ?? JSON.stringify(x)) : String(x)).join(', ')
  }
  if (typeof v === 'object') {
    if (v.title) return String(v.title)
    const json = JSON.stringify(v)
    return json.length > max ? `${json.slice(0, max)}…` : json
  }
  const s = String(v)
  return s.length > max ? `${s.slice(0, max)}… (${s.length} caractères)` : s
}

export interface DatasetSides {
  metadataServer?: any
  metadataEdited?: any
  structureServer?: any
  structureEdited?: any
}

/**
 * Render the pending changes of both editable sections. Returns a stable, compact report
 * meant to be read by a human through the summarizer sub-agent — every line names what
 * changed, so nothing gets saved unseen.
 */
export function diffDataset (sides: DatasetSides): string {
  const blocks: string[] = []

  const metaLines = diffMetadata(sides.metadataServer, sides.metadataEdited)
  if (metaLines.length) blocks.push(['## Métadonnées', ...metaLines].join('\n'))

  const structureLines = diffStructure(sides.structureServer, sides.structureEdited)
  if (structureLines.length) blocks.push(['## Structure', ...structureLines].join('\n'))

  if (!blocks.length) return 'Aucune modification en attente.'
  return blocks.join('\n\n')
}

function diffMetadata (server: any, edited: any): string[] {
  if (!server || !edited) return []
  const lines: string[] = []
  for (const { key, label } of METADATA_FIELDS) {
    if (equal(server[key], edited[key])) continue
    lines.push(`- **${label}** : ${short(server[key])} → ${short(edited[key])}`)
  }
  return lines
}

function diffStructure (server: any, edited: any): string[] {
  if (!server?.schema || !edited?.schema) return []
  const lines: string[] = []

  const serverCols: any[] = server.schema
  const editedCols: any[] = edited.schema
  const serverKeys = serverCols.map(c => c.key)
  const editedKeys = editedCols.map(c => c.key)

  const added = editedKeys.filter(k => !serverKeys.includes(k))
  const removed = serverKeys.filter(k => !editedKeys.includes(k))
  if (added.length) lines.push(`- **colonnes ajoutées** : ${added.join(', ')}`)
  if (removed.length) lines.push(`- **colonnes supprimées** : ${removed.join(', ')}`)

  // Order: compare the sequence of the columns present on both sides, so an added or
  // removed column is not reported a second time as a move.
  const commonServer = serverKeys.filter(k => editedKeys.includes(k))
  const commonEdited = editedKeys.filter(k => serverKeys.includes(k))
  if (!equal(commonServer, commonEdited)) {
    const moved = commonEdited.filter((k, i) => k !== commonServer[i])
    lines.push(`- **ordre des colonnes modifié** — ${moved.length} colonne(s) déplacée(s) : ${moved.slice(0, 8).join(', ')}${moved.length > 8 ? '…' : ''}`)
  }

  const serverByKey = new Map(serverCols.map(c => [c.key, c]))
  const perColumn: string[] = []
  for (const col of editedCols) {
    const before = serverByKey.get(col.key)
    if (!before) continue
    const changes: string[] = []
    for (const { key, label } of COLUMN_FIELDS) {
      if (equal(before[key], col[key])) continue
      changes.push(`${label} ${short(before[key], 40)} → ${short(col[key], 40)}`)
    }
    if (changes.length) perColumn.push(`- \`${col.key}\` : ${changes.join(' ; ')}`)
  }
  if (perColumn.length) {
    lines.push(`- **${perColumn.length} colonne(s) modifiée(s)** :`)
    lines.push(...perColumn.map(l => `  ${l}`))
  }

  if (!equal(server.extensions, edited.extensions)) {
    const nb = (edited.extensions ?? []).length
    lines.push(`- **enrichissements** : ${(server.extensions ?? []).length} → ${nb}`)
  }
  if (!equal(server.primaryKey, edited.primaryKey)) {
    lines.push(`- **clé primaire** : ${short(server.primaryKey)} → ${short(edited.primaryKey)}`)
  }
  if (!equal(server.projection, edited.projection)) {
    lines.push(`- **projection cartographique** : ${short(server.projection)} → ${short(edited.projection)}`)
  }

  return lines
}
