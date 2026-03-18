import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import { benchSchema, generateRows } from './seed.ts'
import type { AxiosInstance } from 'axios'

const baseUrl = process.env.BENCHMARK_URL || 'http://localhost:3867/data-fair'
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || 'http://localhost:3867/simple-directory'

let ax: AxiosInstance

export async function init () {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await axiosAuth({
    email: 'dmeadus0@answers.com',
    password: 'passwd',
    directoryUrl,
    axiosOpts: { baseURL: baseUrl, headers: { 'x-cache-bypass': '1' } }
  })

  // Quick health check
  const res = await ax.get('/api/v1/datasets', { params: { size: 0 } })
  console.log(`[setup] connected (${res.data.count} existing datasets)`)
}

export async function seedDatasets () {
  for (const { id, count } of [{ id: 'bench-small', count: 1000 }, { id: 'bench-large', count: 100000 }]) {
    // Check if already seeded
    try {
      const res = await ax.get(`/api/v1/datasets/${id}`)
      if (res.data.status === 'finalized' && res.data.count >= count) {
        console.log(`[seed] ${id} already exists (${res.data.count} rows), skipping`)
        continue
      }
    } catch {
      // dataset doesn't exist, create it
    }

    console.log(`[seed] creating ${id} (${count} rows)...`)
    await ax.put(`/api/v1/datasets/${id}`, {
      isRest: true,
      title: id,
      schema: benchSchema
    })

    const rows = generateRows(count)
    const batchSize = 1000
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, batch)
      if ((i + batchSize) % 10000 === 0 || i + batchSize >= rows.length) {
        console.log(`[seed] ${id}: ${Math.min(i + batchSize, rows.length)}/${count} rows`)
      }
    }

    // Wait for finalization
    console.log(`[seed] ${id}: waiting for finalization...`)
    let finalized = false
    for (let attempt = 0; attempt < 120; attempt++) {
      const res = await ax.get(`/api/v1/datasets/${id}`)
      if (res.data.status === 'finalized') {
        finalized = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    if (!finalized) throw new Error(`${id} did not finalize in time`)

    console.log(`[seed] ${id} ready`)
  }
}

export function getBaseUrl () {
  return baseUrl
}

export function getAxios () {
  return ax
}
