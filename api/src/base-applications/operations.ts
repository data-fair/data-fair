import { marked } from 'marked'
import { prepareThumbnailUrl } from '../misc/utils/thumbnails.js'

export const clean = (publicUrl: string, baseApp: any, thumbnail?: string, html = false) => {
  baseApp.title = baseApp.title || baseApp.meta.title
  baseApp.applicationName = baseApp.applicationName || baseApp.meta['application-name']
  baseApp.version = baseApp.version || baseApp.meta.version || baseApp.url.split('/').slice(-2, -1).pop()
  baseApp.description = baseApp.description || baseApp.meta.description || ''
  if (html) baseApp.description = marked.parse(baseApp.description)
  baseApp.image = baseApp.image || baseApp.url + 'thumbnail.png'
  baseApp.thumbnail = prepareThumbnailUrl(publicUrl + '/api/v1/base-applications/' + encodeURIComponent(baseApp.id) + '/thumbnail', thumbnail)
  return baseApp
}

export const prepareQuery = (query: URLSearchParams) => {
  return [...query.entries()]
    .filter(entry => !['skip', 'size', 'q', 'status', '{context.datasetFilter}', 'owner'].includes(entry[0]) && !entry[0].startsWith('${'))
    .reduce((a, entry) => { a[entry[0]] = entry[1].split(','); return a }, ({} as Record<string, string[]>))
}

export const getFragmentFetchUrl = (fragment: any): string | null => {
  if (!fragment) return null
  if (fragment['x-fromUrl']) return fragment['x-fromUrl']
  if (fragment.layout?.getItems?.url) {
    if (typeof fragment.layout.getItems.url === 'string') return fragment.layout.getItems.url
    return fragment.layout.getItems.url.expr
  }
  return null
}
