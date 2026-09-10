import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { resolveLocalRefs } from '../../../api/src/misc/utils/json-refs.ts'

test.describe('json-refs util', () => {
  test('resolveLocalRefs: inlines local refs, including nested and escaped pointers', () => {
    const schema = {
      definitions: {
        dataset: { type: 'object', properties: { href: { type: 'string' } } },
        'a/b': { type: 'number' }
      },
      properties: {
        datasets: { type: 'array', items: { $ref: '#/definitions/dataset' } },
        weird: { $ref: '#/definitions/a~1b' }
      }
    }
    const resolved = resolveLocalRefs(schema)
    assert.deepEqual(resolved.properties.datasets.items, schema.definitions.dataset)
    assert.deepEqual(resolved.properties.weird, { type: 'number' })
    // the input is not mutated and the inlined copy is detached from the definition
    assert.deepEqual(schema.properties.datasets.items, { $ref: '#/definitions/dataset' })
    assert.notEqual(resolved.properties.datasets.items, schema.definitions.dataset)
  })

  test('resolveLocalRefs: leaves remote, unresolvable and circular refs as they are', () => {
    const schema = {
      definitions: { node: { type: 'object', properties: { child: { $ref: '#/definitions/node' } } } },
      properties: {
        remote: { $ref: 'https://example.com/schema.json' },
        missing: { $ref: '#/definitions/nope' },
        tree: { $ref: '#/definitions/node' }
      }
    }
    const resolved = resolveLocalRefs(schema)
    assert.deepEqual(resolved.properties.remote, { $ref: 'https://example.com/schema.json' })
    assert.deepEqual(resolved.properties.missing, { $ref: '#/definitions/nope' })
    assert.equal(resolved.properties.tree.type, 'object')
    assert.deepEqual(resolved.properties.tree.properties.child, { $ref: '#/definitions/node' })
  })
})
