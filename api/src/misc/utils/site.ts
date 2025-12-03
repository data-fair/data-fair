import config from '#config'
import memoize from 'memoizee'
import axios from '@data-fair/lib-node/axios.js'

export const getSiteHashes = memoize(async (siteUrl: string) => {
  const url = new URL(siteUrl)
  return axios.get<{ publicInfo: string, themeCss: string }>(config.privateDirectoryUrl + '/simple-directory/api/sites/_hashes', {
    headers: {
      'x-forwarded-proto': url.protocol.slice(0, -1),
      'x-forwarded-host': url.hostname,
      'x-forwarded-port': url.port
    }
  })
    .then(r => ({ THEME_CSS_HASH: r.data.publicInfo + '/', PUBLIC_SITE_INFO_HASH: r.data.themeCss + '/' }))
}, {
  profileName: 'getSiteHashes',
  promise: true,
  primitive: true,
  maxAge: 1000 * 60, // 1 minute
  preFetch: true
})
