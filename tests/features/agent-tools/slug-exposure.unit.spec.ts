import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as listDatasets from '../../../agent-tools/list-datasets.ts'
import * as getDatasetSchema from '../../../agent-tools/get-dataset-schema.ts'
import { prompt as datasetDataSubagentPrompt } from '../../../agent-tools/dataset-data-subagent.ts'

// The agent tools expose `slug` alongside `id` so a portal/MCP consumer can
// build slug-based links while the back-office keeps using `id`.

test.describe('list_datasets exposes slug', () => {
  test('buildQuery selects slug', () => {
    const { query } = listDatasets.buildQuery({})
    assert.ok(query.select.split(',').includes('slug'), `slug missing from select: ${query.select}`)
  })

  test('formatResult includes slug in structuredContent results', () => {
    const data = {
      count: 1,
      results: [{ id: 'abc123', slug: 'my-dataset', title: 'My Dataset', page: 'https://portal/datasets/my-dataset' }]
    }
    const { text, structuredContent } = listDatasets.formatResult(data, 1, 10)
    assert.equal(structuredContent.results[0].slug, 'my-dataset')
    assert.equal(structuredContent.results[0].id, 'abc123')
    assert.ok(text.includes('slug: `my-dataset`'), 'slug not surfaced in text output')
  })

  test('formatResult omits slug when absent', () => {
    const data = { count: 1, results: [{ id: 'abc123', title: 'My Dataset', page: 'p' }] }
    const { structuredContent } = listDatasets.formatResult(data, 1, 10)
    assert.equal('slug' in structuredContent.results[0], false)
  })
})

test.describe('get_dataset_schema exposes slug', () => {
  test('buildQuery selects slug', () => {
    const { schemaReq } = getDatasetSchema.buildQuery({ datasetId: 'abc123' })
    assert.ok(schemaReq.query.select.split(',').includes('slug'), `slug missing from select: ${schemaReq.query.select}`)
  })

  test('formatResult surfaces the slug', () => {
    const result = getDatasetSchema.formatResult(
      { title: 'My Dataset', slug: 'my-dataset', schema: [{ key: 'name', type: 'string' }] },
      { results: [] }
    )
    assert.ok(result.includes('my-dataset'), 'slug not surfaced in schema output')
  })

  test('formatResult omits slug line when absent', () => {
    const result = getDatasetSchema.formatResult(
      { title: 'My Dataset', schema: [{ key: 'name', type: 'string' }] },
      { results: [] }
    )
    assert.ok(!result.includes('**Slug:**'), 'slug line should be absent when slug missing')
  })
})

test.describe('dataset_data subagent', () => {
  test('prompt instructs to report datasetSlug', () => {
    assert.ok(datasetDataSubagentPrompt.includes('datasetSlug'), 'subagent prompt missing datasetSlug')
  })

  // Judged portal simulations: told the columns, the sub-agent skips get_dataset_schema, never
  // sees the slug or title, and reported the dataset id as both — a link built from it misses
  // the slug route. It also wrote links on a '[datasetUrl]' placeholder it was never given.
  test('prompt reports slug and title only when a tool result showed them', () => {
    assert.ok(datasetDataSubagentPrompt.includes('never put the dataset id in their place'), 'subagent prompt lets the id stand in for slug/title')
  })

  test('prompt writes links only from a URL it was given', () => {
    assert.ok(datasetDataSubagentPrompt.includes('only when your task gives the dataset page URL'), 'subagent prompt asks for links without a URL')
  })
})
