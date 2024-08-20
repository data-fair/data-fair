// require('cache-require-paths')
const fs = require('fs-extra')
const path = require('path')
const FormData = require('form-data')

exports.formHeaders = (form) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  return headers
}

exports.sendDataset = async (fileName, ax, opts, body) => {
  const workers = require('../../server/workers')
  const datasetFd = fs.readFileSync(path.resolve('./test/resources/', fileName))
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  if (body) form.append('body', JSON.stringify(body))
  const res = await ax.post('/api/v1/datasets', form, { ...opts, headers: exports.formHeaders(form) })
  return workers.hook(`datasetStateManager/${res.data.id}`)
}

exports.timeout = (promise, delay = 1000, message = 'time limit exceeded') => {
  const error = new Error(message) // prepare error at this level so that stack trace is useful
  const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(error), delay))
  return Promise.race([promise, timeoutPromise])
}
