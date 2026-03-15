import { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import FormData from 'form-data'
import fs from 'fs-extra'
import path from 'node:path'
import { DataFairWsClient } from '@data-fair/lib-node/ws-client.js'
import { apiUrl, anonymousAx, wsUrl, mockUrl } from './axios.ts'

const log = { info: async (...args: any[]) => console.log(...args), error: console.error, debug: console.debug }

/**
 * Create a WS subscriber that pre-subscribes to a dataset journal channel.
 * Buffers all messages from the moment of subscription so none are missed.
 * Use this when you need to subscribe BEFORE triggering the action that causes the event.
 */
export const subscribeJournal = async (
  datasetId: string
) => {
  const channel = `datasets/${datasetId}/journal`
  const wsClient = new DataFairWsClient({ url: wsUrl, log })

  // Buffer messages from the moment we subscribe
  const buffer: any[] = []
  wsClient.on('message', (msg: any) => {
    if (msg.channel === channel && msg.type !== 'subscribe-confirm') {
      buffer.push(msg.data)
    }
  })

  await wsClient.subscribe(channel)

  return {
    waitFor: async (eventType: string, timeout = 30000) => {
      // Check buffer first
      const match = buffer.find((e: any) => e.type === eventType || e.type === 'error')
      if (match) {
        wsClient.close()
        if (match.type === 'error') throw new Error(match.data)
        return match
      }
      // Wait for new messages
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          wsClient.close()
          reject(new Error(`subscribeJournal timeout after ${timeout}ms waiting for "${eventType}" on "${datasetId}"`))
        }, timeout)
        const check = (msg: any) => {
          if (msg.channel !== channel) return
          if (msg.data?.type === eventType || msg.data?.type === 'error') {
            clearTimeout(timer)
            wsClient.off('message', check)
            wsClient.close()
            if (msg.data.type === 'error') reject(new Error(msg.data.data))
            else resolve(msg.data)
          }
        }
        wsClient.on('message', check)
        // Re-check buffer in case message arrived between first check and listener setup
        const late = buffer.find((e: any) => e.type === eventType || e.type === 'error')
        if (late) {
          clearTimeout(timer)
          wsClient.off('message', check)
          wsClient.close()
          if (late.type === 'error') reject(new Error(late.data))
          else resolve(late)
        }
      })
    },
    close: () => wsClient.close()
  }
}

/**
 * Wait for finalize-end on a dataset, then return the updated dataset.
 * Throws if an error event is received before finalize-end.
 * Uses WS subscription for instant notification.
 */
export const waitForFinalize = async (
  ax: AxiosInstance,
  datasetId: string,
  timeout = 30000
): Promise<any> => {
  // First check current state — if status is already finalized and no partial rest status,
  // we need to wait for a NEW finalization. Record current finalizedAt.
  let currentFinalizedAt: string | undefined
  try {
    const current = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
    currentFinalizedAt = current.finalizedAt
  } catch {
    // dataset might not exist yet (just created)
  }

  const wsClient = new DataFairWsClient({ url: wsUrl, log })
  try {
    await wsClient.waitForJournal(datasetId, 'finalize-end', timeout)
  } finally {
    wsClient.close()
  }

  // Verify we got a NEW finalization (not a stale one)
  const res = await ax.get(`/api/v1/datasets/${datasetId}`)
  if (currentFinalizedAt && res.data.finalizedAt === currentFinalizedAt) {
    // The finalize-end we caught was stale, wait for the real one via polling
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const poll = await ax.get(`/api/v1/datasets/${datasetId}`)
      if (poll.data.status === 'error') throw new Error(`Dataset ${datasetId} is in error status`)
      if (poll.data.finalizedAt !== currentFinalizedAt) return poll.data
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error(`waitForFinalize: finalizedAt did not change for dataset ${datasetId}`)
  }
  return res.data
}

/**
 * Perform an action and wait for the dataset to be re-finalized.
 * Records finalizedAt before the action, then polls until it changes.
 * This avoids race conditions with WS events.
 */
export const doAndWaitForFinalize = async (
  ax: AxiosInstance,
  datasetId: string,
  action: () => Promise<any>,
  timeout = 30000
): Promise<any> => {
  const before = (await ax.get(`/api/v1/datasets/${datasetId}`)).data
  const previousFinalizedAt = before.finalizedAt
  await action()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    if (res.data.status === 'error') throw new Error(`Dataset ${datasetId} is in error status`)
    if (res.data.status === 'finalized' && res.data.finalizedAt !== previousFinalizedAt) return res.data
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`doAndWaitForFinalize timeout after ${timeout}ms for dataset ${datasetId}`)
}

/**
 * Wait for a specific journal event type on a dataset.
 * For cases where you need to wait for something other than finalize-end.
 * Note: for 'error' events, use waitForDatasetError() instead since
 * DataFairWsClient.waitForJournal throws on error events.
 */
export const waitForJournalEvent = async (
  datasetId: string,
  eventType: string,
  timeout = 30000
): Promise<any> => {
  const wsClient = new DataFairWsClient({ url: wsUrl, log })
  try {
    return await wsClient.waitForJournal(datasetId, eventType, timeout)
  } finally {
    wsClient.close()
  }
}

/**
 * Wait for a dataset to enter error status by polling.
 * Used when the expected outcome is an error (e.g. invalid file upload).
 */
export const waitForDatasetError = async (
  ax: AxiosInstance,
  datasetId: string,
  timeout = 30000
): Promise<any> => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const res = await ax.get(`/api/v1/datasets/${datasetId}`)
    if (res.data.status === 'error') return res.data
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`waitForDatasetError timeout after ${timeout}ms for dataset ${datasetId}`)
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
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  const res = await ax.post('/api/v1/datasets', form, { ...opts, headers })
  return waitForFinalize(ax, res.data.id)
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
 * Set a config value on the server (for testing).
 */
export const setConfig = async (path: string, value: any): Promise<void> => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/set-config`, { path, value })
}
