import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { queryAdvice, shouldEmitHint, buildQueryHints, attachQueryHints, ignoredParamsAdvice, uncertainFilterAdvice } from '../../../api/src/misc/utils/query-advice.ts'
import { setReqDataset } from '../../../api/src/misc/utils/req-context.ts'

// minimal fake of the bits of an express Request the helper reads (the advice strings are
// plain English in the module — deliberately not internationalized, see query-advice.ts).
// the dataset is set through the req-context accessor (symbol-backed), like readDataset does.
const fakeReq = (path: string, query: Record<string, any> = {}, dataset?: any) => {
  const req = { path, query } as any
  if (dataset !== undefined) setReqDataset(req, dataset)
  return req
}

test.describe('queryAdvice', () => {
  test('empty string when no rule applies', () => {
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { after: '["x"]' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'estimate' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/safe-schema')), '')
  })

  test('count rule: fires on a /lines request that asks for an exact count', () => {
    const out = queryAdvice(fakeReq('/abc/lines', {}))
    assert.match(out, /Advice to optimize your queries/)
    assert.match(out, /count=estimate|count=false to skip the exact total-row count/)
  })

  test('count rule: also fires on the ODS records path', () => {
    assert.match(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', {})), /count=estimate|count=false to skip the exact total-row count/)
  })

  test('count rule: does not fire outside /lines or /records', () => {
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a' })), /count=estimate|count=false to skip the exact total-row count/)
  })

  test('deepPagination rule: deep native page or ODS offset fires, shallow does not', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', page: '100' })), /keyset pagination via the after parameter/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', page: '99' })), /keyset pagination via the after parameter/)
    assert.match(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', { offset: '1000' })), /keyset pagination via the after parameter/)
    assert.doesNotMatch(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', { offset: '999' })), /keyset pagination via the after parameter/)
  })

  test('aggSize rule: agg_size >= 100 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '100' })), /reduce agg_size/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '50' })), /reduce agg_size/)
  })

  test('aggSize rule: a multi-level field grouping fires even with a small agg_size', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a;b', agg_size: '10' })), /reduce agg_size/)
  })

  test('size rule: size >= 1000 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '1000' })), /fewer results per page/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '999' })), /fewer results per page/)
  })

  test('select rule: fires only when the dataset is known, wide, and no select param', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, wide)), /use the select parameter/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', select: 'f1,f2' }, wide)), /use the select parameter/)
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', select: '*' }, wide)), /use the select parameter/) // select=* == all fields
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, narrow)), /use the select parameter/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), /use the select parameter/)
  })

  test('multiple rules combine, count first', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const out = queryAdvice(fakeReq('/abc/lines', { page: '500', size: '2000' }, wide))
    assert.match(out, /count=estimate|count=false to skip the exact total-row count/)
    assert.match(out, /keyset pagination via the after parameter/)
    assert.match(out, /fewer results per page/)
    assert.match(out, /use the select parameter/)
    assert.ok(out.indexOf('count=estimate') < out.indexOf('keyset pagination'))
  })

  test('qFields rule: fires on a wide dataset searched with q and no q_fields', () => {
    const wide = { schema: Array.from({ length: 31 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, wide)), /q_fields=col1,col2/)
    assert.match(queryAdvice(fakeReq('/abc/lines', { _c_q: 'x' }, wide)), /q_fields=col1,col2/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x', q_fields: 'f1,f2' }, wide)), /q_fields=col1,col2/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', {}, wide)), /q_fields=col1,col2/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, narrow)), /q_fields=col1,col2/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' })), /q_fields=col1,col2/)
  })
})

test.describe('shouldEmitHint', () => {
  test('false silences the hint regardless of duration', () => {
    assert.equal(shouldEmitHint('false', 0), false)
    assert.equal(shouldEmitHint('false', 99999), false)
  })
  test('true emits regardless of duration', () => {
    assert.equal(shouldEmitHint('true', 0), true)
    assert.equal(shouldEmitHint('true', 99999), true)
  })
  test('auto emits only when ES step duration exceeds the slow-request threshold', () => {
    assert.equal(shouldEmitHint('auto', 0), false)
    assert.equal(shouldEmitHint('auto', 1000), false) // strictly greater than 1000ms
    assert.equal(shouldEmitHint('auto', 1001), true)
  })
})

