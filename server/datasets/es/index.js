const config = /** @type {any} */(require('config'))
const elasticsearch = require('@elastic/elasticsearch')
const commons = require('./commons')
const manageIndices = require('./manage-indices')

const smallAggs = require('./small-aggs')

 export const delete = manageIndices.delete
 export const initDatasetIndex = manageIndices.initDatasetIndex
 export const switchAlias = manageIndices.switchAlias
 export const validateDraftAlias = manageIndices.validateDraftAlias
 export const datasetInfos = manageIndices.datasetInfos
 export const datasetWarning = manageIndices.datasetWarning
 export const updateDatasetMapping = manageIndices.updateDatasetMapping

 export const aliasName = commons.aliasName
 export const extractError = commons.extractError
 export const prepareResultItem = commons.prepareResultItem
 export const escapeFilter = commons.escapeFilter

 export const search = require('./search')
 export const multiSearch = require('./multi-search')
 export const count = require('./count')
 export const valuesAgg = require('./values-agg')
 export const values = require('./values')
 export const metricAgg = require('./metric-agg').agg
 export const simpleMetricsAgg = require('./metric-agg').simpleMetricsAgg
 export const geoAgg = require('./geo-agg')
 export const bboxAgg = require('./bbox-agg')
 export const wordsAgg = require('./words-agg')
 export const maxAgg = smallAggs.max
 export const minAgg = smallAggs.min
 export const indexStream = require('./index-stream')

 export const init = async () => {
  let node = config.elasticsearch.nodes
  if (!node) {
    node = config.elasticsearch.host
    if (!node.startsWith('http')) node = 'http://' + node
  }
  const options = {
    node,
    auth: config.elasticsearch.auth,
    requestTimeout: 240000, // same as timeout in bulk indexing requests
    ...config.elasticsearch.options
  }
  if (config.elasticsearch.ca) {
    options.ssl = options.ssl ?? {} // note, in v8 this becomes "tls"
    options.ssl.ca = config.elasticsearch.ca
  }
  const client = new elasticsearch.Client(options)
  try {
    await client.ping()
  } catch (err) {
    // 1 retry after 2s
    // solve the quite common case in docker compose of the service starting at the same time as the elasticsearh node
    await new Promise(resolve => setTimeout(resolve, 2000))
    await client.ping()
  }
  await client.ingest.putPipeline({
    id: 'attachment',
    body: {
      description: 'Extract information from attached files',
      processors: [{
        attachment: {
          field: '_file_raw',
          target_field: '_file',
          ignore_missing: true,
          properties: ['content', 'content_type', 'content_length']
        },
        remove: {
          field: '_file_raw',
          ignore_missing: true
        }
      }]
    }
  })
  return client
}
