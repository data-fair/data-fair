const config = /** @type {any} */(require('config'))
const elasticsearch = require('@elastic/elasticsearch')
const commons = require('./commons')
const manageIndices = require('./manage-indices')

const smallAggs = require('./small-aggs')

exports.delete = manageIndices.delete
exports.initDatasetIndex = manageIndices.initDatasetIndex
exports.switchAlias = manageIndices.switchAlias
exports.datasetInfos = manageIndices.datasetInfos
exports.updateDatasetMapping = manageIndices.updateDatasetMapping

exports.aliasName = commons.aliasName
exports.extractError = commons.extractError
exports.prepareResultItem = commons.prepareResultItem
exports.escapeFilter = commons.escapeFilter

exports.search = require('./search')
exports.multiSearch = require('./multi-search')
exports.count = require('./count')
exports.valuesAgg = require('./values-agg')
exports.values = require('./values')
exports.metricAgg = require('./metric-agg').agg
exports.simpleMetricsAgg = require('./metric-agg').simpleMetricsAgg
exports.geoAgg = require('./geo-agg')
exports.bboxAgg = require('./bbox-agg')
exports.wordsAgg = require('./words-agg')
exports.maxAgg = smallAggs.max
exports.minAgg = smallAggs.min
exports.indexStream = require('./index-stream')

exports.init = async () => {
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
    // solve the quite common case in docker-compose of the service starting at the same time as the elasticsearh node
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
