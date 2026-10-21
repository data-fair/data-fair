// Pure logic behind the `read_dataset_metadata` / `set_dataset_metadata` agent tools.
// Kept free of Vue and of the fetch layer so it can be unit-tested directly.
//
// Guiding rule: the agent may only write what the human can SEE in the metadata form
// before pressing Enregistrer. Every field is therefore checked against the same three
// gates the form itself applies — owner settings (`datasets-metadata`), the owner's
// closed licence and topic lists, and the dataset's own write permission. A field that
// the form would not render is refused rather than written silently.

import { recommendedSize } from '../../../../api/types/metadata-completeness.ts'
import { type CustomMetadataDefinition, formatCustomMetadata, isCustomMetadataEmpty, trimCustomMetadata } from '../../../../api/types/custom-metadata.ts'

export const FREQUENCY_VALUES = [
  'triennial', 'biennial', 'annual', 'semiannual', 'threeTimesAYear', 'quarterly',
  'bimonthly', 'monthly', 'semimonthly', 'biweekly', 'threeTimesAMonth', 'weekly',
  'semiweekly', 'threeTimesAWeek', 'daily', 'continuous', 'irregular'
] as const

/** Fields the owner can switch off in `settings/…/datasets-metadata`. */
export const OPTIONAL_FIELDS = ['keywords', 'searchTerms', 'creator', 'frequency', 'spatial'] as const

/** Fields always rendered by the metadata form. */
export const ALWAYS_FIELDS = ['title', 'summary', 'description', 'license', 'topics', 'origin'] as const

// hard cap when the owner settings give no recommended maximum
export const SUMMARY_MAX_LENGTH = 300
export const SEARCH_TERMS_MAX_LENGTH = 1000

export type License = { title: string, href: string }
export type Topic = { id: string, title: string }

export interface MetadataContext {
  /** `settings/<type>/<id>/licenses` */
  licenses: License[]
  /** `settings/<type>/<id>/topics` */
  topics: Topic[]
  /** `settings/<type>/<id>/datasets-metadata` */
  datasetsMetadata: Record<string, any> & {
    custom?: (CustomMetadataDefinition & { recommendedMin?: number, recommendedMax?: number })[]
  } | null
}

export interface MetadataInput {
  title?: string
  summary?: string
  description?: string
  keywords?: string[]
  searchTerms?: string
  license?: string | null
  topics?: string[]
  origin?: string
  creator?: string
  frequency?: string
  spatial?: string
  /** keyed by the custom metadata key or title, null clears a value */
  customMetadata?: Record<string, unknown>
}

export interface FieldOutcome {
  field: string
  status: 'applied' | 'unchanged' | 'rejected'
  reason?: string
}

export interface MetadataResult {
  patch: Record<string, any>
  outcomes: FieldOutcome[]
}

