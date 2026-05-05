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
    // exprEval `10 / n` throws on n === 0.
    // Some rows fail validation only, some fail extension only, some fail both, some pass.
    const schema = [
      { key: 'id', type: 'string', pattern: '^[a-z]+$' },
      { key: 'n', type: 'number' }
    ]
    const csv = 'id,n\n' + [
      'abc,2',   // line 2: passes both
      '123,4',   // line 3: validation fail (id), extension passes
      'def,0',   // line 4: validation passes, extension fail (10/0)
      '456,0',   // line 5: validation fail AND extension fail
      'jkl,5'    // line 6: passes both
    ].join('\n') + '\n'
    const form = new FormData()
    form.append('file', Buffer.from(csv), 'combined.csv')
    form.append('schema', JSON.stringify(schema))
    form.append('extensions', JSON.stringify([{
      active: true,
      type: 'exprEval',
      expr: '10 / n',
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
})
