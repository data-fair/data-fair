import { capabilityPresets, type DatasetSpec } from './generator.ts'

/** Named dataset specs. Row counts are conservative defaults — override with --rows. */
export const presets: Record<string, DatasetSpec> = {
  small: {
    id: 'bench-small',
    rows: 1000,
    columns: [
      { type: 'string', count: 2, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 1 },
      { type: 'number', count: 1 },
      { type: 'date', count: 1 }
    ],
    geo: true
  },
  tall: {
    id: 'bench-tall',
    rows: 2_000_000,
    columns: [
      { type: 'string', count: 1, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 2 },
      { type: 'date', count: 1 }
    ]
  },
  'wide-text': {
    id: 'bench-wide-text',
    rows: 300_000,
    columns: [
      { type: 'string', count: 40, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 10, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 3 },
      { type: 'date', count: 1 }
    ]
  },
  mixed: {
    id: 'bench-mixed',
    rows: 500_000,
    columns: [
      { type: 'string', count: 8, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 4, capabilities: capabilityPresets.searchOnly },
      { type: 'string', count: 6, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 5 },
      { type: 'number', count: 4 },
      { type: 'date', count: 2 },
      { type: 'boolean', count: 2 }
    ],
    geo: true
  }
}

/** Look up a preset by name, returning an independent clone (safe to mutate). */
export function getPreset (name: string): DatasetSpec {
  const preset = presets[name]
  if (!preset) throw new Error(`unknown preset "${name}" — available: ${Object.keys(presets).join(', ')}`)
  return structuredClone(preset)
}