test.describe('buildQueryHints / attachQueryHints', () => {
  test('returns standalone entries when a rule fires and hint=true', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', { hint: 'true' }, wide)
    const hints = buildQueryHints(req, 0)
    assert.ok(hints.length > 0)
    for (const hint of hints) {
      assert.ok(typeof hint === 'string' && hint.length > 0)
      assert.equal(hint[0] !== ' ', true) // entries are trimmed
    }
  })
  test('empty when hint=false even with a slow query and matching rule', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    assert.deepEqual(buildQueryHints(fakeReq('/abc/lines', { hint: 'false' }, wide), 99999), [])
  })
  test('no perf entries when hint=auto and the query was fast', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    assert.deepEqual(buildQueryHints(fakeReq('/abc/lines', {}, wide), 500), [])
  })
  test('perf entries appear when hint=auto and the query crossed the slow threshold', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const hints = buildQueryHints(fakeReq('/abc/lines', {}, wide), 1500)
    assert.ok(hints.some(h => /use the select parameter/.test(h)))
  })
  test('empty when no rule fires (even with hint=true)', () => {
    assert.deepEqual(buildQueryHints(fakeReq('/abc/lines', { hint: 'true', count: 'false', after: '["x"]' }), 99999), [])
  })
  test('treats unknown hint values as auto', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    assert.deepEqual(buildQueryHints(fakeReq('/abc/lines', { hint: 'banana' }, wide), 500), [])
    assert.ok(buildQueryHints(fakeReq('/abc/lines', { hint: 'banana' }, wide), 1500).length > 0)
  })
  test('correctness entries are duration-independent, and come before perf entries', () => {
    const ds = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })).concat([{ key: 'ville' } as any]) }
    const fast = buildQueryHints(fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds), 0)
    assert.ok(fast.some(h => /use ville_eq instead/.test(h)))
    assert.ok(!fast.some(h => /use the select parameter/.test(h)))
    const slow = buildQueryHints(fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds), 1500)
    const correctnessIdx = slow.findIndex(h => /use ville_eq instead/.test(h))
    const perfIdx = slow.findIndex(h => /use the select parameter/.test(h))
    assert.ok(correctnessIdx !== -1 && perfIdx !== -1 && correctnessIdx < perfIdx)
  })
  test('attachQueryHints merges into meta.hints, presence-as-signal', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const out: any = attachQueryHints(fakeReq('/abc/lines', { hint: 'true' }, wide), 0, { total: 5 })
    assert.ok(Array.isArray(out.meta.hints) && out.meta.hints.length > 0)
    const silent: any = attachQueryHints(fakeReq('/abc/lines', { hint: 'false' }, wide), 0, { total: 5 })
    assert.equal('meta' in silent, false)
    // an existing meta on the result is extended, not clobbered
    const merged: any = attachQueryHints(fakeReq('/abc/lines', { hint: 'true' }, wide), 0, { total: 5, meta: { totalMarginPct: 3 } } as any)
    assert.equal(merged.meta.totalMarginPct, 3)
    assert.ok(merged.meta.hints.length > 0)
  })
})

