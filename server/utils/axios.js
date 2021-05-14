// prepare an axios instance with improved error management

const axios = require('axios')

module.exports = axios.create()

module.exports.interceptors.response.use(response => response, error => {
  if (!error.response) return Promise.reject(error)
  delete error.response.request
  delete error.response.headers
  error.response.config = { method: error.response.config.method, url: error.response.config.url, data: error.response.config.data }
  if (error.response.config.data && error.response.config.data._writableState) delete error.response.config.data
  if (error.response.data && error.response.data._readableState) delete error.response.data
  error.response.message = `${error.response.status} - ${error.response.data || error.response.statusText}`
  return Promise.reject(error.response)
})
