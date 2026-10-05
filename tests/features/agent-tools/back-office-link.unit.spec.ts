import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as listDatasets from '../../../agent-tools/list-datasets.ts'
import * as describeDataset from '../../../agent-tools/describe-dataset.ts'

// The `page` field is the public/portal page (right for portal & MCP). The back-office
// integration overrides it with a current-site link via the `datasetLink` option, so links
// stay on the back-office even when it is served on a secondary domain.

const backOfficeLink = (d: any) => `https://secondary.example.com/data-fair/dataset/${d.id}`

test.describe('list_datasets datasetLink option', () => {
  const data = { count: 1, results: [{ id: 'abc123', slug: 'my-dataset', title: 'My Dataset', page: 'https://portal.example.com/datasets/my-dataset' }] }

  test('defaults to the API page field (portal/MCP)', () => {
    const { text, structuredContent } = listDatasets.formatResult(data, 1, 10)
    assert.ok(text.includes('https://portal.example.com/datasets/my-dataset'), 'should default to page')
    assert.equal(structuredContent.results[0].page, 'https://portal.example.com/datasets/my-dataset')
  })

  test('uses the override for both text and structuredContent', () => {
    const { text, structuredContent } = listDatasets.formatResult(data, 1, 10, { datasetLink: backOfficeLink })
    assert.ok(text.includes('https://secondary.example.com/data-fair/dataset/abc123'), `override not used in text:\n${text}`)
    assert.ok(!text.includes('portal.example.com'), 'portal page must not leak into text')
    assert.equal(structuredContent.results[0].page, 'https://secondary.example.com/data-fair/dataset/abc123')
  })
})

test.describe('describe_dataset datasetLink option', () => {
  const fetched = { id: 'abc123', title: 'My Dataset', count: 5, page: 'https://portal.example.com/datasets/my-dataset' }

  test('defaults to the API page field', () => {
    const { text, structuredContent } = describeDataset.formatResult(fetched)
    assert.ok(text.includes('**Link:** https://portal.example.com/datasets/my-dataset'), 'should default to page')
    assert.equal(structuredContent.page, 'https://portal.example.com/datasets/my-dataset')
  })

  test('uses the override for both text and structuredContent', () => {
    const { text, structuredContent } = describeDataset.formatResult(fetched, { datasetLink: backOfficeLink })
    assert.ok(text.includes('**Link:** https://secondary.example.com/data-fair/dataset/abc123'), `override not used:\n${text}`)
    assert.ok(!text.includes('portal.example.com'), 'portal page must not leak into text')
    assert.equal(structuredContent.page, 'https://secondary.example.com/data-fair/dataset/abc123')
  })
})

test.describe('describe_dataset states what inference got wrong', () => {
  test('reports row history and updater tracking of an editable dataset', () => {
    const { text } = describeDataset.formatResult({ id: 'r', title: 'R', isRest: true, rest: { history: true } })
    assert.ok(text.includes('**Row history:** on; **updater tracking**'), text)
    assert.ok(text.includes('_updatedBy): off'), text)
    assert.ok(!describeDataset.formatResult({ id: 'f', title: 'F' }).text.includes('Row history'))
  })

  test('reports provenance', () => {
    const { text } = describeDataset.formatResult({ id: 'd', title: 'D', origin: 'https://insee.fr', creator: 'INSEE' })
    assert.ok(text.includes('**Origin:** https://insee.fr'))
    assert.ok(text.includes('**Producer:** INSEE'))
  })
})

test.describe('list_datasets points editable datasets at their data-entry page', () => {
  const data = { count: 2, results: [{ id: 'reg', title: 'Registre', isRest: true }, { id: 'file', title: 'Fichier' }] }

  test('in the back office', () => {
    const { text } = listDatasets.formatResult(data, 1, 10, { datasetLink: backOfficeLink })
    assert.ok(text.includes('Editable: rows are entered and corrected on https://secondary.example.com/data-fair/dataset/reg/edit-data'), text)
    assert.equal((text.match(/Editable:/g) ?? []).length, 1, 'only the editable dataset')
  })

  test('never for portal or MCP callers, where /edit-data is no route', () => {
    assert.ok(!listDatasets.formatResult(data, 1, 10).text.includes('Editable'))
  })

  test('asks the API for isRest', () => {
    assert.ok(listDatasets.buildQuery({}).query.select.split(',').includes('isRest'))
  })
})
