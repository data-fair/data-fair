import { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import FormData from 'form-data'
import fs from 'fs-extra'
import path from 'node:path'
import { DataFairWsClient } from '@data-fair/lib-node/ws-client.js'
import { apiUrl, anonymousAx, wsUrl, mockUrl } from './axios.ts'

const log = { info: async () => {}, error: console.error, debug: () => {} }

let _sharedWs: DataFairWsClient | null = null

const getSharedWs = (): DataFairWsClient => {
  if (!_sharedWs) {
    _sharedWs = new DataFairWsClient({ url: wsUrl, log })
  }
  return _sharedWs
}

export const closeSharedWs = () => {
  if (_sharedWs) {
    _sharedWs.close()
    _sharedWs = null
  }
}

/**
 * Wait for finalize-end on a dataset, then return the updated dataset.
 * Throws if an error event is received before finalize-end.
 */
export const waitForFinalize = async (
  ax: AxiosInstance,
  datasetId: string,
  timeout = 4000
): Promise<any> => {
  try {
    await getSharedWs().waitForJournal(datasetId, 'finalize-end', timeout)
  } catch (err: any) {
    // ignore some non-blocking errors
    // TODO: these should have a different type, like "warning"
    if (err.message.includes('le fichier contient une ou plusieurs colonnes') || err.message.includes('% des lignes')) {
      return await waitForFinalize(ax, datasetId)
    } else {
      throw err
    }
  }
  return (await ax.get(`/api/v1/datasets/${datasetId}`)).data
}

/**
 * Perform an action and wait for the dataset to be re-finalized.
 * Pre-subscribes to journal before action to avoid missing fast events.
 */
export const doAndWaitForFinalize = async (
  ax: AxiosInstance,
  datasetId: string,
  action: () => Promise<any>,
  timeout = 4000
): Promise<any> => {
  /* const sub = await subscribeJournal(datasetId)
  await action()
  await sub.waitFor('finalize-end', timeout)
  sub.close()
  return (await ax.get(`/api/v1/datasets/${datasetId}`)).data
  */
  const [data] = await Promise.all([
    waitForFinalize(ax, datasetId, timeout),
    action()
  ])
  return data
}

/**
 * Wait for a specific journal event type on a dataset.
 * For cases where you need to wait for something other than finalize-end.
 * Note: for 'error' events, use waitForDatasetError() instead since
 * waitForJournal throws on error events.
 */
export const waitForJournalEvent = async (
  datasetId: string,
  eventType: string,
  timeout = 4000
): Promise<any> => {
  return getSharedWs().waitForJournal(datasetId, eventType, timeout)
}

/**
 * Wait for a dataset to enter error status.
 * Uses shared WS client to listen for error journal events.
 */
export const waitForDatasetError = async (
  ax: AxiosInstance,
  datasetId: string,
  opts?: { timeout?: number, draft?: boolean }
): Promise<any> => {
  const timeout = opts?.timeout ?? 4000
  const params = opts?.draft ? { draft: true } : undefined
  const ws = getSharedWs()
  await ws.waitFor(`datasets/${datasetId}/journal`, (e: any) => e.type === 'error', timeout)
  return (await ax.get(`/api/v1/datasets/${datasetId}`, { params })).data
}

/**
 * Upload a dataset file and wait for finalize.
 * Replaces the old `sendDataset()` from test-it/utils.
 */
export const sendDataset = async (
  fileName: string,
  ax: AxiosInstance,
  opts?: AxiosRequestConfig,
  body?: any
): Promise<any> => {
  const datasetFd = fs.readFileSync(path.resolve('./test-it/resources/', fileName))
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  if (body) form.append('body', JSON.stringify(body))
  const length = form.getLengthSync()
  const headers = { 'Content-Length': length, ...form.getHeaders() }
  const res = await ax.post('/api/v1/datasets', form, { ...opts, headers })
  const timeout = length > 20000 ? 30000 : 4000
  return waitForFinalize(ax, res.data.id, timeout)
}

/**
 * Register a dynamic route on the mock server.
 * The route will override any static route with the same path.
 */
export const setupMockRoute = async (config: {
  path: string
  status?: number
  body?: any
  bodyBase64?: string
  contentType?: string
  delay?: number
  ndjsonEcho?: { fields: Record<string, any>, indexFields?: string[] }
  once?: boolean
}) => {
  await anonymousAx.post(`${mockUrl}/_test/routes`, config)
}

/**
 * Clear all dynamic mock routes and received requests.
 */
export const clearMockRoutes = async () => {
  await anonymousAx.delete(`${mockUrl}/_test/routes`)
}

/**
 * Get all requests received by dynamic mock routes.
 */
export const getMockReceivedRequests = async (): Promise<Array<{ path: string, method: string, body: any }>> => {
  const res = await anonymousAx.get(`${mockUrl}/_test/received`)
  return res.data
}

/**
 * Call a function in a worker thread via test-env API.
 * Used for things like setting environment variables in worker threads.
 */
export const callWorkerFunction = async (
  worker: string,
  functionName: string,
  params: any = {}
) => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/worker-call`, { worker, functionName, params })
}

/**
 * Get the raw MongoDB document for a dataset (including draft field).
 * Use when you need access to draft.schema, draft.status, etc.
 * The standard API always strips the draft field from responses.
 */
export const getRawDataset = async (datasetId: string): Promise<any> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/raw-dataset/${datasetId}`)
  return res.data
}

