import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setupMockRoute, clearMockRoutes } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const fetchDiagnostic = async (datasetId: string) => {
  return testUser1.get(`/api/v1/datasets/${datasetId}/validation-diagnostic.csv`, {
    responseType: 'text',
    validateStatus: () => true
  })
}

const findEvent = async (datasetId: string, type: string) => {
  const journal = (await testUser1.get(`/api/v1/datasets/${datasetId}/journal`)).data
  return journal.find((e: any) => e.type === type)
}

test.describe('validation diagnostic file', () => {
  test.beforeEach(async () => {
    await clean()
    await clearMockRoutes()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('schema-validation failures produce a downloadable diagnostic CSV with every failing row', async () => {
    // pattern-based rule that we know fires deterministically (no CSV-coercion ambiguity)
    const schema = [{ key: 'id', type: 'string', pattern: '^[a-z]+$' }]
    const csv = 'id\n' + [
      'abc',  // valid
      '123',  // pattern fail
      'GHI',  // pattern fail
      '456',  // pattern fail
      'jkl'   // valid
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'invalid.csv')
    form.append('schema', JSON.stringify(schema))
    const ds = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    // 3 failing rows, one error per row
    assert.equal(rows.length, 1 + 3, `expected 4 rows total, got ${rows.length}: ${diag.data}`)
    for (const r of rows.slice(1)) {
      assert.match(r, /,validation,/)
    }
    // line numbers in the file should be the file line numbers (1-based, header excluded)
    const lineNumbers = rows.slice(1).map((r: string) => Number(r.split(',')[0])).sort()
    assert.deepEqual(lineNumbers, [2, 3, 4])
  })

  test('exprEval throwing on every row blocks the dataset and writes diagnostic', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1)

    const res = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      // string literal assigned to a number column triggers an exprEval throw on every row
      extensions: [{ active: true, type: 'exprEval', expr: '"value"', property: { key: 'calc1', type: 'number' } }]
    })
    assert.equal(res.status, 200)
    const errored = await waitForDatasetError(testUser1, dataset.id)
    assert.equal(errored.status, 'error')

    const validationEvent = await findEvent(dataset.id, 'validation-error')
    assert.ok(validationEvent)
    assert.equal(validationEvent.hasDiagnosticFile, true)

    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    assert.ok(rows.length >= 2, `expected at least 1 error row, got ${rows.length - 1}`)
    for (const r of rows.slice(1)) {
      assert.match(r, /,extension,/)
    }
  })

  test('mandatory remoteService failing on every row blocks the dataset and writes diagnostic', async () => {
    const dataset = await sendDataset('datasets/dataset-extensions.csv', testUser1)

    // mock geocoder to return an error field for every input row
    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    dataset.schema.find((f: any) => f.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    const res = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })
    assert.equal(res.status, 200)
    const errored = await waitForDatasetError(testUser1, dataset.id)
    assert.equal(errored.status, 'error')

    const validationEvent = await findEvent(dataset.id, 'validation-error')
    assert.ok(validationEvent)
    assert.equal(validationEvent.hasDiagnosticFile, true)

    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    for (const r of rows.slice(1)) {
      assert.match(r, /,extension,/)
    }
  })

  test('non-mandatory remoteService errors do NOT produce a diagnostic file', async () => {
    const dataset = await sendDataset('datasets/dataset-extensions.csv', testUser1)

    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    dataset.schema.find((f: any) => f.key === 'adr')['x-refersTo'] = 'http://schema.org/address'
    const res = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })
    assert.equal(res.status, 200)
    await waitForFinalize(testUser1, dataset.id)

    // diagnostic endpoint should return 404 — non-mandatory remoteService errors stay
    // in the row's error field, no diagnostic file is created
    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 404)
  })

  test('combined validation + exprEval errors land in the same diagnostic CSV', async () => {
    // Schema rejects rows with non-alpha id.
    // exprEval `n == 0 ? "zero" : n` returns a string when n=0, which fails
    // AJV type check for a number property → triggers onLineError.
    // Some rows fail validation only, some fail extension only, some fail both, some pass.
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'n', type: 'number' }
    ]
    const csv = 'id,n\n' + [
      'abc,2',   // line 2: passes both
      '123,4',   // line 3: validation fail (id), extension passes
      'def,0',   // line 4: validation passes, extension fail (n=0 → "zero")
      '456,0',   // line 5: validation fail AND extension fail
      'jkl,5'    // line 6: passes both
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'combined.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      type: 'exprEval',
      expr: 'n == 0 ? "zero" : n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    assert.ok(errEvent, 'expected a single validation-error event')
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.validationErrorCount ?? 0) > 0, 'expected validationErrorCount > 0')
    assert.ok((errEvent.extensionErrorCount ?? 0) > 0, 'expected extensionErrorCount > 0')

    const diag = await fetchDiagnostic(ds.id)
    assert.equal(diag.status, 200)
    const rows = diag.data.replace(/^\uFEFF/, '').trim().split('\n')
    assert.equal(rows[0], 'line,error_type,field,message,raw_value')
    const dataRows = rows.slice(1)
    const validationRows = dataRows.filter((r: string) => r.includes(',validation,'))
    const extensionRows = dataRows.filter((r: string) => r.includes(',extension,'))
    assert.ok(validationRows.length >= 1, `expected validation rows in diagnostic, got: ${diag.data}`)
    assert.ok(extensionRows.length >= 1, `expected extension rows in diagnostic, got: ${diag.data}`)
  })

  test('combined validation + mandatory remoteService errors land in the same diagnostic CSV', async () => {
    // Fixture (tests/resources/datasets/dataset-extensions.csv) has 2 rows:
    //   koumoul,19 rue de la voie lactée saint avé
    //   other,unknown address
    const dataset = await sendDataset('datasets/dataset-extensions.csv', testUser1)

    await setupMockRoute({
      path: '/geocoder/coords',
      ndjsonEcho: { fields: { error: 'mock failure' } }
    })

    // Tighten the label schema so 'other' fails validation (only 'koumoul' matches);
    // the mandatory remoteService returns an error on every row → both rows fail extension.
    const labelField = dataset.schema.find((f: any) => f.key === 'label')
    labelField.pattern = '^k.*$'
    const adrField = dataset.schema.find((f: any) => f.key === 'adr')
    adrField['x-refersTo'] = 'http://schema.org/address'

    const res = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'remoteService',
        remoteService: 'geocoder-koumoul',
        action: 'postCoords'
      }]
    })
    assert.equal(res.status, 200)
    const errored = await waitForDatasetError(testUser1, dataset.id)
    assert.equal(errored.status, 'error')

    const errEvent = await findEvent(dataset.id, 'validation-error')
    assert.ok(errEvent)
    assert.equal(errEvent.hasDiagnosticFile, true)
    assert.ok((errEvent.validationErrorCount ?? 0) > 0)
    assert.ok((errEvent.extensionErrorCount ?? 0) > 0)

    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 200)
    const dataRows = diag.data.replace(/^\uFEFF/, '').trim().split('\n').slice(1)
    const hasValidation = dataRows.some((r: string) => r.includes(',validation,'))
    const hasExtension = dataRows.some((r: string) => r.includes(',extension,'))
    assert.ok(hasValidation, `expected validation rows: ${diag.data}`)
    assert.ok(hasExtension, `expected extension rows: ${diag.data}`)
  })

  test('breakdown counts in the journal event match the diagnostic file content', async () => {
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'n', type: 'number' }
    ]
    const csv = 'id,n\n' + [
      '1,2',     // validation fail
      '2,0',     // validation fail + extension fail
      'a,0',     // extension fail only
      'b,5'      // ok
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'breakdown.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      type: 'exprEval',
      expr: 'n == 0 ? "zero" : n',
      property: { key: 'half', type: 'number' }
    }]))
    const ds = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    await waitForDatasetError(testUser1, ds.id)

    const errEvent = await findEvent(ds.id, 'validation-error')
    const diag = await fetchDiagnostic(ds.id)
    const dataRows = diag.data.replace(/^\uFEFF/, '').trim().split('\n').slice(1)
    const validationCount = dataRows.filter((r: string) => r.includes(',validation,')).length
    const extensionCount = dataRows.filter((r: string) => r.includes(',extension,')).length
    assert.equal(errEvent.validationErrorCount, validationCount,
      `breakdown.validationErrorCount=${errEvent.validationErrorCount} mismatched file=${validationCount}`)
    assert.equal(errEvent.extensionErrorCount, extensionCount,
      `breakdown.extensionErrorCount=${errEvent.extensionErrorCount} mismatched file=${extensionCount}`)
    assert.equal(errEvent.diagnosticErrorCount, validationCount + extensionCount)
  })

  test('compatibleOrCancel auto-cancels the draft when a mandatory extension fails', async () => {
    // Use a simple 2-column CSV (id, n) so the draft upload stays schema-compatible.
    // dataset1.csv has complex typed columns (date, geo, bool) that would trigger
    // schema-breaking-changes when filled with dummy strings, cancelling for the wrong reason.
    const initialCsv = 'id,n\na,5\nb,10\n'
    const form = new FormData()
    form.append('file', Buffer.from(initialCsv), 'simple.csv')
    let dataset = (await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    })).data
    dataset = await waitForFinalize(testUser1, dataset.id)

    // Add a mandatory exprEval that fails when n=0 (returns string → AJV type check fails).
    const patchRes = await testUser1.patch(`/api/v1/datasets/${dataset.id}`, {
      schema: dataset.schema,
      extensions: [{
        active: true,
        mandatory: true,
        type: 'exprEval',
        expr: 'n == 0 ? "zero" : n',
        property: { key: 'inverse', type: 'number' }
      }]
    })
    assert.equal(patchRes.status, 200)
    await waitForFinalize(testUser1, dataset.id)

    // Draft CSV: same schema (no breaking changes), but one row has n=0 → extension fails.
    const draftCsv = 'id,n\nc,7\nd,0\n'
    const form2 = new FormData()
    form2.append('file', Buffer.from(draftCsv), 'simple.csv')
    const draftRes = (await testUser1.post(`/api/v1/datasets/${dataset.id}`, form2, {
      headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() },
      params: { draft: 'compatibleOrCancel' }
    })).data
    assert.equal(draftRes.draftReason.validationMode, 'compatibleOrCancel')

    // Poll for the draft-cancelled event (the worker may take a moment to process).
    let cancelled = false
    for (let i = 0; i < 60; i++) {
      const journal = (await testUser1.get(`/api/v1/datasets/${dataset.id}/journal`)).data
      if (journal.find((e: any) => e.type === 'draft-cancelled')) {
        cancelled = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(cancelled, 'expected draft-cancelled event after a mandatory extension failed under compatibleOrCancel')

    // The draft-cancelled event must carry breakdown counts proving extension failed.
    const journal = (await testUser1.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const cancelEvent = journal.find((e: any) => e.type === 'draft-cancelled')
    assert.ok((cancelEvent.extensionErrorCount ?? 0) > 0,
      `expected extensionErrorCount > 0 on draft-cancelled, got ${JSON.stringify(cancelEvent)}`)

    // diagnostic endpoint should 404 (the draft directory was wiped)
    const diag = await fetchDiagnostic(dataset.id)
    assert.equal(diag.status, 404)
  })
})
