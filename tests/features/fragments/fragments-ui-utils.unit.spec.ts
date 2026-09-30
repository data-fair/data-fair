// json-layout expressions use ${...} in plain strings
/* eslint-disable no-template-curly-in-string */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { pickerPartOf, addPartOfToFromUrls } from '../../../ui/src/utils/fragments.ts'

test.describe('fragments ui utils', () => {
  test('pickerPartOf: own fragments for a parent, siblings for a fragment', () => {
    assert.equal(pickerPartOf('application', { id: 'a' }), 'false,application:a')
    assert.equal(pickerPartOf('dataset', { id: 'v' }), 'false,dataset:v')
    assert.equal(pickerPartOf('application', { id: 'sub', partOf: { type: 'application', id: 'a' } }), 'false,application:a')
  })

  test('addPartOfToFromUrls: only datasets and applications listings, at any depth, x-fromUrl and getItems', () => {
    const schema = {
      properties: {
        datasets: { items: [{ 'x-fromUrl': 'api/v1/datasets?q={q}&{context.datasetFilter}' }] },
        apps: { items: { 'x-fromUrl': '{context.dataFairUrl}/api/v1/applications?q={q}&owner={context.ownerFilter}' } },
        field: { 'x-fromUrl': 'api/v1/datasets/{datasets.0.id}/values/x?q={q}' },
        done: { 'x-fromUrl': 'api/v1/datasets?partOf=true' },
        vjsf3: { layout: { getItems: { url: 'api/v1/datasets?rest=true&${context.datasetFilter}', itemKey: 'data.href' } } },
        vjsf3Field: { layout: { getItems: { url: '${rootData.datasets[0].href}/schema', itemKey: 'data.key' } } }
      }
    }
    addPartOfToFromUrls(schema, 'false,application:a')
    assert.equal(schema.properties.datasets.items[0]['x-fromUrl'], 'api/v1/datasets?q={q}&{context.datasetFilter}&partOf=false,application:a')
    assert.equal(schema.properties.apps.items['x-fromUrl'], '{context.dataFairUrl}/api/v1/applications?q={q}&owner={context.ownerFilter}&partOf=false,application:a')
    assert.equal(schema.properties.field['x-fromUrl'], 'api/v1/datasets/{datasets.0.id}/values/x?q={q}')
    assert.equal(schema.properties.done['x-fromUrl'], 'api/v1/datasets?partOf=true')
    assert.equal(schema.properties.vjsf3.layout.getItems.url, 'api/v1/datasets?rest=true&${context.datasetFilter}&partOf=false,application:a')
    assert.equal(schema.properties.vjsf3Field.layout.getItems.url, '${rootData.datasets[0].href}/schema')
  })
})