const isFieldAvailable = (field: string, ctx: MetadataContext): boolean => {
  if ((ALWAYS_FIELDS as readonly string[]).includes(field)) return true
  // An owner with no `datasets-metadata` settings at all gets the platform defaults,
  // where every optional field is rendered.
  if (!ctx.datasetsMetadata) return true
  return ctx.datasetsMetadata[field]?.active !== false
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Resolve a licence by href first, then by title. Returns the stored object shape
 * (`{title, href}`) that the form's `return-object` select produces.
 */
export const resolveLicense = (value: string, licenses: License[]): License | undefined =>
  licenses.find(l => l.href === value) ?? licenses.find(l => norm(l.title) === norm(value))

/** Resolve a topic by id first, then by title. */
export const resolveTopic = (value: string, topics: Topic[]): Topic | undefined =>
  topics.find(t => t.id === value) ?? topics.find(t => norm(t.title) === norm(value))

/**
 * A summary that opens on a filler phrase carries no information in a catalog listing,
 * where it sits directly under the title that already says "dataset".
 */
const GENERIC_SUMMARY_STARTS = [
  'ce jeu de données',
  'ce jeu de donnees',
  'this dataset',
  'le jeu de données',
  'the dataset'
]

export const summaryMaxLength = (ctx: MetadataContext) => recommendedSize('summary', ctx.datasetsMetadata).max ?? SUMMARY_MAX_LENGTH

export function validateSummary (summary: string, max = SUMMARY_MAX_LENGTH): string | undefined {
  const trimmed = summary.trim()
  if (!trimmed) return 'the summary is empty'
  if (trimmed.length > max) {
    const over = trimmed.length - max
    return `the summary is ${trimmed.length} characters, ${over} too many (max ${max}). Cut about ${over + 20} characters and call the tool again.`
  }
  const lower = norm(trimmed)
  if (GENERIC_SUMMARY_STARTS.some(s => lower.startsWith(s))) {
    return 'the summary must open on the concrete subject, not on a filler phrase like "Ce jeu de données…" / "This dataset…". Rephrase and call the tool again.'
  }
  return undefined
}

type CustomDefinition = NonNullable<NonNullable<MetadataContext['datasetsMetadata']>['custom']>[number]

// same rules as customMetadataSchema, checked here so the model gets a precise reason instead of a failed save
const checkCustomItem = (item: any, definition: CustomDefinition): { value?: unknown, error?: string } => {
  switch (definition.type ?? 'string') {
    case 'integer':
    case 'number': {
      const n = typeof item === 'string' && item.trim() ? Number(item) : item
      if (typeof n !== 'number' || !Number.isFinite(n) || (definition.type === 'integer' && !Number.isInteger(n))) return { error: `${JSON.stringify(item)} is not ${definition.type === 'integer' ? 'an integer' : 'a number'}` }
      return { value: n }
    }
    case 'date':
      if (typeof item !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.trim()) || isNaN(Date.parse(item.trim()))) return { error: `${JSON.stringify(item)} is not a date in YYYY-MM-DD form` }
      return { value: item }
    case 'link': {
      const link = typeof item === 'string' ? { url: item } : item
      if (typeof link?.url !== 'string' || !/^https?:\/\/\S+$/.test(link.url.trim())) return { error: `${JSON.stringify(item)} is not a link: pass an http(s) URL, or { url, title }` }
      return { value: typeof link.title === 'string' ? { url: link.url, title: link.title } : { url: link.url } }
    }
    default: {
      if (typeof item !== 'string') return { error: `${JSON.stringify(item)} is not a text` }
      if (!definition.enum?.length) return { value: item }
      const match = definition.enum.find(v => norm(v) === norm(item))
      return match ? { value: match } : { error: `"${item}" is not in the list. Available: ${definition.enum.join(' | ')}` }
    }
  }
}

/**
 * Turn an agent-supplied metadata patch into the subset that may actually be written,
 * plus a per-field account of what happened. Never throws: an invalid field is reported
 * so the model can correct it, while the valid ones still land.
 */
