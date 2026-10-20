import { test, expect } from '@playwright/test'
import * as lops from '../../../api/src/integrity/lines-operations.ts'

const owner = { type: 'organization', id: 'acme' }

test('line revision keys follow the lines layout and URI-encode the line id', () => {
  expect(lops.linesPrefix(owner, 'ds1')).toBe('data-fair/organization-acme/ds1/lines/')
  expect(lops.lineRevisionPrefix(owner, 'ds1', 'a/b')).toBe('data-fair/organization-acme/ds1/lines/a%2Fb/')
  expect(lops.lineRevisionKey(owner, 'ds1', 'l1', 42, 'abc'))
    .toBe('data-fair/organization-acme/ds1/lines/l1/0000000000000042-abc')
})

test('parseLineRevisionKey round-trips, including deleted marker and encoded ids', () => {
  const key = lops.lineRevisionKey(owner, 'ds1', 'a/b', 7, 'deadbeef')
  expect(lops.parseLineRevisionKey(key)).toEqual({ lineId: 'a/b', i: 7, sha256: 'deadbeef', deleted: false })
  const tomb = lops.lineRevisionKey(owner, 'ds1', 'l2', 9, lops.DELETED_MARKER)
  expect(lops.parseLineRevisionKey(tomb)).toEqual({ lineId: 'l2', i: 9, deleted: true })
  expect(lops.parseLineRevisionKey('data-fair/organization-acme/ds1/000000007')).toBeUndefined()
})

test('lineWhoKey appends the .who suffix to the line revision key', () => {
  const key = lops.lineRevisionKey(owner, 'ds1', 'l1', 7, 'abc')
  expect(lops.lineWhoKey(owner, 'ds1', 'l1', 7, 'abc')).toBe(`${key}.who`)
})

test('parseLineRevisionKey excludes .who sibling keys explicitly (not by lexical luck)', () => {
  const who = lops.lineWhoKey(owner, 'ds1', 'l1', 7, 'deadbeef')
  expect(lops.parseLineRevisionKey(who)).toBeUndefined()
  const tombWho = lops.lineWhoKey(owner, 'ds1', 'l2', 9, lops.DELETED_MARKER)
  expect(lops.parseLineRevisionKey(tombWho)).toBeUndefined()
})

test('foldLatestLineAnchors / latestLineAnchors are blind to .who siblings by construction', () => {
  const keys = [
    lops.lineRevisionKey(owner, 'ds1', 'l1', 3, 'bbb'),
    lops.lineWhoKey(owner, 'ds1', 'l1', 3, 'bbb'),
    // orphan who ahead of any landed revision for that index — must not be picked up as an anchor
    lops.lineWhoKey(owner, 'ds1', 'l1', 4, 'ccc')
  ]
  const anchors = lops.latestLineAnchors(keys)
  expect(anchors.get('l1')).toMatchObject({ i: 3, sha256: 'bbb', deleted: false })
})

test('cleanedLineBody drops every underscore-prefixed field', () => {
  expect(lops.cleanedLineBody({ a: 1, _id: 'x', _i: 2, _hash: 'h', _ext_geo: { lat: 0 }, _updatedBy: 'u' }))
    .toEqual({ a: 1 })
})

test('lineSha256 is stable under key order and blind to internal fields', () => {
  const h1 = lops.lineSha256({ a: 1, b: 'x', _i: 5 })
  const h2 = lops.lineSha256({ b: 'x', a: 1, _i: 999, _needsIndexing: true })
  expect(h1).toBe(h2)
  expect(lops.lineSha256({ a: 2, b: 'x' })).not.toBe(h1)
})

test('latestLineAnchors keeps the highest index per line', () => {
  const keys = [
    lops.lineRevisionKey(owner, 'ds1', 'l1', 1, 'aaa'),
    lops.lineRevisionKey(owner, 'ds1', 'l1', 3, 'bbb'),
    lops.lineRevisionKey(owner, 'ds1', 'l2', 2, lops.DELETED_MARKER)
  ]
  const anchors = lops.latestLineAnchors(keys)
  expect(anchors.get('l1')).toMatchObject({ i: 3, sha256: 'bbb', deleted: false })
  expect(anchors.get('l2')).toMatchObject({ i: 2, deleted: true })
})

test('classifyLine detects the three divergence shapes', () => {
  const line = { a: 1, _i: 3 }
  const sha = lops.lineSha256(line)
  expect(lops.classifyLine(line, { i: 3, sha256: sha, deleted: false })).toBe('ok')
  expect(lops.classifyLine(line, { i: 3, sha256: 'other', deleted: false })).toBe('edited')
  expect(lops.classifyLine(line, { i: 2, sha256: sha, deleted: false })).toBe('edited')
  expect(lops.classifyLine(line, undefined)).toBe('inserted')
  expect(lops.classifyLine(line, { i: 3, deleted: true })).toBe('inserted')
})

const k = (lineId: string, i: number, sha = 'aa') => lops.lineRevisionKey(owner, 'ds1', lineId, i, sha)
const foldGroups = (pages: Array<Array<{ key: string, clean?: boolean }>>) => {
  const acc = lops.newLineGroupFold()
  const out: lops.LineAnchorGroup[] = []
  for (const page of pages) out.push(...lops.pushLineGroupKeys(acc, page))
  out.push(...lops.finishLineGroupFold(acc))
  return out
}

test('line group fold emits one latest anchor per line, equal to latestLineAnchors', () => {
  const keys = [k('a', 1), k('a', 5, 'bb'), k('a', 5, 'bb') + '.who', k('b', 2, lops.DELETED_MARKER), k('c', 3)].sort()
  const groups = foldGroups([keys.map((key) => ({ key }))])
  const reference = lops.latestLineAnchors(keys)
  expect(groups.map((g) => g.lineId).sort()).toEqual([...reference.keys()].sort())
  for (const g of groups) {
    const { key, i, sha256, deleted } = reference.get(g.lineId)!
    expect({ key: g.key, i: g.i, sha256: g.sha256, deleted: g.deleted }).toEqual({ key, i, sha256, deleted })
    expect(g.clean).toBe(true)
  }
})

test('line group fold keeps the lexically-first key on an equal-i tie (same as latestLineAnchors)', () => {
  const keys = [k('a', 5, 'ff'), k('a', 5, '00')].sort()
  const [g] = foldGroups([keys.map((key) => ({ key }))])
  expect(g.key).toBe(lops.latestLineAnchors(keys).get('a')!.key)
})

test('line group fold handles a group straddling pages and prefix-related ids', () => {
  // 'a-b' sorts BEFORE 'a' in S3 key order ('-' < '/'), the reverse of their raw order
  const keys = [k('a', 1), k('a', 2), k('a-b', 1), k('a/b', 4), k('é', 1)].sort()
  const pages = [keys.slice(0, 2), keys.slice(2, 3), keys.slice(3)].map((p) => p.map((key) => ({ key })))
  const groups = foldGroups(pages)
  expect(groups.map((g) => g.lineId).sort()).toEqual(['a', 'a-b', 'a/b', 'é'].sort())
  expect(groups.find((g) => g.lineId === 'a')!.i).toBe(2)
})

test('line group fold carries the clean flag of the chosen latest key', () => {
  const groups = foldGroups([[{ key: k('a', 1), clean: true }, { key: k('a', 2), clean: false }, { key: k('b', 1), clean: false }, { key: k('b', 2), clean: true }]])
  expect(groups.find((g) => g.lineId === 'a')!.clean).toBe(false)
  expect(groups.find((g) => g.lineId === 'b')!.clean).toBe(true)
})
