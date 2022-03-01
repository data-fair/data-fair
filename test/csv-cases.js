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
    const dataset = await testUtils.sendDataset('csv-cases/2018-08-30_Type_qualificatif.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
  })

  it('A CSV with weird keys', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/weird-keys.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'This_key_has_escaped_quotes_in_it')
    assert.equal(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
  })

  it('A CSV with splitting errors', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/dataset-split-fail.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 20)
  })

  it('A CSV with quotes on data line, but not on header line', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/some-quotes.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].Code_departement, 56)
  })

  it('A CSV with formatting issues', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/formatting-issues.csv', ax)
    assert.equal(dataset.status, 'finalized')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 12)
    assert.equal(res.data.results[0].Structure_porteuse, 'Struct1')
  })

  it('A CSV with simple quotes in header', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/Agribalyse_Synthese.csv', ax)
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
    await assert.rejects(testUtils.sendDataset('csv-cases/dataset-bad-separators.csv', ax), (err) => {
      if (!err.message.includes('format est probablement invalide')) {
        console.error('wrong error message in csv-case', err)
        assert.fail(`error message should contain "format est probablement invalide", instead got "${err.message}"`)
      }
      return true
    })
  })

  it('A CSV with lots of empty values', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/jep-2019-HR.csv', ax)
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
    const dataset = await testUtils.sendDataset('csv-cases/Demarches_PCAET_V1_enr.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Id')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  it('A CSV with \\r\\n inside quotes, but simply \\n as value separator', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/Demarches_PCAET_V1_entete.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.schema[0].key, 'Id')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
  })

  it('Another CSV with empty values', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/jep-2019.csv', ax)
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
    const dataset = await testUtils.sendDataset('csv-cases/calendar.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ',')
  })

  it('A CSV with weird mixes of single / double quotes and linebreaks', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/Demarches_Libres.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].id, 800)
  })

  it('A CSV with values containing many line breaks', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/Fiches_Action.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].Id_action, 1)
  })

  it('A CSV with missing trailing values', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/Demarches_PCAET_V2_pec_seq.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const objectif3Prop = dataset.schema.find(p => p['x-originalName'] === 'Objectif 3')
    assert.equal(objectif3Prop.type, 'string')
    assert.equal(objectif3Prop['x-cardinality'], 0)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].SEQ_1_Estimation_Sequestration_nette_CO2, 149300)
  })

  it('A CSV with single quotes in content', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/single-quotes.csv', ax)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.file.props.linesDelimiter, '\n')
    assert.equal(dataset.file.props.escapeChar, '"')
    assert.equal(dataset.file.props.quote, '"')
    assert.equal(dataset.file.props.fieldsDelimiter, ';')
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.results[0].COM, 'L\' Abergement-Clémenciat')
  })

  it('A CSV with empty values in number properties', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/empty-number-values.csv', ax)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { truncate: 4 } })
    assert.equal(res.data.results[0].appellation, 'Agri...')
    assert.equal(res.data.results[0].r2, undefined)
  })

  it('A CSV with null utf chars', async () => {
    // better to remove these chars as they can be considered as some end of string by somer parsers
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('csv-cases/rge-null-chars.csv', ax)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?format=csv`)
    assert.equal(res.data.split('\n')[5].split('","')[1].length, 20)
  })
})
