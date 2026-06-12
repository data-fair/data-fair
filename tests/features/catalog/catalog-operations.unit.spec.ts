import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildDcatCatalog } from '../../../api/src/catalog/operations.ts'

const publicationSite = { type: 'data-fair-portals', id: 'portal1', url: 'https://portal.test' }

test.describe('buildDcatCatalog', () => {
  test('wraps datasets in a DCAT Catalog envelope', () => {
    const result = buildDcatCatalog([], publicationSite, 'https://df.test')
    assert.equal(result['@type'], 'Catalog')
    assert.equal(result.conformsTo, 'https://project-open-data.cio.gov/v1.1/schema')
    assert.deepEqual(result.dataset, [])
  })

  test('builds a Dataset entry using the publication site datasetUrlTemplate when present', () => {
    const result = buildDcatCatalog(
      [{ id: 'd1', slug: 'my-data', title: 'My data', createdAt: '2026-01-01' }],
      { ...publicationSite, datasetUrlTemplate: 'https://portal.test/jeux/{slug}' },
      'https://df.test'
    )
    const ds = result.dataset[0]
    assert.equal(ds['@id'], 'https://portal.test/jeux/my-data')
    assert.equal(ds.identifier, 'my-data')
    assert.equal(ds.title, 'My data')
  })

  test('emits raw and convert distributions when the file mimetype differs from the original', () => {
    const result = buildDcatCatalog(
      [{
        id: 'd1',
        title: 'With file',
        file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
        originalFile: { name: 'data.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 20 }
      }],
      publicationSite,
      'https://df.test'
    )
    const distribution = result.dataset[0].distribution
    assert.equal(distribution.length, 2)
    assert.equal(distribution[0].downloadURL, 'https://df.test/api/v1/datasets/d1/raw')
    assert.equal(distribution[1].downloadURL, 'https://df.test/api/v1/datasets/d1/convert')
  })

  test('emits a single distribution when file and original share the same mimetype', () => {
    const result = buildDcatCatalog(
      [{
        id: 'd1',
        title: 'Same mimetype',
        file: { name: 'data.csv', mimetype: 'text/csv', size: 10 },
        originalFile: { name: 'data.csv', mimetype: 'text/csv', size: 10 }
      }],
      publicationSite,
      'https://df.test'
    )
    assert.equal(result.dataset[0].distribution.length, 1)
  })
})
