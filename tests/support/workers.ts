import { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import FormData from 'form-data'
import fs from 'fs-extra'
import path from 'node:path'
import { DataFairWsClient } from '@data-fair/lib-node/ws-client.js'
import { apiUrl, anonymousAx, wsUrl } from './axios.ts'

const log = { info: async (...args: any[]) => console.log(...args), error: console.error, debug: console.debug }

/**
 * Wait for finalize-end on a dataset, then return the updated dataset.
 * Throws if an error event is received before finalize-end.
 * Replaces the old `workers.hook('finalize/' + id)` pattern.
 */
export const waitForFinalize = async (
  ax: AxiosInstance,
  datasetId: string,
  timeout = 30000
): Promise<any> => {
  const wsClient = new DataFairWsClient({ url: wsUrl, log })
  try {
    await wsClient.waitForJournal(datasetId, 'finalize-end', timeout)
  } finally {
    wsClient.close()
  }
  const res = await ax.get(`/api/v1/datasets/${datasetId}`)
  return res.data
}

/**
 * Wait for a specific journal event type on a dataset.
 * For cases where you need to wait for something other than finalize-end.
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
 * Set up a nock interceptor in the server process via test-env API.
 */
export const setupNock = async (config: {
  origin: string
  method?: string
  path: string
  query?: any
  reply?: { status?: number, body?: any, headers?: Record<string, string> }
  persist?: boolean
}) => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/nock`, config)
}

/**
 * Clear all nock interceptors in the server process.
 */
export const clearNock = async () => {
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env/nock`)
}

/**
 * Set up a nock in a worker thread via test-env API.
 * Replaces direct `workers.workers.batchProcessor.run(params, { name: 'setCoordsNock' })` calls.
 */
export const setupWorkerNock = async (
  worker: string,
  functionName: string,
  params: any = {}
) => {
  await anonymousAx.post(`${apiUrl}/api/v1/test-env/worker-nock`, { worker, functionName, params })
}
