// Fetching and caching of the platform document's fragments: every service's document is fetched
// over its private URL at startup and every 5 minutes (conditional GETs), prepared once, and merged
// per site on demand. A failing fetch keeps the last good fragment (stale).
// Design: docs/superpowers/specs/2026-10-19-platform-api-docs-design.md
import config from '#config'
import { internalError } from '@data-fair/lib-node/observer.js'
import apiDocs from '../../contract/api-docs.ts'
import pJson from '../../contract/p-json.js'
import { oauth2Scheme } from '../../contract/scopes-security.ts'
import { prepareFragment, mergePlatformDoc, type FragmentState, type PlatformService, type PreparedFragment } from '../../contract/platform-api-docs.ts'

const refreshInterval = 300_000
const initialWait = 5_000
const fetchTimeout = 10_000

/** the services of the platform document, url undefined for data-fair itself (in-process) */
export function platformServices (cfg: { publicUrl: string, directoryUrl: string, privateDirectoryUrl?: string | null, privateMetricsUrl?: string | null, privateEventsUrl?: string | null }): { service: PlatformService, url?: string }[] {
  const datafairMount = new URL(cfg.publicUrl).pathname.replace(/\/$/, '') + '/api/v1'
  const services: { service: PlatformService, url?: string }[] = [
    { service: { id: 'datafair', title: 'Data Fair', mountPath: datafairMount, docPath: datafairMount + '/api-docs.json' } },
    {
      service: { id: 'sd', title: 'Simple Directory', mountPath: '/simple-directory', docPath: '/simple-directory/api/api-docs.json' },
      url: (cfg.privateDirectoryUrl || cfg.directoryUrl) + '/api/api-docs.json'
    }
  ]
  if (cfg.privateMetricsUrl) {
    services.push({
      service: { id: 'metrics', title: 'Metrics', mountPath: '/metrics/api', docPath: '/metrics/api/api-docs.json' },
      url: cfg.privateMetricsUrl + '/api/api-docs.json'
    })
  }
  if (cfg.privateEventsUrl) {
    services.push({
      service: { id: 'events', title: 'Events', mountPath: '/events/api', docPath: '/events/api/api-docs.json' },
      url: cfg.privateEventsUrl + '/api/api-docs.json'
    })
  }
  return services
}

/** the origin of the site a request came through, every service's mount path is relative to it */
export function siteOrigin (publicBaseUrl: string): string {
  return new URL(publicBaseUrl).origin
}

interface CachedState {
  service: PlatformService
  url?: string
  fragment?: PreparedFragment
  status: FragmentState['status']
  error?: string
  fetchedAt?: string
  etag?: string
}

type Fetched = { notModified: true } | { doc: any, etag?: string }

export function createFragmentCache (opts: { services: { service: PlatformService, url?: string }[], local: () => any, fetch?: typeof fetch, now?: () => Date }) {
  const fetchFn = opts.fetch ?? fetch
  const now = opts.now ?? (() => new Date())
  // services that never answered are errors until their first answer
  const cached: CachedState[] = opts.services.map(({ service, url }) => ({ service, url, status: 'error', error: 'not fetched yet' }))
  let states: FragmentState[] = []

  const snapshot = () => {
    states = cached.map(({ service, fragment, status, error, fetchedAt }) => ({
      service,
      status,
      ...(fragment ? { fragment } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(fetchedAt !== undefined ? { fetchedAt } : {})
    }))
  }
  snapshot()

  const fetchDoc = async (state: CachedState): Promise<Fetched> => {
    if (!state.url) return { doc: opts.local() }
    const headers: Record<string, string> = { accept: 'application/json' }
    if (state.etag) headers['if-none-match'] = state.etag
    const res = await fetchFn(state.url, { headers, signal: AbortSignal.timeout(fetchTimeout) })
    if (res.status === 304 && state.etag) return { notModified: true }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    let doc: any
    try {
      doc = JSON.parse(text)
    } catch {
      throw new Error('invalid JSON')
    }
    return { doc, etag: res.headers.get('etag') ?? undefined }
  }

  const refreshOne = async (state: CachedState) => {
    try {
      const fetched = await fetchDoc(state)
      if ('notModified' in fetched) {
        // the version prepared from that ETag is still current, refused or not
        if (state.fragment) {
          state.status = 'ok'
          delete state.error
        }
      } else {
        const prepared = prepareFragment(state.service, fetched.doc)
        if ('refused' in prepared) {
          // a refused version means the service changed in a way that needs a fix: the last good one is not reused
          delete state.fragment
          state.status = 'refused'
          state.error = prepared.refused
        } else {
          state.fragment = prepared.fragment
          state.status = 'ok'
          delete state.error
        }
        // only once prepared: a later 304 must not stand for a version that failed
        state.etag = fetched.etag
      }
      state.fetchedAt = now().toISOString()
    } catch (err: any) {
      state.error = err?.message ?? String(err)
      state.status = state.fragment ? 'stale' : 'error'
    }
  }

  return {
    /** each service's state is published as soon as it settles: none waits on a slower one */
    async refresh () {
      await Promise.all(cached.map(state => refreshOne(state).then(snapshot)))
    },
    /** a new array after every change, the same one in between */
    states (): FragmentState[] {
      return states
    }
  }
}

/**
 * a document missing a service that never answered (just after a restart, or while it is down) is not
 * kept by shared caches: they would serve it degraded for 5 minutes after the service is back
 */
export function cacheControl (states: FragmentState[]): string {
  return states.some(state => state.fetchedAt === undefined) ? 'no-store' : 'public, max-age=300'
}

let cache: ReturnType<typeof createFragmentCache> | undefined
let interval: ReturnType<typeof setInterval> | undefined
let memoStates: FragmentState[] | undefined
const memo = new Map<string, any>()

export const init = async () => {
  cache = createFragmentCache({ services: platformServices({ ...config, directoryUrl: config.directoryUrl as string }), local: () => apiDocs(config.publicUrl) })
  const refresh = () => cache?.refresh().catch(err => internalError('platform-api-docs', err))
  // the first requests wait for the initial round, but startup does not wait for a slow service
  await Promise.race([refresh(), new Promise(resolve => setTimeout(resolve, initialWait).unref())])
  interval = setInterval(refresh, refreshInterval)
  interval.unref()
}

export const stop = async () => {
  if (interval) clearInterval(interval)
  interval = undefined
}

/** the platform document of a site, memoized per origin until the next refresh */
export function platformDoc (origin: string): any {
  if (!cache) throw new Error('platform document cache not initialized')
  const states = cache.states()
  if (states !== memoStates) {
    memo.clear()
    memoStates = states
  }
  let doc = memo.get(origin)
  if (!doc) {
    doc = mergePlatformDoc(origin, states, { version: pJson.version, oauth2Description: oauth2Scheme().description })
    memo.set(origin, doc)
  }
  return doc
}

export function platformDocCacheControl (): string {
  if (!cache) throw new Error('platform document cache not initialized')
  return cacheControl(cache.states())
}

/**
 * every scope the services of the platform declare (their documents' oauth2 scopes, in the language
 * the documents are fetched in); a stale service keeps the scopes of its last good document
 */
export function platformScopes (): Record<string, string> {
  if (!cache) return {}
  return Object.assign({}, ...cache.states().map(state => state.fragment?.scopes ?? {}))
}
