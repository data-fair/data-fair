import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize, waitForDatasetError, doAndWaitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const fetchDiagnostic = (id: string) =>
  testUser1.get(`/api/v1/datasets/${id}/validation-diagnostic.csv`, { responseType: 'text', validateStatus: () => true })
const findEvent = async (id: string, type: string) =>
  (await testUser1.get(`/api/v1/datasets/${id}/journal`)).data.find((e: any) => e.type === type)

const defaultSchema = [{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }]

const upload = async (csv: string, constraints: any[], schema: any[] = defaultSchema) => {
  const form = new FormData()
  form.append('file', Buffer.from(csv), 'data.csv')
  form.append('schema', JSON.stringify(schema))
  form.append('constraints', JSON.stringify(constraints))
  return (await testUser1.post('/api/v1/datasets', form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })).data
}

test.describe('file dataset unique constraint', () => {
  test.beforeEach(async () => { await clean() })

  test('a duplicate multi-column key blocks the dataset and lists the rows', async () => {
    // The diagnostic `line` column is the 1-based DATA-row index (`_i`),
    // header excluded — see the existing validation-diagnostic spec.
    const csv = 'a,b\n' + [
      'x,1',  // data row 1
      'y,2',  // data row 2
      'x,1',  // data row 3  <- duplicate of data row 1
      'z,3'   // data row 4
    ].join('\n') + '\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.unicityErrorCount ?? 0) > 0, 'expected unicityErrorCount > 0')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    for (const r of rows.slice(1)) assert.match(r, /,unicity,/)
    // the message names the violated column combination
    for (const r of rows.slice(1)) assert.match(r, /Doublon d\u00E9tect\u00E9 : le couple \(a \+ b\) doit \u00EAtre unique\./)
    const lineNumbers = rows.slice(1).map((r: string) => Number(r.split(',')[0])).sort()
    assert.deepEqual(lineNumbers, [1, 3])
  })

  test('the diagnostic message uses column titles and a dedicated single-column wording', async () => {
    const csv = 'poste,siret\nchef,123\nchef,456\n'
    const ds = await upload(
      csv,
      [{ type: 'unique', properties: ['poste'] }],
      [{ key: 'poste', type: 'string', title: 'Poste' }, { key: 'siret', type: 'string' }]
    )
    await waitForDatasetError(testUser1, ds.id)

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n').slice(1)
    assert.ok(rows.length > 0)
    for (const r of rows) {
      assert.match(r, /Doublon d\u00E9tect\u00E9 : le champ \(Poste\) contient d\u00E9j\u00E0 cette valeur\. Chaque valeur de la colonne Poste doit \u00EAtre unique\./)
    }
  })

  test('a duplicate key on a date column shows a human-readable date in the diagnostic CSV, not epoch millis', async () => {
    // ES composite aggregation buckets return date-mapped columns as epoch millis; the
    // diagnostic raw_value must show the date the user entered instead.
    const csv = 'a,d\n' + [
      'x,2024-07-02',
      'y,2024-07-03',
      'x,2024-07-02', // duplicate of row 1
      'z,2024-07-04'
    ].join('\n') + '\n'
    const ds = await upload(
      csv,
      [{ type: 'unique', properties: ['a', 'd'] }],
      [{ key: 'a', type: 'string' }, { key: 'd', type: 'string', format: 'date' }]
    )
    await waitForDatasetError(testUser1, ds.id)

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    const rawValues = rows.slice(1).map((r: string) => r.split(',').pop())
    for (const rawValue of rawValues) {
      assert.equal(rawValue, 'x | 2024-07-02')
      assert.doesNotMatch(rawValue as string, /^\d+$/, 'raw_value must not be a bare epoch-millis number')
    }
  })

  test('a dataset with no duplicates finalizes normally', async () => {
    const csv = 'a,b\nx,1\ny,2\nz,3\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')
    assert.equal((await fetchDiagnostic(ds.id)).status, 404)
  })

  test('adding a constraint on a finalized dataset that violates it re-triggers indexing and errors', async () => {
    // uploaded with no constraint at all, so it finalizes despite the duplicate
    const csv = 'a,b\nx,1\ny,2\nx,1\nz,3\n'
    const ds = await upload(csv, [])
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')

    await testUser1.patch(`/api/v1/datasets/${ds.id}`, { constraints: [{ type: 'unique', properties: ['a', 'b'] }] })
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
  })

  test('dropping the constraint of an error-state dataset lets it re-finalize', async () => {
    const csv = 'a,b\n' + [
      'x,1',
      'y,2',
      'x,1',
      'z,3'
    ].join('\n') + '\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    await waitForDatasetError(testUser1, ds.id)

    const finalized = await doAndWaitForFinalize(testUser1, ds.id, () =>
      testUser1.patch(`/api/v1/datasets/${ds.id}`, { constraints: [] }))
    assert.equal(finalized.status, 'finalized')
    assert.deepEqual(finalized.constraints, [])
    assert.equal((await fetchDiagnostic(ds.id)).status, 404)
  })

  test('a constraint-only PATCH on a finalized dataset triggers exactly the reindexerStatus (validated)', async () => {
    // no other trigger in the status chain must fire for a plain constraint change
    const csv = 'a,b\nx,1\ny,2\nz,3\n'
    const ds = await upload(csv, [])
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')

    const patched = (await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })).data
    assert.equal(patched.status, 'validated')
    await waitForFinalize(testUser1, ds.id)
  })

  test('a combined PATCH changing an x-transform and constraints together re-applies both (not left at validated)', async () => {
    // Before the fix, the constraint branch sat above the schemasTransformChange branch in a
    // first-match-wins else-if chain, so a combined patch got 'validated' and the new
    // x-transform was never applied to the data.
    const csv = 'a,b\nX,1\ny,2\nz,3\n'
    const ds = await upload(csv, [])
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')

    const schema = finalized.schema.map((p: any) => p.key === 'a' ? { ...p, 'x-transform': { expr: 'LOWER(value)' } } : p)
    const patched = (await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      schema,
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })).data
    // 'analyzed' (not 'validated'): the schemasTransformChange branch of the status chain must
    // still fire so the transform gets (re)applied to the data, on top of the constraint gate.
    assert.equal(patched.status, 'analyzed')

    await waitForFinalize(testUser1, ds.id)
    const lines = (await testUser1.get(`/api/v1/datasets/${ds.id}/lines`, { params: { sort: 'b' } })).data.results
    assert.equal(lines[0].a, 'x') // transform was applied
    assert.equal((await fetchDiagnostic(ds.id)).status, 404) // and the constraint held (no duplicates)
  })

  test('cancelling an error draft clears the persisted task progress', async () => {
    // A draft that fails the unicity gate leaves taskProgress = { task: 'index', error: true }
    // on the journals doc. Cancelling the draft runs no worker afterwards (only finalize ever
    // $unsets taskProgress), so before the fix the UI task loader showed "Indexation" forever.
    const csv = 'a,b\nx,1\ny,2\nz,3\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    await waitForFinalize(testUser1, ds.id)

    // upload a violating file as a draft -> the draft errors during the index task
    const badCsv = 'a,b\nx,1\ny,2\nx,1\n'
    const form = new FormData()
    form.append('file', Buffer.from(badCsv), 'data.csv')
    await testUser1.post(`/api/v1/datasets/${ds.id}`, form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      params: { draft: true }
    })
    await waitForDatasetError(testUser1, ds.id, { draft: true })

    const before = (await testUser1.get(`/api/v1/datasets/${ds.id}/task-progress`)).data
    assert.equal(before.task, 'index')
    assert.equal(before.error, true)

    await testUser1.delete(`/api/v1/datasets/${ds.id}/draft`)
    const after = (await testUser1.get(`/api/v1/datasets/${ds.id}/task-progress`)).data
    assert.deepEqual(after, {}, 'task progress must be cleared when the draft is cancelled')
  })

  test('a unicity violation on a compatibleOrCancel draft auto-cancels the draft like a validation error', async () => {
    // valid initial file with the constraint -> finalized
    const csv = 'a,b\nx,1\ny,2\nz,3\n'
    const ds = await upload(csv, [{ type: 'unique', properties: ['a', 'b'] }])
    await waitForFinalize(testUser1, ds.id)

    // schema-compatible draft carrying a duplicate on (a,b)
    const badCsv = 'a,b\nx,1\ny,2\nx,1\n'
    const form = new FormData()
    form.append('file', Buffer.from(badCsv), 'data.csv')
    await testUser1.post(`/api/v1/datasets/${ds.id}`, form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      params: { draft: 'compatibleOrCancel' }
    })

    // poll for the draft-cancelled event (same pattern as the validation-diagnostic spec)
    let cancelEvent: any
    for (let i = 0; i < 60; i++) {
      const journal = (await testUser1.get(`/api/v1/datasets/${ds.id}/journal`)).data
      cancelEvent = journal.find((e: any) => e.type === 'draft-cancelled')
      if (cancelEvent) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(cancelEvent, 'expected draft-cancelled event after a unicity violation under compatibleOrCancel')
    assert.equal(cancelEvent.hasDiagnosticFile, true)
    assert.ok((cancelEvent.unicityErrorCount ?? 0) > 0, `expected unicityErrorCount > 0, got ${JSON.stringify(cancelEvent)}`)

    // the dataset reverted to the healthy published version: no draft, no error state, data intact
    const reverted = (await testUser1.get(`/api/v1/datasets/${ds.id}`, { params: { draft: true } })).data
    assert.equal(reverted.status, 'finalized')
    assert.equal(reverted.draftReason, undefined)
    const lines = await testUser1.get(`/api/v1/datasets/${ds.id}/lines`)
    assert.equal(lines.data.total, 3)

    // canonical diagnostic slot untouched; relocated cancelled-draft diagnostic downloadable
    assert.equal((await fetchDiagnostic(ds.id)).status, 404)
    const cancelledDiag = await testUser1.get(`/api/v1/datasets/${ds.id}/cancelled-draft-diagnostic.csv`, { responseType: 'text', validateStatus: () => true })
    assert.equal(cancelledDiag.status, 200)
    assert.match(cancelledDiag.data, /,unicity,/)

    // no stale task progress either (the index task ends as a cancelled-draft final task)
    const tp = (await testUser1.get(`/api/v1/datasets/${ds.id}/task-progress`)).data
    assert.deepEqual(tp, {})
  })

  test('a combined PATCH changing a validation rule and constraints together escalates past validation-updated', async () => {
    // A compatible-schema validation-rule-only patch on a finalized dataset normally lands on
    // 'validation-updated', which process-file.ts finalizes directly WITHOUT ever reaching
    // index-lines (see process-file.ts:103). Combined with a constraints change, the floor in
    // patch.ts must escalate this to 'analyzed' so BOTH the validation rule and the new
    // constraint actually get (re-)checked.
    const csv = 'id,val\nabc,1\ndef,1\n'
    const schemaBase = [{ key: 'id', type: 'string' }, { key: 'val', type: 'string' }]
    const ds = await upload(csv, [], schemaBase)
    const finalized = await waitForFinalize(testUser1, ds.id)
    assert.equal(finalized.status, 'finalized')

    // Precondition check (pinned, not just assumed): a validation-rule-only patch (no
    // constraints) on a comparable finalized dataset must land on 'validation-updated' - the
    // status the escalation branch below exists to route around. Asserted here on a throwaway
    // dataset so a regression upstream (e.g. schemasValidationCompatible) can't silently stop
    // this test from exercising the escalation branch it claims to cover.
    const dsPrecondition = await upload(csv, [], schemaBase)
    await waitForFinalize(testUser1, dsPrecondition.id)
    const patternOnlySchema = schemaBase.map(p => p.key === 'id' ? { ...p, pattern: '^[a-z]+$' } : p)
    const patternOnlyPatched = (await testUser1.patch(`/api/v1/datasets/${dsPrecondition.id}`, { schema: patternOnlySchema })).data
    assert.equal(patternOnlyPatched.status, 'validation-updated')

    const schema = finalized.schema.map((p: any) => p.key === 'id' ? { ...p, pattern: '^[a-z]+$' } : p)

    const patched = (await testUser1.patch(`/api/v1/datasets/${ds.id}`, {
      schema,
      constraints: [{ type: 'unique', properties: ['val'] }]
    })).data
    assert.equal(patched.status, 'analyzed')

    // val=1 is duplicated on both rows: the (re-applied) constraint must catch it.
    await waitForDatasetError(testUser1, ds.id)
    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.ok((errEvent.unicityErrorCount ?? 0) > 0, 'expected unicityErrorCount > 0 - the constraint gate must have run')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n').slice(1)
    assert.ok(rows.length > 0)
    // both "abc" and "def" satisfy the new pattern, so the only errors are unicity ones -
    // the validation rule was re-applied (and passed) rather than silently skipped
    for (const r of rows) assert.match(r, /,unicity,/)
  })
})
