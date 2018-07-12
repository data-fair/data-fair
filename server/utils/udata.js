const config = require('config')
const axios = require('axios')

exports.publishDataset = async (dataset, publication, catalog) => {
  const udataDataset = {
    title: dataset.title,
    description: dataset.description,
    private: true,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatesetId: dataset.id
    }
  }
  if (catalog.organizationId) {
    udataDataset.organization = {
      id: catalog.organizationId
    }
  }
  try {
    const res = await axios.post(catalog.url + '/api/1/datasets/', udataDataset, {headers: {'X-API-KEY': catalog.apiKey}})
    publication.udata = {dataset: res.data}
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
