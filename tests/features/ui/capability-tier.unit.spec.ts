import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { capabilityTier, grantedClasses } from '../../../ui/src/utils/capabilities.ts'

test('derives the highest tier from operation ids', () => {
  assert.equal(capabilityTier('datasets', ['readDescription', 'list']), 'read')
  assert.equal(capabilityTier('datasets', ['setPermissions', 'readDescription', 'list']), 'admin')
  assert.equal(capabilityTier('datasets', ['writeDescription', 'readDescription']), 'write')
  assert.equal(capabilityTier('datasets', ['list']), 'list')
  assert.equal(capabilityTier('applications', ['readDescription']), 'read')
})

test('returns null when nothing is granted', () => {
  assert.equal(capabilityTier('datasets', []), null)
  assert.equal(capabilityTier('datasets', undefined), null)
})

test('grantedClasses maps operations to their distinct classes', () => {
  const classes = grantedClasses('datasets', ['readDescription', 'readSchema', 'list'])
  assert.deepEqual(classes.sort(), ['list', 'read'])
})
