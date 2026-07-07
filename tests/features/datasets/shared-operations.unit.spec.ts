import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { permissionClassesPicker, isDatasetOperationApplicable, type DatasetContext } from '../../../shared/permissions/operations.ts'

const ctx = (over: Partial<DatasetContext>): DatasetContext => ({
  isRest: false,
  isVirtual: false,
  isMetaOnly: false,
  isFile: false,
  hasHistory: false,
  hasLineOwnership: false,
  hasExtensions: false,
  hasMasterData: false,
  hasReadApiKey: false,
  ...over
})

const idsOf = (picker: Record<string, { id: string }[]>) => Object.values(picker).flat().map((o) => o.id)

test.describe('shared permission operations / picker', () => {
  test('REST dataset exposes line + admin + own-line operations, never deprecated ones', () => {
    const picker = permissionClassesPicker('datasets', 'fr', ctx({ isRest: true, hasHistory: true, hasLineOwnership: true, hasExtensions: true, hasMasterData: true, hasReadApiKey: true }))
    const all = idsOf(picker)

    // admin operations appear with their true class, including those that have no documented route
    assert.deepEqual(picker.admin.map((o) => o.id).sort(), ['changeOwner', 'delete', 'getPermissions', 'setPermissions', 'setReadApiKey', 'writeExports', 'writePublicationSites', 'writePublications', 'readIntegrity', 'readIntegrityRevisions'].sort())
    // REST-only write operations
    assert.ok(all.includes('createLine') && all.includes('bulkLines'))
    assert.ok(all.includes('simulateExtension')) // extensions present
    assert.ok(all.includes('bulkSearch')) // master-data present
    assert.ok(all.includes('getReadApiKey')) // read api key active
    assert.ok(picker.manageOwnLines?.some((o) => o.id === 'createOwnLine')) // line ownership
    // deprecated operations are never grantable through the picker
    assert.ok(!all.includes('getMinAgg') && !all.includes('getMaxAgg'))
    // file-only operations must not show for a REST dataset
    assert.ok(!all.includes('validateDraft') && !all.includes('downloadOriginalData'))
  })

  test('file dataset exposes file/draft operations, not REST line operations', () => {
    const picker = permissionClassesPicker('datasets', 'fr', ctx({ isFile: true }))
    const all = idsOf(picker)
    assert.ok(all.includes('writeData') && all.includes('validateDraft') && all.includes('listDataFiles') && all.includes('downloadOriginalData'))
    assert.ok(!all.includes('createLine') && !all.includes('updateLine'))
    assert.ok(!('manageOwnLines' in picker)) // no line ownership
    assert.ok(!all.includes('bulkSearch')) // no master-data
  })

  test('meta-only dataset hides data-bearing read operations', () => {
    const all = idsOf(permissionClassesPicker('datasets', 'fr', ctx({ isMetaOnly: true })))
    assert.ok(!all.includes('readLines') && !all.includes('readSchema') && !all.includes('getValuesAgg'))
    assert.ok(all.includes('readDescription')) // metadata still readable
  })

  test('superadmin / owner-admin / contrib operations are never in the picker', () => {
    const all = idsOf(permissionClassesPicker('datasets', 'fr', ctx({ isRest: true, hasMasterData: true })))
    assert.ok(!('superadmin' in permissionClassesPicker('datasets', 'fr')))
    assert.ok(!all.includes('manageMasterData')) // ownerAdmin grouping
    assert.ok(!all.includes('post')) // contrib grouping
  })

  test('doc gating helper matches the contract dataset-type pruning', () => {
    // onlyFile operations: present for a file dataset, pruned for rest/virtual/meta-only
    for (const op of ['downloadOriginalData', 'downloadConvertedData', 'downloadFullData', 'listDataFiles', 'downloadDataFile']) {
      assert.equal(isDatasetOperationApplicable(op, ctx({ isFile: true })), true, `${op} for file`)
      assert.equal(isDatasetOperationApplicable(op, ctx({ isRest: true })), false, `${op} for rest`)
      assert.equal(isDatasetOperationApplicable(op, ctx({ isVirtual: true })), false, `${op} for virtual`)
      assert.equal(isDatasetOperationApplicable(op, ctx({ isMetaOnly: true })), false, `${op} for meta-only`)
    }
    // notMetaOnly operations: pruned only for meta-only datasets
    for (const op of ['readLines', 'readSchema', 'readSafeSchema', 'getWordsAgg', 'getMetricAgg', 'getValues', 'getValuesLabels', 'getValuesAgg']) {
      assert.equal(isDatasetOperationApplicable(op, ctx({ isMetaOnly: true })), false, `${op} for meta-only`)
      assert.equal(isDatasetOperationApplicable(op, ctx({ isRest: true })), true, `${op} for rest`)
      assert.equal(isDatasetOperationApplicable(op, ctx({ isFile: true })), true, `${op} for file`)
    }
    // operations without a shape predicate are always applicable
    assert.equal(isDatasetOperationApplicable('readDescription', ctx({ isMetaOnly: true })), true)
    assert.equal(isDatasetOperationApplicable('readApiDoc', ctx({ isVirtual: true })), true)
  })

  test('localized titles and applications picker', () => {
    const fr = permissionClassesPicker('datasets', 'fr')
    const en = permissionClassesPicker('datasets', 'en')
    assert.equal(fr.admin.find((o) => o.id === 'delete')?.title, 'Supprimer le jeu de données')
    assert.equal(en.admin.find((o) => o.id === 'delete')?.title, 'Delete the dataset')

    const apps = permissionClassesPicker('applications', 'fr')
    assert.ok(apps.admin.some((o) => o.id === 'getKeys') && apps.admin.some((o) => o.id === 'setKeys'))
    assert.ok(!('manageOwnLines' in apps))
  })
})
