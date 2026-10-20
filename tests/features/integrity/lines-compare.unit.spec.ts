import { test, expect } from '@playwright/test'
import * as lops from '../../../api/src/integrity/lines-operations.ts'

const owner = { type: 'organization', id: 'acme' }
const key = (lineId: string, i: number, shaOrDeleted: string) => lops.lineRevisionKey(owner, 'ds1', lineId, i, shaOrDeleted)
const anchorOf = (line: lops.LiveLine) => key(line._id, line._i!, lops.lineSha256(line))
const tomb = (lineId: string, i: number) => key(lineId, i, lops.DELETED_MARKER)

// the pre-streaming algorithm, verbatim in spirit (checker.ts compareDatasetLines before this change)
const referenceCompare = (keys: string[], lines: lops.LiveLine[], excluded?: Set<string>) => {
  const anchors = lops.latestLineAnchors(keys)
  const unvisited = new Set(anchors.keys())
  const edited: string[] = []
  const inserted: string[] = []
  for (const line of lines) {
    unvisited.delete(line._id)
    const verdict = lops.classifyLine(line, anchors.get(line._id), excluded)
    if (verdict === 'edited') edited.push(line._id)
    else if (verdict === 'inserted') inserted.push(line._id)
  }
  const missing = [...unvisited].filter((id) => !anchors.get(id)!.deleted)
  return { checked: lines.length, diverged: edited.length + inserted.length + missing.length, edited: edited.sort(), inserted: inserted.sort(), missing: missing.sort() }
}

const streamedCompare = async (keys: string[], lines: lops.LiveLine[], batchSize: number, pageSize: number, excluded?: Set<string>, changed = false, liveAfter?: lops.LiveLine[]) => {
  const byId = new Map(lines.map((l) => [l._id, l]))
  const io: lops.LineCompareIO = {
    lookupLive: async (ids) => ids.map((id) => byId.get(id)).filter((l): l is lops.LiveLine => !!l),
    countLive: async () => (liveAfter ?? lines).length,
    changedDuringCompare: async () => changed,
    iterateLiveIds: async function * () { for (const l of liveAfter ?? lines) yield { _id: l._id, _i: l._i } }
  }
  const found: lops.LineDivergence[] = []
  const comparer = lops.createLineComparer(io, { batchSize, excluded, onDiverged: async (batch) => { found.push(...batch) } })
  const fold = lops.newLineGroupFold()
  const sorted = [...keys].sort()
  for (let n = 0; n < sorted.length; n += pageSize) {
    for (const g of lops.pushLineGroupKeys(fold, sorted.slice(n, n + pageSize).map((k) => ({ key: k })))) await comparer.push(g)
  }
  for (const g of lops.finishLineGroupFold(fold)) await comparer.push(g)
  const result = await comparer.finish()
  const ids = (kind: string) => found.filter((d) => d.kind === kind).map((d) => d.lineId).sort()
  return { ...result, edited: ids('edited'), inserted: ids('inserted'), missing: ids('missing'), found }
}

const line = (_id: string, _i: number, attr: string): lops.LiveLine => ({ _id, _i, attr })

// every divergence shape the checker distinguishes, plus ordering traps
const fixture = () => {
  const ok = line('ok', 10, 'x')
  const edited = line('edited', 11, 'tampered')
  const rewound = line('rewound', 3, 'y') // _i rewind: anchor at 12
  const inserted = line('inserted', 13, 'z')
  const tombLive = line('tomb-live', 14, 'w')
  const prefixA = line('a', 15, 'p')
  const prefixAB = line('a-b', 16, 'q')
  const unsafe = line('a/b é', 17, 'r')
  const inserted2 = line('inserted2', 18, 'z2')
  const lines = [ok, edited, rewound, inserted, inserted2, tombLive, prefixA, prefixAB, unsafe]
  const keys = [
    key('ok', 2, 'old'), anchorOf(ok), anchorOf(ok) + '.who',
    key('edited', 11, lops.lineSha256({ _id: 'edited', attr: 'original' })),
    key('rewound', 12, lops.lineSha256(rewound)),
    key('missing', 20, 'gone'),
    tomb('tomb-dead', 21),
    tomb('tomb-live', 22),
    anchorOf(prefixA), anchorOf(prefixAB), anchorOf(unsafe)
  ]
  return { keys, lines }
}

for (const batchSize of [1, 2, 1000]) {
  for (const pageSize of [1, 3, 1000]) {
    test(`streamed compare equals the reference (batch ${batchSize}, page ${pageSize})`, async () => {
      const { keys, lines } = fixture()
      const expected = referenceCompare(keys, lines)
      const actual = await streamedCompare(keys, lines, batchSize, pageSize)
      expect({ checked: actual.checked, diverged: actual.diverged, edited: actual.edited, inserted: actual.inserted, missing: actual.missing })
        .toEqual({ checked: expected.checked, diverged: expected.diverged, edited: expected.edited, inserted: expected.inserted, missing: expected.missing })
    })
  }
}