/**
 * Clear rate limiting without full data cleanup.
 */
export const clearRateLimiting = async () => {
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/rate-limiting`)
}

/**
 * Clear memoized publication site settings cache.
 */
export const clearPublicationSitesCache = async () => {
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/publication-sites-cache`)
}

/**
 * Clear memoized dataset cache.
 * Use after modifying dataset permissions or other fields that may be stale in the 30s memoize cache.
 */
export const clearDatasetCache = async () => {
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/dataset-cache`)
}

/**
 * Check if a file exists via test-env API.
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/file-exists`, { params: { path: filePath } })
  return res.data.exists
}

/**
 * Count documents in a REST dataset's MongoDB collection.
 */
export const restCollectionCount = async (datasetId: string, filter: Record<string, any> = {}): Promise<number> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/rest-collection-count/${datasetId}`, {
    params: { filter: JSON.stringify(filter) }
  })
  return res.data.count
}

/**
 * Find one document in a REST dataset's MongoDB collection.
 */
export const restCollectionFindOne = async (datasetId: string, filter: Record<string, any> = {}, projection?: Record<string, any>): Promise<any> => {
  const params: any = { filter: JSON.stringify(filter) }
  if (projection) params.projection = JSON.stringify(projection)
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/rest-collection-find-one/${datasetId}`, { params })
  return res.data
}

/**
 * Update one document in a REST dataset's MongoDB collection.
 */
export const restCollectionUpdateOne = async (datasetId: string, filter: Record<string, any>, update: Record<string, any>): Promise<void> => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/rest-collection-update-one/${datasetId}`, { filter, update })
}

/**
 * Count ES indices matching a dataset prefix.
 */
export const datasetEsIndicesCount = async (datasetId: string): Promise<number> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/dataset-es-indices-count/${datasetId}`)
  return res.data.count
}

/**
 * Get ES alias name for a dataset.
 */
export const datasetEsAliasName = async (datasetId: string): Promise<string> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/dataset-es-alias-name/${datasetId}`)
  return res.data.aliasName
}

/**
 * List attachment files for a dataset.
 */
export const lsAttachments = async (datasetId: string): Promise<string[]> => {
  const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/ls-attachments/${datasetId}`)
  return res.data.files
}

/**
 * Emit a WebSocket event via wsEmitter.
 */
export const wsEmit = async (channel: string, data: any): Promise<void> => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/ws-emit`, { channel, data })
}

/**
 * Validate DCAT JSON.
 */
export const validateDcat = async (body: any): Promise<{ valid: boolean, errors?: any[] }> => {
  const res = await anonymousAx.post(`${apiUrl}/api/v1/test-env/validate-dcat`, body)
  return res.data
}

/**
 * Set an environment variable in the main server process and worker threads.
 * Pass undefined as value to unset.
 */
export const setServerEnv = async (key: string, value?: string) => {
  await Promise.all([
    anonymousAx.post(`${apiUrl}/api/v1/test-env/set-env`, { key, value }),
    callWorkerFunction('batchProcessor', 'setEnv', { key, value }),
    callWorkerFunction('filesProcessor', 'setEnv', { key, value }),
  ])
}

/**
 * Set a config value on the server (for testing).
 */
export const setConfig = async (path: string, value: any): Promise<void> => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path, value })
}

/**
 * Start collecting test events (notifications) on the server side.
 * Returns a collector object with methods to get events and stop collecting.
 */
export const collectNotifications = async () => {
  const res = await anonymousAx.post(`${apiUrl}/api/v1/test-env/events/start`)
  const offset = res.data.offset

  return {
    /** Get all collected notifications since start */
    getAll: async (): Promise<any[]> => {
      const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/events/buffer`, { params: { offset } })
      return res.data
    },
    /** Wait until at least `count` notifications are collected, then return them */
    waitForCount: async (count: number, timeout = 10000): Promise<any[]> => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/events/buffer`, { params: { offset } })
        if (res.data.length >= count) return res.data
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      const res = await anonymousAx.get(`${apiUrl}/api/v1/test-env/events/buffer`, { params: { offset } })
      return res.data
    },
    /** No cleanup needed with offset-based approach */
    close: async () => {}
  }
}