test.describe('uncertainFilterAdvice', () => {
  const schema = [
    { key: 'plain', type: 'string' },
    { key: 'wild', type: 'string', 'x-capabilities': { wildcard: true } },
    { key: 'bare', type: 'string', 'x-capabilities': { text: false, textStandard: false } }
  ]
  const flagged = { schema, _esIgnoredKeywordFields: ['plain', 'wild', 'bare'] }
  const clean = { schema, _esIgnoredKeywordFields: [] }

  test('no advice when the column is not flagged (clean data)', () => {
    assert.equal(uncertainFilterAdvice(fakeReq('/d/lines', { plain_starts: 'x' }, clean)), '')
  })
  test('no advice for _starts on a flagged column that has a wildcard alternative', () => {
    assert.equal(uncertainFilterAdvice(fakeReq('/d/lines', { wild_starts: 'x' }, flagged)), '')
  })
  test('fires for _starts on a flagged plain column without wildcard', () => {
    assert.match(uncertainFilterAdvice(fakeReq('/d/lines', { plain_starts: 'x' }, flagged)), /values longer than 200 characters/)
  })
  test('fires for _exists on a flagged pure-keyword column (no analyzed fallback)', () => {
    assert.match(uncertainFilterAdvice(fakeReq('/d/lines', { bare_exists: 'true' }, flagged)), /values longer than 200 characters/)
  })
  test('does NOT fire for _exists on a flagged plain column (union covers it)', () => {
    assert.equal(uncertainFilterAdvice(fakeReq('/d/lines', { plain_exists: 'true' }, flagged)), '')
  })
  test('does NOT fire for _eq (operand-driven, never uncertain)', () => {
    assert.equal(uncertainFilterAdvice(fakeReq('/d/lines', { plain_eq: 'x' }, flagged)), '')
  })
})

test.describe('ignoredParamsAdvice', () => {
  const ds = {
    schema: [
      { key: 'ville', type: 'string' },
      { key: 'age', type: 'integer' },
      { key: 'cp', type: 'string', 'x-concept': { id: 'postalCode', primary: true } }
    ]
  }

  test('empty when only recognized params and valid column filters are present', () => {
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { size: '10', select: 'ville', sort: '-age', q: 'x', q_fields: 'ville' }, ds)), '')
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { ville_eq: 'Paris', age_gte: '18' }, ds)), '')
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_q: 'x', _c_bbox: '0,0,1,1' }, ds)), '')
  })

  test('legit concept filter that resolves to a primary concept is not flagged', () => {
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_postalCode_eq: '75001' }, ds)), '')
  })

  test('Tier 1: _c_ on a column key suggests the bare column filter', () => {
    const out = ignoredParamsAdvice(fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds))
    assert.match(out, /Some parameters were ignored/)
    assert.match(out, /use ville_eq instead/)
  })

  test('Tier 2: _c_ matching no concept and no column is flagged as inert', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_foo_eq: 'x' }, ds)), /matched no concept in this dataset/)
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_foo: 'x' }, ds)), /matched no concept in this dataset/)
  })

  test('unknown / misspelled parameter is flagged', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { siez: '10' }, ds)), /not a recognized query parameter/)
  })

  test('no schema on request: still flags unrecognized scalar params, skips column checks', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { siez: '10' })), /not a recognized query parameter/)
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { size: '10' })), '')
  })

  test('drift guard: no documented data-endpoint param is ever flagged', () => {
    const documented = {
      size: '1',
      page: '1',
      after: '["x"]',
      count: 'false',
      select: 'ville',
      sort: 'age',
      truncate: '100',
      thumbnail: '300x200',
      html: 'true',
      format: 'json',
      hint: 'true',
      draft: 'true',
      q: 'x',
      q_fields: 'ville',
      q_mode: 'complete',
      qs: 'ville:Paris',
      highlight: 'ville',
      owner: 'u',
      account: 'a',
      bbox: '0,0,1,1',
      geo_distance: '0,0,1km',
      date_match: '2020-01-01',
      xyz: '1,2,3',
      wkt: 'POINT(0 0)',
      _c_q: 'x',
      _c_bbox: '0,0,1,1',
      _c_geo_distance: '0,0,1km',
      _c_date_match: '2020-01-01',
      agg_size: '10',
      field: 'ville',
      metric: 'avg',
      metric_field: 'age',
      metrics: 'avg',
      extra_metrics: 'x',
      percents: '50',
      precision_threshold: '100',
      interval: 'month',
      calendar: 'true',
      missing: '0',
      analysis: 'standard',
      sampling: 'neighbors',
      collapse: 'ville',
      arrays: 'true',
      explain: 'true',
      fields: 'val',
      mimeType: 'text/csv',
      finalizedAt: '2020-01-01T00:00:00Z',
    }
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', documented, ds)), '')
  })
})