test('delete X then insert Y out-of-band: both reported', async () => {
  const x = line('x', 1, 'a')
  const y = line('y', 2, 'b')
  const actual = await streamedCompare([anchorOf(x)], [y], 1000, 1000)
  expect(actual.missing).toEqual(['x'])
  expect(actual.inserted).toEqual(['y'])
  expect(actual.diverged).toBe(2)
})

test('divergences carry the anchor key and index needed by the repairs', async () => {
  const { keys, lines } = fixture()
  const actual = await streamedCompare(keys, lines, 1000, 1000)
  const missing = actual.found.find((d) => d.lineId === 'missing')!
  expect(missing.anchor).toEqual({ key: key('missing', 20, 'gone'), i: 20 })
  const insertedNoAnchor = actual.found.find((d) => d.lineId === 'inserted')!
  expect(insertedNoAnchor.anchor).toBeUndefined()
  const tombLive = actual.found.find((d) => d.lineId === 'tomb-live')!
  expect(tombLive).toMatchObject({ kind: 'inserted', anchor: { key: tomb('tomb-live', 22), i: 22 } })
})

test('edited/inserted divergences carry the compared live _i, missing ones none (repairs skip lines rewritten since)', async () => {
  const { keys, lines } = fixture()
  const actual = await streamedCompare(keys, lines, 2, 3)
  const lineI = (id: string) => actual.found.find((d) => d.lineId === id)!.lineI
  expect(lineI('edited')).toBe(11)
  expect(lineI('rewound')).toBe(3) // the live _i, not the anchor's 12
  expect(lineI('tomb-live')).toBe(14) // pass-A insert (tombstone latest)
  expect(lineI('inserted')).toBe(13) // pass-B insert (no anchor at all)
  expect(lineI('inserted2')).toBe(18)
  expect(lineI('missing')).toBeUndefined()
})

test('duplicate group cannot hide an insert (forged non-canonical key decoding to an existing id)', async () => {
  const a = line('a', 5, 'v')
  const zero = line('0', 7, 'u')
  const y = line('y', 6, 'w')
  // `%61` decodes to 'a' but sorts before `0/` and `a/` ('%' < '0' < 'a'): with line '0' in
  // between, the group fold emits 'a' twice (non-adjacent groups)
  const forged = `${lops.linesPrefix(owner, 'ds1')}%61/${lops.padLineIndex(5)}-${lops.lineSha256(a)}`
  const actual = await streamedCompare([anchorOf(a), forged, anchorOf(zero)], [a, zero, y], 1000, 1000)
  expect(actual.found.filter((d) => d.lineId === 'a')).toEqual([]) // both 'a' groups classify ok
  expect(actual.inserted).toEqual(['y'])
  expect(actual.diverged).toBe(1)
})

test('no live lines and only tombstones: clean', async () => {
  const actual = await streamedCompare([tomb('t1', 1), tomb('t2', 2)], [], 2, 2)
  expect(actual).toMatchObject({ checked: 0, diverged: 0 })
})

test('lineIdFingerprint is stable and 64-bit', () => {
  expect(lops.lineIdFingerprint('abc')).toBe(lops.lineIdFingerprint('abc'))
  expect(lops.lineIdFingerprint('abc')).not.toBe(lops.lineIdFingerprint('abd'))
  expect(lops.lineIdFingerprint('abc') < 2n ** 64n).toBe(true)
})

test('excluded columns are ignored by both compares', async () => {
  const l = { _id: 'e1', _i: 1, attr: 'x', volatile: 'changed' }
  const keys = [anchorOf({ _id: 'e1', _i: 1, attr: 'x' })]
  const excluded = new Set(['volatile'])
  const expected = referenceCompare(keys, [l], excluded)
  const actual = await streamedCompare(keys, [l], 1000, 1000, excluded)
  expect(expected.diverged).toBe(0)
  expect(actual).toMatchObject({ checked: 1, diverged: 0 })
})

test('delete accounted X + insert Y during the compare: Y named when changedDuringCompare', async () => {
  const x = line('x', 1, 'a')
  const y = line('y', 2, 'b')
  // pass A sees x live; by the time the count is taken x is gone and y is there
  const byId = new Map([[x._id, x]])
  const io: lops.LineCompareIO = {
    lookupLive: async (ids) => ids.map((id) => byId.get(id)).filter((l): l is lops.LiveLine => !!l),
    countLive: async () => 1,
    changedDuringCompare: async () => true,
    iterateLiveIds: async function * () { yield { _id: y._id, _i: y._i } }
  }
  const found: lops.LineDivergence[] = []
  const comparer = lops.createLineComparer(io, { onDiverged: async (b) => { found.push(...b) } })
  const fold = lops.newLineGroupFold()
  for (const g of lops.pushLineGroupKeys(fold, [{ key: anchorOf(x) }])) await comparer.push(g)
  for (const g of lops.finishLineGroupFold(fold)) await comparer.push(g)
  const result = await comparer.finish()
  expect(found.filter((d) => d.kind === 'inserted').map((d) => d.lineId)).toEqual(['y'])
  expect(result.diverged).toBeGreaterThanOrEqual(1)
})
