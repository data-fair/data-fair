const url = require('url')
const axios = require('axios')

exports.title = 'uData'
exports.description = 'Customizable and skinnable social platform dedicated to (open)data.'
exports.docUrl = 'https://udata.readthedocs.io/en/latest/'

exports.init = async (catalogUrl) => {
  const siteInfo = (await axios.get(url.resolve(catalogUrl, 'api/1/site/'))).data
  return {url: catalogUrl, title: siteInfo.title}
}

exports.findOrganizations = async (catalogUrl, q) => {
  const res = await axios.get(url.resolve(catalogUrl, 'api/1/organizations/'), {params: {q}})
  return {
    results: res.data.data.map(o => ({id: o.id, name: o.name}))
  }
}
