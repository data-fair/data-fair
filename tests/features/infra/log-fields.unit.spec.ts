import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ownerLogFields, resourceLogFields } from '../../../api/src/misc/utils/log-fields.ts'

test('ownerLogFields describes an organization department', () => {
  assert.deepEqual(ownerLogFields({ type: 'organization', id: 'o1', name: 'Org 1', department: 'dep1' }), { ownerKey: 'organization.o1', ownerDep: 'dep1', ownerName: 'Org 1' })
})
test('ownerLogFields omits missing values', () => {
  assert.deepEqual(ownerLogFields({ type: 'user', id: 'u1' }), { ownerKey: 'user.u1' })
})
test('resourceLogFields adds the resource to the owner fields', () => {
  assert.deepEqual(resourceLogFields('datasets', { id: 'd1', owner: { type: 'user', id: 'u1', name: 'U' } }), { resourceType: 'datasets', resourceId: 'd1', ownerKey: 'user.u1', ownerName: 'U' })
})
