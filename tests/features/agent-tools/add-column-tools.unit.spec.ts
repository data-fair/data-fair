/**
 * `add_columns` exists because the assistant proposes a set of columns in its
 * very first reply — before the wizard has even told it how it works — and then
 * had no way to create a single one of them. Judged runs ended on a hand-written
 * six-column procedure the person had not asked for, and the wizard guidance had
 * to say "your part ends at Create".
 *
 * The tool stages exactly what the add-column dialog stages, so a column the
 * agent adds and a column the person adds are the same object, and the person
 * still presses Enregistrer.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { propertyTypes } from '../../../ui/src/utils/dataset.ts'
import {
  AGENT_COLUMN_TYPES,
  addColumnsPrecondition,
  resolveColumnType,
  addColumns,
  formatAddOutcomes
} from '../../../ui/src/composables/dataset/agent-add-column-tools-logic.ts'

test.describe('resolveColumnType', () => {
  test('every type offered to the model resolves to a real property type', () => {
    for (const name of AGENT_COLUMN_TYPES) {
      const resolved = resolveColumnType(name)
      assert.ok(resolved, `${name} resolves to nothing`)
      assert.ok(
        propertyTypes.some(p =>
          p.type === resolved!.type &&
          (p.format ?? null) === (resolved!.format ?? null) &&
          (p['x-display'] ?? null) === (resolved!['x-display'] ?? null)),
        `${name} is not one of the form's own types`
      )
    }
  })

  test('every type the form offers can be asked for by name', () => {
    // Without this, a type added to the dialog is silently unreachable by the
    // agent and the person is told to go and add that column by hand.
    for (const p of propertyTypes) {
      const match = AGENT_COLUMN_TYPES.map(resolveColumnType).find(r =>
        r!.type === p.type &&
        (r!.format ?? null) === (p.format ?? null) &&
        (r!['x-display'] ?? null) === (p['x-display'] ?? null))
      assert.ok(match, `no agent name for ${p.type}/${p.format ?? '-'}/${p['x-display'] ?? '-'}`)
    }
  })

  test('an unknown name resolves to nothing rather than to a default', () => {
    assert.equal(resolveColumnType('timestamp'), undefined)
  })
})

test.describe('addColumnsPrecondition', () => {
  test('lets a REST dataset through', () => {
    assert.equal(addColumnsPrecondition({ isRest: true }), undefined)
  })

  test('refuses a file dataset, and says where its columns come from', () => {
    const why = addColumnsPrecondition({ isRest: false })!
    assert.ok(why, 'must refuse')
    assert.match(why, /file/i)
    assert.ok(!/added|staged/.test(why), why)
  })

  test('refuses when no dataset is loaded', () => {
    assert.ok(addColumnsPrecondition(undefined))
  })
})

test.describe('addColumns', () => {
  test('stages the same object the add-column dialog stages', () => {
    const schema: any[] = []
    const outcomes = addColumns(schema, [{ name: 'Nom du demandeur', type: 'text' }])
    assert.deepEqual(outcomes, [{ name: 'Nom du demandeur', key: 'nom_du_demandeur' }])
    assert.deepEqual(schema, [{
      key: 'nom_du_demandeur',
      'x-originalName': 'Nom du demandeur',
      type: 'string',
      title: ''
    }])
  })

  test('carries format and x-display for the types that have them', () => {
    const schema: any[] = []
    addColumns(schema, [
      { name: 'Date de dépôt', type: 'date' },
      { name: 'Motivation', type: 'long-text' }
    ])
    assert.equal(schema[0].format, 'date')
    assert.equal(schema[1]['x-display'], 'textarea')
    assert.ok(!('format' in schema[1]), 'a type with no format must not carry format: undefined')
  })

  test('appends, leaving the columns already there alone', () => {
    const schema: any[] = [{ key: '_updatedAt', type: 'string', 'x-calculated': true }]
    addColumns(schema, [{ name: 'Montant', type: 'number' }])
    assert.equal(schema.length, 2)
    assert.equal(schema[0].key, '_updatedAt')
    assert.equal(schema[1].key, 'montant')
  })

  test('refuses a key the dataset already has, naming the column that holds it', () => {
    const schema: any[] = [{ key: 'montant', title: 'Montant demandé', type: 'number' }]
    const outcomes = addColumns(schema, [{ name: 'Montant', type: 'number' }])
    assert.equal(schema.length, 1, 'nothing may be appended')
    assert.match(outcomes[0].rejected!, /Montant demandé/)
  })

  test('refuses a key twice in the same call', () => {
    const schema: any[] = []
    const outcomes = addColumns(schema, [
      { name: 'Montant', type: 'number' },
      { name: 'montant', type: 'text' }
    ])
    assert.equal(schema.length, 1)
    assert.ok(outcomes[1].rejected)
  })

  test('refuses an unknown type, and says which ones exist', () => {
    const schema: any[] = []
    const outcomes = addColumns(schema, [{ name: 'Créé le', type: 'timestamp' }])
    assert.equal(schema.length, 0)
    assert.match(outcomes[0].rejected!, /date-time/)
  })

  test('refuses a name that slugifies to nothing', () => {
    const schema: any[] = []
    const outcomes = addColumns(schema, [{ name: '  ', type: 'text' }, { name: '???', type: 'text' }])
    assert.equal(schema.length, 0)
    assert.ok(outcomes[0].rejected)
    assert.ok(outcomes[1].rejected)
  })

  test('one bad column does not lose the rest of the batch', () => {
    const schema: any[] = []
    const outcomes = addColumns(schema, [
      { name: 'Nom', type: 'text' },
      { name: 'Créé le', type: 'timestamp' },
      { name: 'Montant', type: 'number' }
    ])
    assert.deepEqual(schema.map(c => c.key), ['nom', 'montant'])
    assert.equal(outcomes.filter(o => o.rejected).length, 1)
  })
})

test.describe('formatAddOutcomes', () => {
  test('says the columns are staged, not saved', () => {
    const text = formatAddOutcomes([{ name: 'Nom', key: 'nom' }])
    assert.match(text, /Enregistrer/)
    assert.ok(!/saved|enregistré/i.test(text.replace('Enregistrer', '')), text)
  })

  test('reports rejections with their reason', () => {
    const text = formatAddOutcomes([{ name: 'Créé le', rejected: 'unknown type "timestamp"' }])
    assert.match(text, /Créé le/)
    assert.match(text, /timestamp/)
  })

  test('says something when asked for nothing', () => {
    assert.ok(formatAddOutcomes([]).length > 0)
  })
})
