/**
 * Feedback: describing a dataset to its owner, the assistant listed `_geopoint` among its
 * columns. The schema table mixed the producer's columns with the ones the platform computes;
 * they are now listed apart, and flagged in the structured content.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatResult } from '../../../agent-tools/describe-dataset.ts'
import * as getDatasetSchema from '../../../agent-tools/get-dataset-schema.ts'
import { isPlatformColumn } from '../../../agent-tools/_utils.ts'

const schema = [
  { key: 'commune', type: 'string', title: 'Commune' },
  { key: 'latitude', type: 'number', title: 'Latitude' },
  { key: '_ban.lat', type: 'number', title: 'Latitude BAN', 'x-extension': 'ban' },
  { key: '_geopoint', type: 'string', title: 'Coordonnée géographique', 'x-calculated': true },
  { key: '_updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', 'x-calculated': true },
  { key: '_id', type: 'string', 'x-calculated': true },
  { key: '_i', type: 'integer', 'x-calculated': true }
]

const dataSection = (text: string) => text.split('### Platform columns')[0]
const platformSection = (text: string) => text.split('### Platform columns')[1] ?? ''

test.describe('platform columns are listed apart from the data', () => {
  test('isPlatformColumn keeps extension outputs with the data', () => {
    assert.deepEqual(schema.filter(isPlatformColumn).map(c => c.key), ['_geopoint', '_updatedAt', '_id', '_i'])
  })

  test('describe_dataset puts them in their own table', () => {
    const { text, structuredContent } = formatResult({ id: 'd', title: 'D', schema })
    assert.match(dataSection(text), /`commune`/)
    assert.match(dataSection(text), /`_ban\.lat`/)
    assert.doesNotMatch(dataSection(text), /`_geopoint`|`_updatedAt`/)
    assert.match(platformSection(text), /not part of the data/)
    assert.match(platformSection(text), /`_geopoint`/)
    assert.match(platformSection(text), /`_updatedAt`/)
    assert.doesNotMatch(text, /`_id`|`_i`/)
    assert.equal(structuredContent.schema.find((c: any) => c.key === '_geopoint').platform, true)
    assert.equal(structuredContent.schema.find((c: any) => c.key === 'commune').platform, undefined)
  })

  test('no platform section when there is none', () => {
    const { text } = formatResult({ id: 'd', title: 'D', schema: schema.slice(0, 2) })
    assert.doesNotMatch(text, /Platform columns/)
  })

  test('get_dataset_schema splits them the same way', () => {
    const text = getDatasetSchema.formatResult({ title: 'D', schema }, { results: [] })
    assert.doesNotMatch(dataSection(text), /`_geopoint`/)
    assert.match(platformSection(text), /`_geopoint`/)
  })
})
