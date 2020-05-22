// require('cache-require-paths')
const fs = require('fs-extra')
const path = require('path')
const FormData = require('form-data')

exports.formHeaders = (form) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  return headers
}

exports.sendDataset = async(fileName, ax) => {
  const datasetFd = fs.readFileSync(path.resolve('./test/resources/', fileName))
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  const res = await ax.post('/api/v1/datasets', form, { headers: exports.formHeaders(form) })
  const workers = require('../../server/workers')
  return workers.hook(`finalizer/${res.data.id}`)
}
