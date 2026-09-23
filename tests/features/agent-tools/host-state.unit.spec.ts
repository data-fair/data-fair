import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildLocationState, buildDatasetWizardState, buildApplicationWizardState, buildDatasetStructureState, buildLineDialogState } from '../../../ui/src/composables/agent/host-state.ts'

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

/**
 * The half of the flow after Create used to publish nothing. A judged run had the
 * assistant stage six columns with add_columns and then assert « Le bouton
 * Enregistrer est déjà prêt à être cliqué » with no way to know it — correct by
 * luck — declare no wait because it had no event to wait on, and ask the person
 * to report the save back. This is the wizard's own `ready` contract, on the
 * schema form: `unsaved` says the staged change is really there, `ready` says the
 * button can be pressed now.
 */
test.describe('buildDatasetStructureState', () => {
  test('a form matching the server can neither be saved nor is it dirty', () => {
    assert.deepEqual(
      buildDatasetStructureState({ columns: 6, unsaved: false, valid: true }),
      { columns: 6, unsaved: false, ready: false }
    )
  })

  test('a staged change on a valid form is ready to save', () => {
    assert.deepEqual(
      buildDatasetStructureState({ columns: 6, unsaved: true, valid: true }),
      { columns: 6, unsaved: true, ready: true }
    )
  })

  test('a staged change on an invalid form is dirty but not ready', () => {
    // Saying "click Enregistrer" here is the failure this state exists to stop.
    assert.deepEqual(
      buildDatasetStructureState({ columns: 6, unsaved: true, valid: false }),
      { columns: 6, unsaved: true, ready: false }
    )
  })

  test('an empty schema is reported as zero, not omitted', () => {
    // A freshly created REST dataset has no columns, and that is exactly the fact
    // the assistant needs on arrival; omitting it would read as "not reported".
    assert.deepEqual(
      buildDatasetStructureState({ columns: 0, unsaved: false, valid: true }),
      { columns: 0, unsaved: false, ready: false }
    )
  })
})

/**
 * The line-editing dialogs published nothing. A judged run had the assistant fill
 * the add-line form, end its turn with « Une fois que c'est fait, dites-le moi »,
 * and spend the person's whole second message on a save the application already
 * knew about. `wait_for_user_action` was offered on every request and was never
 * usable, because nothing would have resolved it.
 *
 * Same pair as the schema form: what is true now, and the transition that ends
 * the wait.
 */
test.describe('buildLineDialogState', () => {
  test('says "none" when no dialog is open, rather than going quiet', () => {
    // An e2e caught this: useAgentState does not emit for an empty value and only
    // withdraws a key on unmount, so publishing nothing here left the chat holding
    // the last open dialog — an assistant would believe a form was still waiting
    // to be saved for the rest of the session.
    assert.deepEqual(buildLineDialogState({ mode: null, valid: false }), { mode: 'none', ready: false })
  })

  test('says which dialog is open and whether Save can be pressed', () => {
    assert.deepEqual(buildLineDialogState({ mode: 'add', valid: true }), { mode: 'add', ready: true })
    assert.deepEqual(buildLineDialogState({ mode: 'edit', valid: true }), { mode: 'edit', ready: true })
  })

  test('reports a half-filled form as not ready', () => {
    // Telling someone to press a button the form will refuse is the failure this
    // exists to stop — the same reason `ready` is not the button's own disabled prop.
    assert.deepEqual(buildLineDialogState({ mode: 'add', valid: false }), { mode: 'add', ready: false })
  })
})
