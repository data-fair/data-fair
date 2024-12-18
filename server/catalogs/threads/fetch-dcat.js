// this is run in a thread as it is quite cpu and memory intensive

const axios = require('../../misc/utils/axios')
const normalize = require('../../misc/utils/dcat/normalize')

export default async (catalogUrl) => {
  const raw = (await axios.get(catalogUrl)).data
  const url = new URL(catalogUrl)
  return normalize(raw, url.origin + url.pathname)
}
