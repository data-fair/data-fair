/**
 * The row check of the line edition simulations compares the lines a dataset ends up with to the
 * final state a case expects, field by field, after normalizing what the API may legitimately
 * return in another shape (a multi-valued column as a joined string, a date with a time part).
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { checkRows } from '../../../simulations/runner/row-check.ts'

const schema = [
  { key: 'nom', type: 'string' },
  { key: 'activites', type: 'string', separator: ', ' },
  { key: 'debut', type: 'string', format: 'date' },
  { key: 'actif', type: 'boolean' },
  { key: 'places', type: 'integer' },
  { key: 'surface', type: 'number' },
  { key: 'telephone', type: 'string' },
  { key: '_code_insee.departement', type: 'string' }
]

const check = (fields: Record<string, unknown>, row: Record<string, unknown>, match: Record<string, unknown> = { nom: 'A' }) =>
  checkRows({ rows: [{ match, fields }], totalRows: 1 }, [{ nom: 'A', ...row }], schema)

test.describe('line edition row check', () => {
  test('multi-values compare as sets', () => {
    const r = check({ activites: ['yoga', 'natation'] }, { activites: 'natation, yoga' })
    assert.equal(r.fieldsCorrect, 1)
    assert.equal(r.rowsExact, 1)
    assert.equal(check({ activites: ['yoga'] }, { activites: 'natation, yoga' }).diffs.length, 1)
  })

  test('dates compare on the day', () => {
    assert.equal(check({ debut: '2026-03-01' }, { debut: '2026-03-01T00:00:00.000Z' }).fieldsCorrect, 1)
    const r = check({ debut: '2026-03-01' }, { debut: '2026-03-02' })
    assert.equal(r.fieldsCorrect, 0)
    assert.equal(r.diffs[0].field, 'debut')
  })

  test('strings are trimmed, case kept', () => {
    assert.equal(check({ telephone: ' Gymnase ' }, { telephone: 'Gymnase' }).fieldsCorrect, 1)
    assert.equal(check({ telephone: 'gymnase' }, { telephone: 'Gymnase' }).diffs.length, 1)
  })

  test('booleans and numbers by value', () => {
    assert.equal(check({ actif: true }, { actif: 'true' }).fieldsCorrect, 1)
    assert.equal(check({ places: 12 }, { places: '12' }).fieldsCorrect, 1)
    assert.equal(check({ surface: 12 }, { surface: '12' }).fieldsCorrect, 1)
    assert.equal(check({ places: 12 }, { places: 13 }).fieldsCorrect, 0)
  })

  test('missing field counts as wrong', () => {
    const r = check({ telephone: '0102030405' }, {})
    assert.equal(r.fieldsCorrect, 0)
    assert.equal(r.rowsExact, 0)
    assert.equal(r.diffs[0].actual, undefined)
    assert.equal(r.diffs[0].expected, '0102030405')
  })

  test('listed extension fields are compared', () => {
    assert.equal(check({ '_code_insee.departement': '38' }, { '_code_insee.departement': '38', _id: 'x' }).fieldsCorrect, 1)
    assert.equal(check({ '_code_insee.departement': '38' }, { '_code_insee.departement': '69' }).diffs.length, 1)
  })

  test('unlisted fields are ignored', () => {
    const r = check({ telephone: '1' }, { telephone: '1', _id: 'x', _i: 3, extra: 'y' })
    assert.equal(r.rowsExact, 1)
  })

  test('absent rows', () => {
    const r = checkRows({ rows: [], absent: [{ nom: 'A' }, { nom: 'Z' }], totalRows: 1 }, [{ nom: 'A' }], schema)
    assert.deepEqual(r.unexpectedPresent, [{ nom: 'A' }])
    assert.deepEqual(r.totalRows, { expected: 1, actual: 1 })
  })

  test('ambiguous match', () => {
    const r = checkRows({ rows: [{ match: { nom: 'A' }, fields: { telephone: '1' } }], totalRows: 2 }, [{ nom: 'A' }, { nom: 'A' }], schema)
    assert.equal(r.rowsFound, 0)
    assert.equal(r.missing.length, 1)
    assert.equal(r.diffs.length, 1)
    assert.equal(r.diffs[0].actual, 2)
    assert.equal(r.fieldsExpected, 1)
    assert.equal(r.fieldsCorrect, 0)
  })

  test('no match at all', () => {
    const r = checkRows({ rows: [{ match: { nom: 'Q' }, fields: { telephone: '1' } }], totalRows: 0 }, [], schema)
    assert.equal(r.rowsExpected, 1)
    assert.equal(r.rowsFound, 0)
    assert.deepEqual(r.missing, [{ nom: 'Q' }])
    assert.equal(r.diffs[0].actual, 0)
  })
})
