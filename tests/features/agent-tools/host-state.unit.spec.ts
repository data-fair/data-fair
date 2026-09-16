import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildLocationState, buildDatasetWizardState, buildApplicationWizardState } from '../../../ui/src/composables/agent/host-state.ts'

// These payloads are re-sent in full in the <host-state> snapshot at every
// activation, so every field that is empty is a token the model re-reads for
// nothing. The omission rules below are the point of the builders, not a detail.

test.describe('buildLocationState', () => {
  test('keeps url and path, drops everything empty', () => {
    assert.deepEqual(
      buildLocationState({ url: 'https://koumoul.com/data-fair/datasets', path: '/datasets' }),
      { url: 'https://koumoul.com/data-fair/datasets', path: '/datasets' }
    )
  })

  test('keeps the route name, params, query and the breadcrumb trail', () => {
    assert.deepEqual(
      buildLocationState({
        url: 'https://koumoul.com/data-fair/dataset/abc/table?ville_eq=Brest',
        path: '/dataset/abc/table',
        name: 'dataset-table',
        params: { id: 'abc' },
        query: { ville_eq: 'Brest' },
        breadcrumbs: [{ text: 'Jeux de données' }, { text: 'Équipements sportifs' }]
      }),
      {
        url: 'https://koumoul.com/data-fair/dataset/abc/table?ville_eq=Brest',
        path: '/dataset/abc/table',
        name: 'dataset-table',
        params: { id: 'abc' },
        query: { ville_eq: 'Brest' },
        breadcrumbs: ['Jeux de données', 'Équipements sportifs']
      }
    )
  })

  test('drops empty params, empty query and an empty trail rather than sending {}', () => {
    const state = buildLocationState({
      url: 'https://koumoul.com/data-fair/datasets',
      path: '/datasets',
      name: 'datasets',
      params: {},
      query: {},
      breadcrumbs: []
    })
    assert.deepEqual(Object.keys(state).sort(), ['name', 'path', 'url'])
  })

  test('drops breadcrumb entries with no text', () => {
    const state = buildLocationState({
      url: 'https://koumoul.com/data-fair/datasets',
      path: '/datasets',
      breadcrumbs: [{ text: 'Jeux de données' }, { text: '' }]
    })
    assert.deepEqual(state.breadcrumbs, ['Jeux de données'])
  })
})

test.describe('buildDatasetWizardState', () => {
  test('reports no type as "none" rather than omitting it', () => {
    // An absent field reads as "unknown"; the person genuinely has not chosen yet.
    assert.deepEqual(
      buildDatasetWizardState({ step: 'type', ready: false }),
      { step: 'type', type: 'none', ready: false }
    )
  })

  test('rest carries its own options and nothing else', () => {
    assert.deepEqual(
      buildDatasetWizardState({
        step: 'params',
        type: 'rest',
        title: 'Demandes de subvention',
        ready: true,
        history: true,
        attachments: false,
        fileName: 'ignored.csv',
        childrenCount: 3
      }),
      { step: 'params', type: 'rest', title: 'Demandes de subvention', ready: true, history: true, attachments: false }
    )
  })

  test('file reports whether a file has been chosen, which the agent cannot do itself', () => {
    assert.deepEqual(
      buildDatasetWizardState({ step: 'params', type: 'file', title: 'Équipements', ready: true, fileName: 'equipements.csv' }),
      { step: 'params', type: 'file', title: 'Équipements', ready: true, file: 'equipements.csv' }
    )
    assert.deepEqual(
      buildDatasetWizardState({ step: 'params', type: 'file', ready: false }),
      { step: 'params', type: 'file', ready: false, file: 'none' }
    )
  })

  test('virtual carries its child count', () => {
    assert.deepEqual(
      buildDatasetWizardState({ step: 'params', type: 'virtual', title: 'Vue', ready: true, childrenCount: 2 }),
      { step: 'params', type: 'virtual', title: 'Vue', ready: true, children: 2 }
    )
  })

  test('metaOnly carries nothing beyond the common fields', () => {
    assert.deepEqual(
      buildDatasetWizardState({ step: 'action', type: 'metaOnly', title: 'Fiche', ready: true, history: true, fileName: 'x.csv' }),
      { step: 'action', type: 'metaOnly', title: 'Fiche', ready: true }
    )
  })

  test('an empty title is omitted', () => {
    const state = buildDatasetWizardState({ step: 'params', type: 'rest', title: '   ', ready: false })
    assert.equal('title' in state, false)
  })
})

test.describe('buildApplicationWizardState', () => {
  test('reports no creation type as "none"', () => {
    assert.deepEqual(
      buildApplicationWizardState({ step: 'type', ready: false }),
      { step: 'type', creationType: 'none', ready: false }
    )
  })

  test('carries the selected model and the title once chosen', () => {
    assert.deepEqual(
      buildApplicationWizardState({ step: 'info', creationType: 'baseApp', selected: 'Carte de points', title: 'Équipements - Carte', ready: true }),
      { step: 'info', creationType: 'baseApp', selected: 'Carte de points', title: 'Équipements - Carte', ready: true }
    )
  })

  test('omits an unselected model and an empty title', () => {
    assert.deepEqual(
      buildApplicationWizardState({ step: 'selection', creationType: 'copy', selected: null, title: '', ready: false }),
      { step: 'selection', creationType: 'copy', ready: false }
    )
  })
})
