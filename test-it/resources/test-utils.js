import fs from 'fs-extra'
import path from 'node:path'
import FormData from 'form-data'

export const formHeaders = (form) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  return headers
}

export const sendDataset = async (fileName, ax, opts, body) => {
  const workers = await import('../../api/src/workers/index.ts')
  const datasetFd = fs.readFileSync(path.resolve('./test-it/resources/', fileName))
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  if (body) form.append('body', JSON.stringify(body))
  const res = await ax.post('/api/v1/datasets', form, { ...opts, headers: formHeaders(form) })
  return workers.hook(`finalize/${res.data.id}`)
}

export const timeout = (promise, delay = 1000, message = 'time limit exceeded') => {
  const error = new Error(message) // prepare error at this level so that stack trace is useful
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
  return Promise.race([promise, timeoutPromise])
}
