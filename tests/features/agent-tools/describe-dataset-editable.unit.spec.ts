/**
 * A judged run asked the assistant to record a subsidy request in an editable
 * dataset and correct a typo in another. It did neither. It called
 * describe_dataset, learned nothing about the dataset being editable, concluded
 * « je n'ai pas d'outil pour créer ou modifier directement des lignes », guessed
 * its way to /table — where the line tools are not registered, because they live
 * behind `edit` and only edit-data.vue passes it — and finished by telling the
 * person to contact support.
 *
 * The model reasoned correctly from what it was told. What it was told never
 * mentioned that the dataset accepts line entry, or that a page exists for it.
 *
 * The hint is back-office only: it names a route that exists in the back-office
 * UI, and the same formatter serves the portal and the MCP server, where that
 * route means nothing. `datasetLink` is exactly the back-office signal — it is
 * the option the back-office integration passes to override the portal `page`.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatResult } from '../../../agent-tools/describe-dataset.ts'

const backOffice = (d: any) => `https://example.org/data-fair/dataset/${d.id}`
const rest = { id: 'demandes', title: 'Demandes de subvention', isRest: true, status: 'finalized', count: 2 }
const file = { id: 'equipements', title: 'Équipements sportifs', status: 'finalized', count: 40 }

test.describe('describe_dataset says an editable dataset can be written to', () => {
  test('names the data-entry page for a REST dataset in the back-office', () => {
    const { text } = formatResult(rest, { datasetLink: backOffice })
    assert.match(text, /editable/i)
    assert.ok(text.includes('https://example.org/data-fair/dataset/demandes/edit-data'), text)
  })

  test('says what can be done there, so the tools are worth looking for', () => {
    // Naming a URL is not enough: the failure was the assistant concluding the
    // capability does not exist at all, so the line has to say it does.
    const { text } = formatResult(rest, { datasetLink: backOffice })
    assert.match(text, /add|edit/i)
  })

  test('says nothing of the sort for a file dataset', () => {
    const { text } = formatResult(file, { datasetLink: backOffice })
    assert.ok(!/edit-data/.test(text), text)
    assert.ok(!/editable/i.test(text), text)
  })

  test('stays out of the portal and MCP output, which have no such page', () => {
    // No datasetLink means the caller is not the back-office; pointing it at a
    // back-office route would be an invitation to a 404.
    const { text } = formatResult({ ...rest, page: 'https://portal.example.org/datasets/demandes' })
    assert.ok(!/edit-data/.test(text), text)
  })

  test('reports editability in the structured content either way', () => {
    // Structured output is the typed contract and has no links in it, so the
    // fact is safe to state for every consumer. Absent, not false, for a file
    // dataset — presence is the signal.
    assert.equal(formatResult(rest, { datasetLink: backOffice }).structuredContent.editable, true)
    assert.ok(!('editable' in formatResult(file, { datasetLink: backOffice }).structuredContent))
  })

  test('leaves everything else about the description alone', () => {
    const { text } = formatResult(rest, { datasetLink: backOffice })
    assert.match(text, /# Demandes de subvention/)
    assert.match(text, /\*\*ID:\*\* `demandes`/)
    assert.match(text, /\*\*Rows:\*\* 2/)
  })
})
