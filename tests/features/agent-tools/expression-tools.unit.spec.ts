import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  getAvailableSchema,
  executeGetExpressionContext
} from '../../../ui/src/composables/dataset/agent-expression-tools-logic.ts'

// --- getAvailableSchema ---

test.describe('getAvailableSchema', () => {
  const baseDataset = {
    schema: [
      { key: '_id', type: 'string' },
      { key: '_i', type: 'integer' },
      { key: '_rand', type: 'number' },
      { key: 'name', type: 'string' },
      { key: 'age', type: 'integer' },
      { key: 'calc1', type: 'string' },
      { key: 'calc2', type: 'string' }
    ],
    extensions: [
      { type: 'exprEval', property: { key: 'calc1' }, expr: 'name' },
      { type: 'exprEval', property: { key: 'calc2' }, expr: 'age * 2' }
    ]
  }

  test('filters out internal fields (_id, _i, _rand)', () => {
    const schema = getAvailableSchema(baseDataset, 0)
    const keys = schema.map((col: any) => col.key)
    assert.ok(!keys.includes('_id'))
    assert.ok(!keys.includes('_i'))
    assert.ok(!keys.includes('_rand'))
  })

  test('excludes columns produced by extensions at or after current index', () => {
    // Extension at index 0 produces calc1, extension at index 1 produces calc2
    // For extension at index 0, both calc1 and calc2 should be excluded
    const schema = getAvailableSchema(baseDataset, 0)
    const keys = schema.map((col: any) => col.key)
    assert.ok(!keys.includes('calc1'))
    assert.ok(!keys.includes('calc2'))
    assert.ok(keys.includes('name'))
    assert.ok(keys.includes('age'))
  })

  test('includes columns produced by earlier extensions', () => {
    // For extension at index 1, calc1 (from index 0) should be included
    const schema = getAvailableSchema(baseDataset, 1)
    const keys = schema.map((col: any) => col.key)
    assert.ok(keys.includes('calc1'))
    assert.ok(!keys.includes('calc2'))
    assert.ok(keys.includes('name'))
    assert.ok(keys.includes('age'))
  })

  test('handles empty extensions array', () => {
    const dataset = {
      schema: [{ key: 'name', type: 'string' }],
      extensions: []
    }
    const schema = getAvailableSchema(dataset, 0)
    assert.equal(schema.length, 1)
    assert.equal(schema[0].key, 'name')
  })

  test('handles missing extensions', () => {
    const dataset = {
      schema: [{ key: 'name', type: 'string' }]
    }
    const schema = getAvailableSchema(dataset, 0)
    assert.equal(schema.length, 1)
  })

  test('handles non-exprEval extensions', () => {
    const dataset = {
      schema: [
        { key: 'name', type: 'string' },
        { key: 'geo', type: 'string' }
      ],
      extensions: [
        { type: 'remoteService', property: { key: 'geo' } },
        { type: 'exprEval', property: { key: 'calc' }, expr: '' }
      ]
    }
    // At index 1 (exprEval), the remoteService extension at 0 should not cause filtering
    // because it's not exprEval type. calc is at index 1, so it should be excluded.
    const schema = getAvailableSchema(dataset, 1)
    const keys = schema.map((col: any) => col.key)
    assert.ok(keys.includes('name'))
    assert.ok(keys.includes('geo'))
  })
})

// --- executeGetExpressionContext ---

test.describe('executeGetExpressionContext', () => {
  test('returns error when no dataset', () => {
    const result = executeGetExpressionContext({ extensionIndex: 0 }, null)
    assert.ok(typeof result === 'object' && result.isError)
  })

  test('returns error for invalid extension index', () => {
    const dataset = {
      extensions: [{ type: 'remoteService' }]
    }
    const result = executeGetExpressionContext({ extensionIndex: 0 }, dataset)
    assert.ok(typeof result === 'object' && result.isError)
  })

  test('returns error for out-of-bounds extension index', () => {
    const dataset = {
      extensions: []
    }
    const result = executeGetExpressionContext({ extensionIndex: 5 }, dataset)
    assert.ok(typeof result === 'object' && result.isError)
  })

  test('returns schema table and target info for valid extension', () => {
    const dataset = {
      schema: [
        { key: 'name', type: 'string', title: 'Name' },
        { key: 'age', type: 'integer', title: 'Age' },
        { key: 'full_name', type: 'string' }
      ],
      extensions: [
        { type: 'exprEval', property: { key: 'full_name', type: 'string', 'x-originalName': 'Full Name' }, expr: 'CONCAT(name)' }
      ]
    }
    const result = executeGetExpressionContext({ extensionIndex: 0 }, dataset)
    // Should be a string (not error object)
    assert.equal(typeof result, 'string')
    const text = result as string
    assert.ok(text.includes('`name`'))
    assert.ok(text.includes('`age`'))
    // full_name is produced by extension at index 0, so should be excluded from available columns
    assert.ok(!text.includes('| `full_name`'))
    // Target info
    assert.ok(text.includes('Key: `full_name`'))
    assert.ok(text.includes('Full Name'))
    assert.ok(text.includes('Current expression: `CONCAT(name)`'))
  })

  test('shows "No expression set yet" when no expr', () => {
    const dataset = {
      schema: [{ key: 'name', type: 'string' }, { key: 'calc', type: 'string' }],
      extensions: [
        { type: 'exprEval', property: { key: 'calc', type: 'string' } }
      ]
    }
    const result = executeGetExpressionContext({ extensionIndex: 0 }, dataset) as string
    assert.ok(result.includes('No expression set yet'))
  })

  test('includes column description and concept in notes', () => {
    const dataset = {
      schema: [
        { key: 'city', type: 'string', description: 'The city name', 'x-concept': { title: 'City' } },
        { key: 'calc', type: 'string' }
      ],
      extensions: [
        { type: 'exprEval', property: { key: 'calc', type: 'string' } }
      ]
    }
    const result = executeGetExpressionContext({ extensionIndex: 0 }, dataset) as string
    assert.ok(result.includes('The city name'))
    assert.ok(result.includes('concept: City'))
  })
})