export function buildMetadataPatch (input: MetadataInput, current: any, ctx: MetadataContext): MetadataResult {
  const patch: Record<string, any> = {}
  const outcomes: FieldOutcome[] = []
  const equal = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

  const apply = (field: string, value: any) => {
    if (equal(value, current?.[field])) {
      outcomes.push({ field, status: 'unchanged' })
      return
    }
    patch[field] = value
    outcomes.push({ field, status: 'applied' })
  }
  const reject = (field: string, reason: string) => outcomes.push({ field, status: 'rejected', reason })

  const gate = (field: string): boolean => {
    if (isFieldAvailable(field, ctx)) return true
    reject(field, `the field "${field}" is disabled in this organization's dataset metadata settings, so it is not shown in the form — refusing to write a value the user cannot review`)
    return false
  }

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) reject('title', 'the title cannot be empty')
    else apply('title', title)
  }

  if (input.summary !== undefined) {
    const err = validateSummary(input.summary, summaryMaxLength(ctx))
    if (err) reject('summary', err)
    else apply('summary', input.summary.trim())
  }

  if (input.description !== undefined) {
    apply('description', input.description)
  }

  if (input.keywords !== undefined && gate('keywords')) {
    const keywords = [...new Set(input.keywords.map(k => k.trim()).filter(Boolean))]
    if (!keywords.length) reject('keywords', 'no usable keyword in the list')
    else apply('keywords', keywords)
  }

  if (input.searchTerms !== undefined && gate('searchTerms')) {
    const searchTerms = input.searchTerms.trim()
    if (searchTerms.length > SEARCH_TERMS_MAX_LENGTH) {
      reject('searchTerms', `the search terms are ${searchTerms.length} characters, max ${SEARCH_TERMS_MAX_LENGTH}. Keep the most useful terms and call the tool again.`)
    } else {
      apply('searchTerms', searchTerms)
    }
  }

  if (input.license !== undefined) {
    if (input.license === null || input.license === '') {
      apply('license', null)
    } else if (!ctx.licenses.length) {
      reject('license', 'this organization has no licence configured, the form shows an empty list')
    } else {
      const license = resolveLicense(input.license, ctx.licenses)
      if (!license) {
        reject('license', `unknown licence "${input.license}". Available: ${ctx.licenses.map(l => l.title).join(' | ')}`)
      } else {
        apply('license', { title: license.title, href: license.href })
      }
    }
  }

  if (input.topics !== undefined) {
    if (!ctx.topics.length) {
      reject('topics', 'this organization has no topic configured, the form does not show the field')
    } else {
      const resolved: Topic[] = []
      const unknown: string[] = []
      for (const value of input.topics) {
        const topic = resolveTopic(value, ctx.topics)
        if (topic) resolved.push({ id: topic.id, title: topic.title })
        else unknown.push(value)
      }
      if (unknown.length) {
        reject('topics', `unknown topic(s) ${unknown.map(u => `"${u}"`).join(', ')}. Available: ${ctx.topics.map(t => t.title).join(' | ')}`)
      } else {
        apply('topics', resolved)
      }
    }
  }

  if (input.origin !== undefined) apply('origin', input.origin.trim())

  if (input.creator !== undefined && gate('creator')) apply('creator', input.creator.trim())

  if (input.frequency !== undefined && gate('frequency')) {
    const frequency = input.frequency.trim()
    if (frequency && !(FREQUENCY_VALUES as readonly string[]).includes(frequency)) {
      reject('frequency', `unknown frequency "${frequency}". Available: ${FREQUENCY_VALUES.join(' | ')}`)
    } else {
      apply('frequency', frequency)
    }
  }

  if (input.spatial !== undefined && gate('spatial')) apply('spatial', input.spatial.trim())

  if (input.customMetadata !== undefined) {
    const definitions = (ctx.datasetsMetadata?.custom ?? []).filter(d => d.key)
    const next: Record<string, unknown> = { ...current?.customMetadata }
    let changed = false
    for (const [name, raw] of Object.entries(input.customMetadata)) {
      const definition = definitions.find(d => d.key === name) ?? definitions.find(d => norm(d.title) === norm(name))
      const field = `customMetadata.${definition?.title ?? name}`
      if (current?.partOf) {
        outcomes.push({ field, status: 'rejected', reason: 'this dataset is part of another resource, the form does not show its custom metadata' })
        continue
      }
      if (!definition) {
        outcomes.push({ field, status: 'rejected', reason: definitions.length ? `unknown custom metadata "${name}". Available: ${definitions.map(d => d.title).join(' | ')}` : 'this organization defines no custom metadata' })
        continue
      }
      const key = definition.key!
      let value: unknown
      if (!isCustomMetadataEmpty(raw)) {
        const multiple = (definition.type ?? 'string') === 'string' && definition.multiple
        const items = multiple ? (Array.isArray(raw) ? raw : [raw]) : [raw]
        if (!multiple && Array.isArray(raw)) {
          outcomes.push({ field, status: 'rejected', reason: 'this custom metadata takes a single value, not a list' })
          continue
        }
        const checked = items.map(item => checkCustomItem(item, definition))
        const error = checked.find(c => c.error)?.error
        if (error) {
          outcomes.push({ field, status: 'rejected', reason: error })
          continue
        }
        const trimmed: Record<string, unknown> = { [key]: multiple ? checked.map(c => c.value) : checked[0].value }
        trimCustomMetadata(trimmed)
        value = trimmed[key]
      }
      if (JSON.stringify(value ?? null) === JSON.stringify(current?.customMetadata?.[key] ?? null)) {
        outcomes.push({ field, status: 'unchanged' })
        continue
      }
      if (value === undefined) delete next[key]
      else next[key] = value
      changed = true
      outcomes.push({ field, status: 'applied' })
    }
    if (changed) patch.customMetadata = next
  }

  return { patch, outcomes }
}

/** Human-readable account of a `set_dataset_metadata` call, returned to the model. */
export function formatMetadataOutcomes (outcomes: FieldOutcome[]): string {
  if (!outcomes.length) return 'No field supplied, nothing to do.'
  const applied = outcomes.filter(o => o.status === 'applied').map(o => o.field)
  const unchanged = outcomes.filter(o => o.status === 'unchanged').map(o => o.field)
  const rejected = outcomes.filter(o => o.status === 'rejected')

  const lines: string[] = []
  if (applied.length) lines.push(`Applied to the form (not saved yet — the user reviews and clicks Enregistrer): ${applied.join(', ')}.`)
  if (unchanged.length) lines.push(`Already had that value, left alone: ${unchanged.join(', ')}.`)
  for (const r of rejected) lines.push(`REJECTED ${r.field}: ${r.reason}`)
  if (!applied.length && !rejected.length && unchanged.length) lines.push('Nothing changed.')
  return lines.join('\n')
}

