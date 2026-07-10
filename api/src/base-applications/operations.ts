import { marked } from 'marked'
import { prepareThumbnailUrl } from '../misc/utils/thumbnails.ts'

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

// Base apps are registry npm artefacts with one mutable artefact per minor line.
// Artefact id convention: '<packageName>@<major>.<minor>'.
export const parseArtefactId = (artefactId: string): { packageName: string, minor: string } => {
  const i = artefactId.lastIndexOf('@')
  const packageName = i > 0 ? artefactId.slice(0, i) : ''
  const minor = i > 0 ? artefactId.slice(i + 1) : ''
  if (!packageName || !/^\d+\.\d+$/.test(minor)) throw new Error(`invalid base-app artefact id "${artefactId}"`)
  return { packageName, minor }
}

// Parse the splat segments of an /app-assets request:
// [...packageNameParts, <minor>, (<exactVersion>)?, ...filePath]
// The version segment makes the response immutable-cacheable; without it the file
// is served from the current extract with a short TTL.
export const parseAssetsPath = (segments: string[]): { artefactId: string, version?: string, filePath: string } | null => {
  const minorIndex = segments.findIndex(s => /^\d+\.\d+$/.test(s))
  if (minorIndex <= 0) return null
  const packageName = segments.slice(0, minorIndex).join('/')
  let rest = segments.slice(minorIndex + 1)
  let version: string | undefined
  if (rest.length && /^\d+\.\d+\.\d+/.test(rest[0])) {
    version = rest[0]
    rest = rest.slice(1)
  }
  return { artefactId: `${packageName}@${segments[minorIndex]}`, version, filePath: rest.join('/') }
}
