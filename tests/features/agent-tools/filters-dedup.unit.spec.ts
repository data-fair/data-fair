import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { filtersGuide, filtersDescription, filterProperties } from '../../../agent-tools/_utils.ts'
import * as searchData from '../../../agent-tools/search-data.ts'
import * as aggregateData from '../../../agent-tools/aggregate-data.ts'
import * as calculateMetric from '../../../agent-tools/calculate-metric.ts'
import * as datasetDataSubagent from '../../../agent-tools/dataset-data-subagent.ts'

// The rich filter guide lives once in _utils and is embedded in the subagent prompt.
// Each tool param keeps only a terse, self-contained stub, so the full spec is no
// longer repeated across the three filtering tools' schemas.

test.describe('filtersGuide (the single rich source)', () => {
  test('covers the full suffix list', () => {
    for (const s of ['_eq', '_neq', '_in', '_nin', '_gt', '_gte', '_lt', '_lte', '_starts', '_exists', '_nexists', '_search', '_contains']) {
      assert.ok(filtersGuide.includes(s), `guide should mention ${s}`)
    }
  })

  test('covers the error-driven discovery and the _c_ rule', () => {
    assert.match(filtersGuide, /400/)
    assert.match(filtersGuide, /_c_/)
  })

  test('covers the geo and date params with formats', () => {
    assert.match(filtersGuide, /bbox/)
    assert.match(filtersGuide, /geoDistance|geo_distance/)
    assert.match(filtersGuide, /dateMatch|date_match/)
    assert.match(filtersGuide, /lonMin,latMin,lonMax,latMax/)
    assert.match(filtersGuide, /lon,lat,distance/)
    assert.match(filtersGuide, /YYYY-MM-DD/)
  })
})

test.describe('filtersDescription (the terse stub)', () => {
  test('is much shorter than the full guide', () => {
    assert.ok(filtersDescription.length < 400, `stub too long: ${filtersDescription.length}`)
    assert.ok(filtersGuide.length > filtersDescription.length * 2)
  })

  test('is self-contained for a flat client: construction rule, example, _c_ warning', () => {
    assert.match(filtersDescription, /column_key/)
    assert.match(filtersDescription, /ville_eq/)
    assert.match(filtersDescription, /_c_/)
  })

  test('does not inline the full suffix table (that lives in the guide)', () => {
    assert.ok(!filtersDescription.includes('_nexists'), 'stub should not carry the full suffix list')
  })
})

test.describe('terse self-contained geo/date param descriptions', () => {
  const geo = filterProperties as Record<string, { description: string }>
  test('bbox: one self-contained line with format + example', () => {
    assert.ok(geo.bbox.description.length < 140, `bbox too long: ${geo.bbox.description.length}`)
    assert.match(geo.bbox.description, /lonMin,latMin,lonMax,latMax/)
  })
  test('geoDistance: trimmed, no doubled lon-first note', () => {
    assert.ok(geo.geoDistance.description.length < 160, `geoDistance too long: ${geo.geoDistance.description.length}`)
    assert.match(geo.geoDistance.description, /lon,lat,distance/)
    // the redundant second lon hint "(lon=...)" is removed
    assert.ok(!/lon=2\.35/.test(geo.geoDistance.description), 'geoDistance should not repeat the lon-first note')
  })
  test('dateMatch: trimmed single line', () => {
    assert.ok(geo.dateMatch.description.length < 140, `dateMatch too long: ${geo.dateMatch.description.length}`)
    assert.match(geo.dateMatch.description, /YYYY-MM-DD/)
  })
})

test.describe('tool param wiring is unchanged', () => {
  test('all three filtering tools expose the stub on filters', () => {
    assert.equal(searchData.schema.inputSchema.properties.filters.description, filtersDescription)
    assert.equal(aggregateData.schema.inputSchema.properties.filters.description, filtersDescription)
    assert.equal(calculateMetric.schema.inputSchema.properties.filters.description, filtersDescription)
  })
})

test.describe('subagent prompt is the single home for the rich guide', () => {
  test('embeds filtersGuide verbatim', () => {
    assert.ok(datasetDataSubagent.prompt.includes(filtersGuide))
  })
})
