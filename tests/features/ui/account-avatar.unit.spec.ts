import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { accountAvatarUrl } from '../../../ui/src/utils/account-avatar.ts'

// A column of the account concept, or `_owner`, can hold any string (an edited or virtual column): only a
// `type:id[:department]` value has an avatar. Anything else used to become a request simple-directory
// answers 404 without an image (`avatars/1/avatar.png` for a value "1"), a broken image in the table.

const sdUrl = 'http://localhost/simple-directory'

test('builds the avatar URL of a user, an organization or a department', () => {
  assert.equal(accountAvatarUrl(sdUrl, 'user:u1'), `${sdUrl}/api/avatars/user/u1/avatar.png`)
  assert.equal(accountAvatarUrl(sdUrl, 'organization:o1'), `${sdUrl}/api/avatars/organization/o1/avatar.png`)
  assert.equal(accountAvatarUrl(sdUrl, 'organization:o1:dep1'), `${sdUrl}/api/avatars/organization/o1/dep1/avatar.png`)
})

test('builds no URL for a value that is not an account reference', () => {
  for (const value of ['1', '', 'user:', 'group:g1', 'user:a:b:c', 'user:a b', ' user:u1', undefined, null, 12]) {
    assert.equal(accountAvatarUrl(sdUrl, value), undefined, `value ${JSON.stringify(value)}`)
  }
})
