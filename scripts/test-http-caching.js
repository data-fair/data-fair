// this script is for developpers and technicians that want to check
// that the reverse-proxy cache in front a data-fair instance is behving correctly

// change these variables
const baseUrl = 'https://staging-koumoul.com/data-fair/api/v1'
const datasetId = 'dvf-vannes-562603'

const assert = require('assert').strict
const axios = require('axios')

const formatResponse = (response) => {
  // console.log(response.headers)
  return {
    status: response.status,
    date: response.headers.date,
    cacheStatus: response.headers['x-cache-status'],
    cacheControl: response.headers['cache-control'],
    etag: response.headers.etag
  }
}

axios.interceptors.response.use(formatResponse, (error) => {
  return error.response ? formatResponse(error.response) : Promise.reject(error)
})

async function main () {
  // listing dataset is not stored in cache, but it respects etag validation
  let res = await axios.get(`${baseUrl}/datasets`)
  assert.equal(res.status, 200)
  assert.equal(res.cacheStatus, 'MISS')
  assert.ok(res.etag)
  res = await axios.get(`${baseUrl}/datasets`, { headers: { 'If-None-Match': res.etag } })
  assert.equal(res.status, 304)

  // listing lines in a public dataset is stored in public cache
  res = await axios.get(`${baseUrl}/datasets/${datasetId}/lines`)
  assert.equal(res.status, 200)
  res = await axios.get(`${baseUrl}/datasets/${datasetId}/lines`)
  assert.equal(res.status, 200)
  assert.equal(res.cacheStatus, 'HIT')
  res = await axios.get(`${baseUrl}/datasets/${datasetId}/lines`, { headers: { 'If-None-Match': res.etag } })
  assert.equal(res.status, 304)

  // the data file is not cached
  res = await axios.get(`${baseUrl}/datasets/${datasetId}/full`)
  assert.equal(res.status, 200)
  assert.equal(res.cacheStatus, 'MISS')
}
main()
