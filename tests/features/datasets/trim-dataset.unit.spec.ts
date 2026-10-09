import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { trimDataset } from '../../../api/src/datasets/operations.ts'

test.describe('trimDataset', () => {
  test('trims descriptive metadata', () => {
    const dataset: any = {
      title: ' Title ',
      summary: ' Summary ',
      description: ' Desc ',
      origin: ' https://example.com ',
      image: ' https://example.com/img.png ',
      creator: ' Koumoul ',
      spatial: ' Vannes ',
      customMetadata: { ref: ' ABC ' },
      conformsTo: { title: ' Std ', version: ' 1.0 ', url: ' https://std ' }
    }
    trimDataset(dataset)
    assert.equal(dataset.title, 'Title')
    assert.equal(dataset.summary, 'Summary')
    assert.equal(dataset.description, 'Desc')
    assert.equal(dataset.origin, 'https://example.com')
    assert.equal(dataset.image, 'https://example.com/img.png')
    assert.equal(dataset.creator, 'Koumoul')
    assert.equal(dataset.spatial, 'Vannes')
    assert.equal(dataset.customMetadata.ref, 'ABC')
    assert.deepEqual(dataset.conformsTo, { title: 'Std', version: '1.0', url: 'https://std' })
  })

  test('keywords: trims, drops empties and duplicates, keeps case and inner spaces', () => {
    const dataset: any = { keywords: [' énergie', 'énergie ', ' ', 'Énergie', 'Aide énergétique '] }
    trimDataset(dataset)
    assert.deepEqual(dataset.keywords, ['énergie', 'Énergie', 'Aide énergétique'])
  })

  test('trims attachments, but not the name of a stored file', () => {
    const dataset: any = {
      attachments: [
        { type: 'file', title: ' Doc ', description: ' d ', name: ' doc.pdf ' },
        { type: 'url', title: ' Link ', url: ' https://link ' },
        { type: 'remoteFile', title: ' Remote ', name: ' r.csv ', targetUrl: ' https://remote ' }
      ]
    }
    trimDataset(dataset)
    assert.deepEqual(dataset.attachments, [
      { type: 'file', title: 'Doc', description: 'd', name: ' doc.pdf ' },
      { type: 'url', title: 'Link', url: 'https://link' },
      { type: 'remoteFile', title: 'Remote', name: 'r.csv', targetUrl: 'https://remote' }
    ])
  })

  test('trims schema property texts, labels and transform expression, not the source header', () => {
    const dataset: any = {
      schema: [{
        key: 'col',
        title: ' Col ',
        description: ' desc ',
        'x-group': ' Group ',
        'x-originalName': ' Col ',
        patternErrorMessage: ' bad ',
        'x-labels': { ' a ': ' A ', b: 'B' },
        'x-transform': { expr: ' UPPER(value) ', examples: [' x '] }
      }]
    }
    trimDataset(dataset)
    const prop = dataset.schema[0]
    assert.equal(prop.title, 'Col')
    assert.equal(prop.description, 'desc')
    assert.equal(prop['x-group'], 'Group')
    assert.equal(prop['x-originalName'], ' Col ')
    assert.equal(prop.patternErrorMessage, 'bad')
    assert.deepEqual(prop['x-labels'], { a: 'A', b: 'B' })
    assert.equal(prop['x-transform'].expr, 'UPPER(value)')
    assert.deepEqual(prop['x-transform'].examples, ['x'])
  })

  test('leaves separator, pattern and date formats untouched', () => {
    const dataset: any = {
      schema: [{ key: 'col', separator: ', ', pattern: '^\\d+ $', dateFormat: 'DD/MM/YYYY ', dateTimeFormat: ' DD/MM/YYYY HH:mm' }]
    }
    trimDataset(dataset)
    assert.deepEqual(dataset.schema[0], { key: 'col', separator: ', ', pattern: '^\\d+ $', dateFormat: 'DD/MM/YYYY ', dateTimeFormat: ' DD/MM/YYYY HH:mm' })
  })

  test('trims extensions', () => {
    const dataset: any = {
      extensions: [
        { type: 'exprEval', expr: ' CONCAT(a, b) ', property: { key: 'c', type: 'string' } },
        { type: 'remoteService', remoteService: 'rs', action: 'act', propertyPrefix: ' pre ', overwrite: { out: { title: ' Out ', 'x-originalName': ' out ' } } }
      ]
    }
    trimDataset(dataset)
    assert.equal(dataset.extensions[0].expr, 'CONCAT(a, b)')
    assert.equal(dataset.extensions[1].propertyPrefix, 'pre')
    assert.deepEqual(dataset.extensions[1].overwrite.out, { title: 'Out', 'x-originalName': ' out ' })
  })

  test('trims virtual filter values and drops empties', () => {
    const dataset: any = { virtual: { children: [], filters: [{ key: 'k', values: [' a ', '', ' '] }] } }
    trimDataset(dataset)
    assert.deepEqual(dataset.virtual.filters[0].values, ['a'])
  })

  test('trims master data searchs and their filter values', () => {
    const dataset: any = {
      masterData: {
        bulkSearchs: [{ title: ' Bulk ', description: ' d ', filters: [{ property: { key: 'k' }, values: [' v ', ''] }] }],
        singleSearchs: [{ title: ' Single ', description: ' d ' }]
      }
    }
    trimDataset(dataset)
    assert.equal(dataset.masterData.bulkSearchs[0].title, 'Bulk')
    assert.equal(dataset.masterData.bulkSearchs[0].description, 'd')
    assert.deepEqual(dataset.masterData.bulkSearchs[0].filters[0].values, ['v'])
    assert.equal(dataset.masterData.singleSearchs[0].title, 'Single')
    assert.equal(dataset.masterData.singleSearchs[0].description, 'd')
  })

  test('ignores absent fields and non-string values', () => {
    const dataset: any = { title: 'ok', keywords: undefined, schema: [{ key: 'k', title: null }] }
    trimDataset(dataset)
    assert.deepEqual(dataset, { title: 'ok', keywords: undefined, schema: [{ key: 'k', title: null }] })
  })
})
