import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  formatApplicationConfig,
  getConfigValue,
  projectConfigSchema
} from '../../../ui/src/composables/application/agent-tools-logic.ts'

test.describe('formatApplicationConfig', () => {
  test('returns a not-configured message for empty config', () => {
    assert.equal(formatApplicationConfig(null), 'This application is not configured yet.')
    assert.equal(formatApplicationConfig(undefined), 'This application is not configured yet.')
    assert.equal(formatApplicationConfig({}), 'This application is not configured yet.')
  })

  test('prints a non-empty config inside a json code fence, without indentation', () => {
    const out = formatApplicationConfig({ datasets: [{ id: 'd1' }], title: 'X' })
    assert.ok(out.startsWith('```json\n'))
    assert.ok(out.endsWith('\n```'))
    assert.ok(out.includes('"datasets"'))
    // compact serialization: no pretty-print indentation
    assert.ok(!out.includes('\n  "'))
  })

  test('truncates a large config and lists top-level keys', () => {
    const big = { title: 'T', sections: Array.from({ length: 50 }, (_, i) => ({ name: 'x'.repeat(50), i })) }
    const out = formatApplicationConfig(big, 500)
    assert.ok(out.includes('… truncated ('))
    assert.ok(out.includes('Top-level keys: title, sections'))
    assert.ok(out.includes('"path"'))
  })
})

test.describe('getConfigValue', () => {
  test('reads nested values through objects and arrays', () => {
    const config = { sections: [{ elements: [{ title: 'A' }] }] }
    assert.equal(getConfigValue(config, 'sections/0/elements/0/title'), 'A')
    assert.equal(getConfigValue(config, 'sections/1'), undefined)
    assert.deepEqual(getConfigValue(config, ''), config)
  })

  test('returns undefined when a path crosses a scalar', () => {
    assert.equal(getConfigValue({ title: 'X' }, 'title/nope'), undefined)
  })
})

test.describe('projectConfigSchema', () => {
  const schema = {
    type: 'object',
    allOf: [
      {
        title: 'Filtres',
        properties: {
          filters: {
            type: 'array',
            title: 'Filtres dynamiques',
            items: { $ref: '#/definitions/filter' }
          }
        }
      },
      {
        properties: {
          sections: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', title: 'Titre de la section' },
                elements: { type: 'array', items: { type: 'object', properties: { width: { type: 'number' } } } }
              }
            }
          }
        }
      }
    ],
    definitions: {
      filter: {
        type: 'object',
        required: ['field'],
        properties: {
          field: { type: 'string', title: 'Colonne' },
          type: { type: 'string', enum: ['equals', 'interval', 'starts'] }
        }
      }
    }
  }

  test('lists merged allOf properties with paths, types and enums', () => {
    const out = projectConfigSchema(schema)
    assert.ok(out.includes('`filters` (array)'))
    assert.ok(out.includes('`sections` (array)'))
    assert.ok(out.includes('"equals", "interval", "starts"'))
    assert.ok(out.includes('required'))
  })

  test('drills into a sub-schema with a data path', () => {
    const out = projectConfigSchema(schema, 'sections/<i>')
    assert.ok(out.includes('`sections/<i>/title`'))
    assert.ok(out.includes('required'))
    assert.ok(out.includes('elements'))
    assert.ok(!out.includes('`filters`'))
  })

  test('resolves local $refs through array items', () => {
    const out = projectConfigSchema(schema, 'filters/0')
    assert.ok(out.includes('field'))
    assert.ok(out.includes('Colonne'))
  })

  test('reports an unknown path instead of throwing', () => {
    const out = projectConfigSchema(schema, 'nope/nope')
    assert.ok(out.includes('No schema found at path'))
  })

  test('truncates oversized projections', () => {
    const big: any = { type: 'object', properties: {} }
    for (let i = 0; i < 300; i++) big.properties['prop_' + i] = { type: 'string', title: 'Property number ' + i }
    const out = projectConfigSchema(big, undefined, 1000)
    assert.ok(out.length < 1200)
    assert.ok(out.includes('… truncated'))
  })
})
