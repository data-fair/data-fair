// Some edge cases with CSV files
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForDatasetError, setServerEnv } from '../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')

test.describe('CSV cases', () => {
  test.beforeAll(async () => {
    await setServerEnv('NO_STORAGE_CHECK', 'true')
  })

  test.afterAll(async () => {
    await setServerEnv('NO_STORAGE_CHECK')
  })

  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Process newly uploaded CSV dataset', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/2018-08-30_Type_qualificatif.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
  })

  test('A CSV with weird keys', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/weird-keys.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'this_key_has_escaped_quotes_in_it')
    assert.equal(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
  })

  test('A CSV with splitting errors', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/dataset-split-fail.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 20)
  })

  test('A CSV with quotes on data line, but not on header line', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/some-quotes.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code_departement, 56)
  })

  test('A CSV with formatting issues', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/formatting-issues.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\r\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 12)
    assert.equal(res.data.results[0].structure_porteuse, 'Struct1')
  })

  test('A CSV with simple quotes in header', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Agribalyse_Synthese.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'code_agb')
    assert.equal(dataset.schema[0]['x-originalName'], 'Code AGB')
    assert.equal(dataset.schema[2].key, 'groupe_daliment')
    assert.equal(dataset.schema[2]['x-originalName'], 'Groupe d\'aliment')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 5)
    assert.equal(res.data.results[0].groupe_daliment, 'fruits, légumes, légumineuses et oléagineux')
  })

  test('A CSV with wrong number of separators in a line', async () => {
    const ax = dmeadus
    const datasetFd = fs.readFileSync('./test-it/resources/csv-cases/dataset-bad-separators.csv')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-bad-separators.csv')
    const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
    const res = await ax.post('/api/v1/datasets', form, { headers })
    const errorDataset = await waitForDatasetError(ax, res.data.id)
    assert.equal(errorDataset.status, 'error')
    const journal = (await ax.get(`/api/v1/datasets/${res.data.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('format est probablement invalide'))
  })

  test('A CSV with lots of empty values', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/jep-2019-HR.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'identifiant')
    assert.equal(dataset.schema[0]['x-originalName'], 'Identifiant')
    assert.equal(dataset.schema[2].key, 'description_fr')
    assert.equal(dataset.schema[2]['x-originalName'], 'Description - FR')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 33)
    assert.equal(res.data.results[0].description_fr, 'Menez l\'enquête à la recherche des objets portés disparus !')
  })

  test('A CSV with \\r\\n inside quotes, but simply \\n as value separator', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Demarches_PCAET_V1_enr.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  test('A CSV with \\r\\n inside quotes, but simply \\n as value separator (2)', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Demarches_PCAET_V1_entete.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'id')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  test('Another CSV with empty values', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/jep-2019.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'identifiant')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 35)
    assert.equal(res.data.results[0].description_fr, 'Elisabeth Berthon, feutrière styliste-modéliste, vous fera découvrir son atelier de créations et son travail sur le feutre et la soie')
  })

  test('A CSV with commas in quotes', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/calendar.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
  })

  test('A CSV with weird mixes of single / double quotes and linebreaks', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Demarches_Libres.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].id, 800)
  })

  test('A CSV with values containing many line breaks', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Fiches_Action.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].id_action, 1)
  })

  test('A CSV with missing trailing values', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Demarches_PCAET_V2_pec_seq.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const objectif3Prop = dataset.schema.find((p: any) => p['x-originalName'] === 'Objectif 3')
    assert.ok(!objectif3Prop)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].seq_1_estimation_sequestration_nette_co2, 149300)
  })

  test('A CSV with single quotes in content', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/single-quotes.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].com, 'L\' Abergement-Clémenciat')
  })

  test('Another CSV with single quotes in content', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/ouverture.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  test('A CSV with empty values in number properties', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/empty-number-values.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { truncate: 4 } })
    assert.equal(res.data.results[0].appellation, 'Agri...')
    assert.equal(res.data.results[0].r2, undefined)
  })

  test('A CSV with numbers in scientific notation', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/numbers.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'floats')
    assert.equal(dataset.schema[0].type, 'number')
    assert.equal(dataset.schema[1].key, 'ints')
    assert.equal(dataset.schema[1].type, 'integer')
  })

  test('A CSV with null utf chars', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/rge-null-chars.csv', ax)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv`)
    assert.equal(res.data.split('\n')[5].split('","')[1].length, 20)
  })

  test('A TSV in .tsv file', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/tab-sep.tsv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
  })

  test('A TSV in .txt file', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/tab-sep.txt', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0].id, 'koumoul')
  })

  test('CSV with BOM', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/Fibre optique_ noeuds de la montée en débit dans le département des Côtes d\'Armor.csv', ax)
    assert.equal(dataset.schema[0].key, 'id_noeud')
    assert.equal(dataset.schema[0]['x-originalName'], 'ID_NOEUD')
    assert.equal(dataset.file.schema[0]['x-originalName'], 'ID_NOEUD')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 732)
    assert.equal(res.data.results[0].id_noeud, '22004N000')
  })

  test('CSV with badly placed BOM', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/salles-sur-yffiniac-6.csv', ax)
    assert.equal(dataset.schema[0].key, 'salle')
    assert.equal(dataset.schema[0]['x-originalName'], 'SALLE')
    assert.equal(dataset.file.schema[0]['x-originalName'], 'SALLE')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 7)
    assert.equal(res.data.results[0].salle, 'Salle du Vauriault')
  })

  test('CSV with empty column', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/empty-col.csv', ax)
    assert.ok(!dataset.schema.find((p: any) => p.key === 'empty'))
  })

  test('A CSV with very long texts containing alternative separators like tabs and ;', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/long-text-tabs.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 7)
  })

  test('A CSV legacy escape key algorithm', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/weird-keys.csv', ax, undefined, { analysis: { escapeKeyAlgorithm: 'legacy' } })
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'This_key_has_escaped_quotes_in_it')
    assert.equal(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
  })

  test('A CSV with ; sep', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/CartoLavage_2023_Koumoul_VF_enrichi-v3.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    assert.equal(dataset.file.props.linesDelimiter, '\r\n')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 56)
  })

  test('A CSV with extra ; sep at end of lines', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('csv-cases/trailing-seps.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    assert.equal(dataset.file.props.linesDelimiter, '\r\n')
    assert.equal(dataset.schema.filter((p: any) => !p['x-calculated']).length, 8)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 7)
  })
})
