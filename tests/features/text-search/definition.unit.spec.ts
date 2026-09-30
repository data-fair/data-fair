import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { fieldKey, validateDefinition } from '../../../api/src/misc/utils/text-search/definition.ts'

test('fieldKey sanitises dots to underscores', () => {
  assert.equal(fieldKey('topics.title'), 'topics_title')
})

test('fieldKey leaves a plain path unchanged', () => {
  assert.equal(fieldKey('title'), 'title')
})

test('validateDefinition rejects field paths that collide after sanitisation', () => {
  assert.throws(
    () => validateDefinition({ fields: { 'topics.title': 1, topics_title: 1 }, language: 'fr', version: 1 }),
    /collide after sanitisation/
  )
})
