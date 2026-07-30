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
