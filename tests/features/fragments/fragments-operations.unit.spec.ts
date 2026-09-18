import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import type { Permission } from '../../../api/types/index.ts'
import {
  deriveFragmentPermissions, validatePartOf, partOfListFilter,
  fragmentForbiddenPatchKey, fragmentWriteBodyError, PART_OF_CHANGE_OPERATION,
  partOfCollectionName, resourceTypeToPartOfType
} from '../../../api/src/fragments/operations.ts'

const orgOwner = { type: 'organization', id: 'test_org1', name: 'Test Org 1' }
const contribWrite: Permission = { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: '-', roles: ['contrib'], classes: ['write'], operations: ['delete'] }
const contribRead: Permission = { ...contribWrite, classes: ['list', 'read', 'readAdvanced'], operations: [] }
const publicRead: Permission = { classes: ['read', 'list'] }
const userWriteOnly: Permission = { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['write'] }
const userReadOnly: Permission = { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['read'] }
const userAdmin: Permission = { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['admin'] }
const userByEmailWriteDesc: Permission = { type: 'user', email: 'test_user3@test.com', operations: ['writeDescription'] }

test.describe('deriveFragmentPermissions', () => {
  test('dataset fragment of a virtual dataset: management inherited and implies read, read alone dropped', () => {
    const derived = deriveFragmentPermissions([contribWrite, contribRead, publicRead, userWriteOnly, userReadOnly, userAdmin, userByEmailWriteDesc], 'datasets', 'datasets')
    assert.deepEqual(derived, [
      { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: '-', roles: ['contrib'], classes: ['list', 'read', 'readAdvanced', 'write'], operations: ['delete'] },
      { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read', 'readAdvanced', 'write'] },
      { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read', 'readAdvanced', 'admin'] },
      { type: 'user', email: 'test_user3@test.com', classes: ['list', 'read', 'readAdvanced'], operations: ['writeDescription'] }
    ])
  })

  test('dataset fragment of an application: same as above, cross-type classes', () => {
    const appContribWrite: Permission = { type: 'organization', id: 'test_org1', department: '-', roles: ['contrib'], classes: ['write'], operations: ['delete'] }
    const derived = deriveFragmentPermissions([appContribWrite, publicRead, userAdmin], 'applications', 'datasets')
    assert.deepEqual(derived, [
      { type: 'organization', id: 'test_org1', department: '-', roles: ['contrib'], classes: ['list', 'read', 'readAdvanced', 'write'], operations: ['delete'] },
      { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read', 'readAdvanced', 'admin'] }
    ])
  })

  test('application fragment of an application: read is inherited too', () => {
    const derived = deriveFragmentPermissions([publicRead, userReadOnly, { type: 'user', id: 'u', operations: ['readConfig'] }], 'applications', 'applications')
    assert.deepEqual(derived, [
      { classes: ['list', 'read'] },
      { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['read'] },
      { type: 'user', id: 'u', operations: ['readConfig'] }
    ])
  })

  // a fragment must never surface through a parent's read-only ACL entry (docs §9). getPermissions,
  // readIntegrity and readIntegrityRevisions are pure reads that happen to sit in the `admin` class:
  // carrying them over used to trigger the "write implies read" grant and leak the whole fragment.
  test('a read-only admin entry on the parent derives nothing', () => {
    const readOnlyAdmin: Permission = { type: 'user', id: 'test_user3', name: 'Test User3', operations: ['getPermissions'] }
    assert.deepEqual(deriveFragmentPermissions([readOnlyAdmin], 'datasets', 'datasets'), [])
    assert.deepEqual(deriveFragmentPermissions([{ ...readOnlyAdmin, operations: ['readIntegrity', 'readIntegrityRevisions'] }], 'datasets', 'datasets'), [])
    // applications: getPermissions is read-only there too
    assert.deepEqual(deriveFragmentPermissions([readOnlyAdmin], 'applications', 'datasets'), [])
  })

  test('a mixed entry derives only its write side, plus read', () => {
    const mixed: Permission = { type: 'user', id: 'test_user3', name: 'Test User3', operations: ['getPermissions', 'writeDescription'] }
    assert.deepEqual(deriveFragmentPermissions([mixed], 'datasets', 'datasets'), [
      { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read', 'readAdvanced'], operations: ['writeDescription'] }
    ])
  })

  test('is idempotent', () => {
    const once = deriveFragmentPermissions([contribWrite, contribRead, userAdmin], 'datasets', 'datasets')
    assert.deepEqual(deriveFragmentPermissions(once, 'datasets', 'datasets'), once)
  })

  test('handles undefined and empty input', () => {
    assert.deepEqual(deriveFragmentPermissions(undefined, 'datasets', 'datasets'), [])
    assert.deepEqual(deriveFragmentPermissions([], 'applications', 'applications'), [])
  })
})

test.describe('validatePartOf', () => {
  const virtualParent = { id: 'v', owner: orgOwner, isVirtual: true }
  const appParent = { id: 'a', owner: orgOwner }
  const base = { fragmentType: 'datasets' as const, fragment: { owner: orgOwner }, nbFragments: 0 }

  test('accepts a dataset under a virtual dataset and under an application', () => {
    assert.equal(validatePartOf({ ...base, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent }), null)
    assert.equal(validatePartOf({ ...base, partOf: { type: 'application', id: 'a' }, parent: appParent }), null)
  })
  test('accepts an application under an application only', () => {
    assert.equal(validatePartOf({ ...base, fragmentType: 'applications', partOf: { type: 'application', id: 'a' }, parent: appParent }), null)
    assert.match(validatePartOf({ ...base, fragmentType: 'applications', partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /application/)
  })
  test('refuses a non virtual dataset parent', () => {
    assert.match(validatePartOf({ ...base, partOf: { type: 'dataset', id: 'f' }, parent: { id: 'f', owner: orgOwner } })!, /virtuel/)
  })
  test('refuses self, a fragment parent, a different owner, a resource that has fragments, a published resource', () => {
    assert.match(validatePartOf({ ...base, fragment: { id: 'v', owner: orgOwner }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /elle-même/)
    assert.match(validatePartOf({ ...base, partOf: { type: 'dataset', id: 'v' }, parent: { ...virtualParent, partOf: { type: 'application', id: 'a' } } })!, /lui-même un fragment/)
    assert.match(validatePartOf({ ...base, fragment: { owner: { type: 'organization', id: 'test_org1', department: 'dep1' } }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /propriétaire/)
    assert.match(validatePartOf({ ...base, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent, nbFragments: 2 })!, /fragments/)
    assert.match(validatePartOf({ ...base, fragment: { owner: orgOwner, publicationSites: ['data-fair-portals:p'] }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /portail/)
    assert.match(validatePartOf({ ...base, fragment: { owner: orgOwner, publications: [{ catalog: 'c' }] }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /catalogue/)
    assert.match(validatePartOf({ ...base, fragment: { owner: orgOwner, masterData: { singleSearchs: [{ id: 's' }] } }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent })!, /référence/)
    // an empty master-data sub-object is not reference data
    assert.equal(validatePartOf({ ...base, fragment: { owner: orgOwner, masterData: {} }, partOf: { type: 'dataset', id: 'v' }, parent: virtualParent }), null)
  })
})

test.describe('helpers', () => {
  test('partOfListFilter: targeting a parent', () => {
    assert.deepEqual(partOfListFilter({ partOf: 'dataset:abc' }), { 'partOf.type': 'dataset', 'partOf.id': 'abc' })
    // an id may itself contain a colon, only the first one separates the type
    assert.deepEqual(partOfListFilter({ partOf: 'application:a:b' }), { 'partOf.type': 'application', 'partOf.id': 'a:b' })
    assert.throws(() => partOfListFilter({ partOf: 'foo:abc' }), { status: 400 })
    assert.throws(() => partOfListFilter({ partOf: 'dataset' }), { status: 400 })
  })
  test('partOfListFilter: every fragment, whatever its parent', () => {
    assert.deepEqual(partOfListFilter({ partOf: 'true' }), { 'partOf.id': { $exists: true } })
  })
  test('partOfListFilter: fragments hidden by default', () => {
    assert.deepEqual(partOfListFilter({}), { partOf: { $exists: false } })
    assert.deepEqual(partOfListFilter({ q: 'x', owner: 'user:u' }), { partOf: { $exists: false } })
    // an explicit false is the default, not a request to reveal them
    assert.deepEqual(partOfListFilter({ partOf: 'false' }), { partOf: { $exists: false } })
  })
  test('partOfListFilter: pinning queries are never filtered', () => {
    for (const key of ['id', 'ids', 'slug', 'slugs', 'children', 'dataset', 'application']) {
      assert.equal(partOfListFilter({ [key]: 'x' }), undefined, key)
    }
  })
  test('fragmentForbiddenPatchKey', () => {
    assert.equal(fragmentForbiddenPatchKey({ title: 't' }, true), null)
    assert.equal(fragmentForbiddenPatchKey({ publicationSites: [] }, false), null)
    assert.equal(fragmentForbiddenPatchKey({ publicationSites: [] }, true), 'publicationSites')
    assert.equal(fragmentForbiddenPatchKey({ requestedPublicationSites: [] }, true), 'requestedPublicationSites')
    assert.equal(fragmentForbiddenPatchKey({ publications: [] }, true), 'publications')
  })
  test('fragmentWriteBodyError', () => {
    const parent = { type: 'dataset' as const, id: 'v' }
    const fragment = { partOf: parent }
    // partOf may not be changed on a route that persists its body raw
    assert.match(fragmentWriteBodyError({ partOf: parent }, undefined, { allowPartOfChange: false })!, /PATCH/)
    assert.match(fragmentWriteBodyError({ partOf: null }, fragment, { allowPartOfChange: false })!, /PATCH/)
    assert.match(fragmentWriteBodyError({ partOf: { type: 'dataset', id: 'other' } }, fragment, { allowPartOfChange: false })!, /PATCH/)
    // an identical value is a no-op, a read-then-write round trip must still work
    assert.equal(fragmentWriteBodyError({ partOf: parent, title: 't' }, fragment, { allowPartOfChange: false }), null)
    assert.equal(fragmentWriteBodyError({ partOf: null }, {}, { allowPartOfChange: false }), null)
    // the PATCH routes route partOf through applyPartOfChange instead
    assert.equal(fragmentWriteBodyError({ partOf: parent }, undefined, { allowPartOfChange: true }), null)
    // a fragment is never publishable, on any route
    assert.match(fragmentWriteBodyError({ publicationSites: [] }, fragment, { allowPartOfChange: true })!, /publié/)
    assert.match(fragmentWriteBodyError({ publications: [] }, fragment, { allowPartOfChange: false })!, /publié/)
    // attaching and publishing in one body is refused too
    assert.match(fragmentWriteBodyError({ partOf: parent, requestedPublicationSites: [] }, undefined, { allowPartOfChange: true })!, /publié/)
    // a standalone resource may be published
    assert.equal(fragmentWriteBodyError({ publicationSites: [] }, {}, { allowPartOfChange: false }), null)
    assert.equal(fragmentWriteBodyError(undefined, fragment, { allowPartOfChange: false }), null)
    // a fragment is never reference data either, and attaching + declaring it in one body is refused
    assert.match(fragmentWriteBodyError({ masterData: { bulkSearchs: [{ id: 'b' }] } }, fragment, { allowPartOfChange: true })!, /référence/)
    assert.match(fragmentWriteBodyError({ partOf: parent, masterData: { virtualDatasets: { active: true } } }, undefined, { allowPartOfChange: true })!, /référence/)
    // presence of the key is not the signal: clearing it, or an empty sub-object, must keep working
    assert.equal(fragmentWriteBodyError({ masterData: {} }, fragment, { allowPartOfChange: true }), null)
    assert.equal(fragmentWriteBodyError({ masterData: null }, fragment, { allowPartOfChange: true }), null)
    assert.equal(fragmentWriteBodyError({ masterData: { bulkSearchs: [{ id: 'b' }] } }, {}, { allowPartOfChange: true }), null)
  })
  test('constants', () => {
    assert.deepEqual(PART_OF_CHANGE_OPERATION, { datasets: 'changeOwner', applications: 'delete' })
    assert.equal(partOfCollectionName('dataset'), 'datasets')
    assert.equal(partOfCollectionName('application'), 'applications')
    assert.equal(resourceTypeToPartOfType('datasets'), 'dataset')
    assert.equal(resourceTypeToPartOfType('applications'), 'application')
  })
})
