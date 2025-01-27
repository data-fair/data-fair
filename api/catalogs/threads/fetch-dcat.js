// this is run in a thread as it is quite cpu and memory intensive

import axios from '../../misc/utils/axios.js'
import normalize from '../../misc/utils/dcat/normalize.js'

export default async (catalogUrl) => {
  const raw = (await axios.get(catalogUrl)).data
  const url = new URL(catalogUrl)
  return normalize(raw, url.origin + url.pathname)
}
