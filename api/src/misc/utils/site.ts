import config from '#config'
import memoize from 'memoizee'
import axios from '@data-fair/lib-node/axios.js'

export const getSiteHashes = memoize(async (siteUrl: string) => {
  return axios.get<{ publicInfo: string, themeCss: string }>(config.privateDirectoryUrl + '/api/sites/_hashes', { headers: { 'x-forwarded-host': new URL(siteUrl).host } })
    .then(r => ({ THEME_CSS_HASH: r.data.publicInfo + '/', PUBLIC_SITE_INFO_HASH: r.data.themeCss + '/' }))
}, {
  profileName: 'getSiteHashes',
  promise: true,
  primitive: true,
  maxAge: 1000 * 60, // 1 minute
  preFetch: true
})
