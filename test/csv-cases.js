// Some edge cases with CSV files
const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('CSV cases', () => {
  before(() => {
    process.env.NO_STORAGE_CHECK = 'true'
  })
  after(() => {
    delete process.env.NO_STORAGE_CHECK
  })
  it('Process newly uploaded CSV dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('2018-08-30_Type_qualificatif.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
  })

  it('A CSV with weird keys', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('weird-keys.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'This_key_has_escaped_quotes_in_it')
    assert.equal(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
  })

  it('A CSV with splitting errors', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('dataset-split-fail.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 20)
  })

  it('A CSV with quotes on data line, but not on header line', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('some-quotes.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].Code_departement, 56)
  })

  it('A CSV with formatting issues', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('formatting-issues.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 12)
    assert.equal(res.data.results[0].Structure_porteuse, 'Struct1')
  })

  it('A CSV with simple quotes in header', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('Agribalyse_Synthese.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Code_AGB')
    assert.equal(dataset.schema[0]['x-originalName'], 'Code AGB')
    assert.equal(dataset.schema[2].key, 'Groupe_d\'aliment')
    assert.equal(dataset.schema[2]['x-originalName'], 'Groupe d\'aliment')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 5)
    assert.equal(res.data.results[0]['Groupe_d\'aliment'], 'fruits, légumes, légumineuses et oléagineux')
  })

  it('A CSV with wrong number of separators in a line', async () => {
    const ax = global.ax.dmeadus
    try {
      await testUtils.sendDataset('dataset-bad-separators.csv', ax)
    } catch (err) {
      assert.ok(err.message.includes('format est probablement invalide'))
    }
  })

  it('A CSV with lots of empty values', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('jep-2019-HR.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Identifiant')
    assert.equal(dataset.schema[0]['x-originalName'], 'Identifiant')
    assert.equal(dataset.schema[2].key, 'Description_-_FR')
    assert.equal(dataset.schema[2]['x-originalName'], 'Description - FR')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 33)
    assert.equal(res.data.results[0]['Description_-_FR'], 'Menez l\'enquête à la recherche des objets portés disparus !')
  })

  it('A CSV with \\r\\n inside quotes, but simply \\n as value separator', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('Demarches_PCAET_V1_enr.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Id')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  it('Another CSV with empty values', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('jep-2019.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Identifiant')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 35)
    assert.equal(res.data.results[0]['Description_-_FR'], 'Elisabeth Berthon, feutrière styliste-modéliste, vous fera découvrir son atelier de créations et son travail sur le feutre et la soie')
  })

  it('A CSV with commas in quotes', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('calendar.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
  })
})
