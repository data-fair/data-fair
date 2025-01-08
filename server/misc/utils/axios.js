// prepare an axios instance with improved error management

import axios from 'axios'
import { httpAgent, httpsAgent } from './http-agents.js'

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent
})

axiosInstance.interceptors.response.use(response => response, error => {
  if (!error.response) return Promise.reject(error)
  delete error.response.request
  delete error.response.headers
  error.response.config = { method: error.response.config.method, url: error.response.config.url, data: error.response.config.data }
  if (error.response.config.data && error.response.config.data._writableState) delete error.response.config.data
  if (error.response.data && error.response.data._readableState) delete error.response.data
  let messageText = error.response.statusText
  if (error.response.data) {
    messageText = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)
  }
  error.response.message = `${error.response.status} - ${messageText}`

  return Promise.reject(error.response)
})

export default axiosInstance