/**
 * The context block `read_dataset_metadata` returns: current values plus the closed
 * vocabularies, so the model proposes a licence or a topic that actually exists instead
 * of inventing one and burning a round-trip on the rejection.
 */
export function formatMetadataContext (dataset: any, ctx: MetadataContext): string {
  const sections: string[] = []
  const val = (v: any) => (v == null || v === '' || (Array.isArray(v) && !v.length)) ? '(empty)' : v

  sections.push(`# Metadata: ${dataset?.title ?? '(untitled)'}`)
  sections.push('')
  sections.push('## Current values')
  const renamed = Object.entries(ctx.datasetsMetadata ?? {}).filter(([key, v]) => key !== 'custom' && v?.title).map(([key, v]) => `${key} is labelled « ${v.title} »`)
  if (renamed.length) sections.push(`(in the form, ${renamed.join(', ')})`)
  sections.push(`- title: ${val(dataset?.title)}`)
  sections.push(`- summary: ${val(dataset?.summary)}`)
  sections.push(`- description: ${dataset?.description ? `${dataset.description.length} characters` : '(empty)'}`)
  sections.push(`- license: ${val(dataset?.license?.title)}`)
  sections.push(`- topics: ${val((dataset?.topics ?? []).map((t: any) => t.title).join(', '))}`)
  sections.push(`- keywords: ${val((dataset?.keywords ?? []).join(', '))}`)
  sections.push(`- searchTerms: ${val(dataset?.searchTerms)} (never displayed, only used by the catalog search)`)
  sections.push(`- origin: ${val(dataset?.origin)}`)
  sections.push(`- creator: ${val(dataset?.creator)}`)
  sections.push(`- frequency: ${val(dataset?.frequency)}`)
  sections.push(`- spatial: ${val(dataset?.spatial)}`)

  sections.push('')
  sections.push('## Allowed values')
  sections.push(ctx.licenses.length
    ? `- license (pass the title or the href): ${ctx.licenses.map(l => l.title).join(' | ')}`
    : '- license: none configured for this organization, the field cannot be set')
  sections.push(ctx.topics.length
    ? `- topics (pass the title or the id): ${ctx.topics.map(t => t.title).join(' | ')}`
    : '- topics: none configured for this organization, the field cannot be set')
  sections.push(`- frequency: ${FREQUENCY_VALUES.join(' | ')}`)

  const disabled = OPTIONAL_FIELDS.filter(f => !isFieldAvailable(f, ctx))
  sections.push(disabled.length
    ? `- disabled in this organization (cannot be written): ${disabled.join(', ')}`
    : '- every optional field is enabled for this organization')

  const range = (min?: number, max?: number) => min !== undefined && max !== undefined ? `${min} to ${max}` : min !== undefined ? `at least ${min}` : max !== undefined ? `at most ${max}` : undefined
  sections.push('')
  sections.push("## Recommended sizes (this organization's settings, follow them when writing)")
  for (const [field, unit] of [['summary', 'characters'], ['description', 'characters'], ['keywords', 'values']]) {
    const { min, max } = recommendedSize(field, ctx.datasetsMetadata)
    if (range(min, max)) sections.push(`- ${field}: ${range(min, max)} ${unit}`)
  }

  const custom = (ctx.datasetsMetadata?.custom ?? []).filter(c => c.key)
  if (custom.length) {
    sections.push('')
    sections.push('## Custom metadata (defined by this organization, set them with set_dataset_metadata customMetadata, keyed by title)')
    for (const c of custom) {
      const value = dataset?.customMetadata?.[c.key!]
      const details = [
        c.type ?? 'string',
        c.enum?.length && `values: ${c.enum.join(' | ')}`,
        c.multiple && 'several values',
        range(c.recommendedMin, c.recommendedMax) && `recommended ${range(c.recommendedMin, c.recommendedMax)} ${c.multiple ? 'values' : 'characters'}`
      ].filter(Boolean).join(', ')
      sections.push(`- ${c.title} (${details}): ${isCustomMetadataEmpty(value) ? '(empty)' : formatCustomMetadata(value)}${c.description ? ` — help shown in the form: ${c.description}` : ''}`)
    }
  }

  return sections.join('\n')
}
