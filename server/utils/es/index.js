const config = require('config')
const elasticsearch = require('@elastic/elasticsearch')

const smallAggs = require('./small-aggs')
Object.assign(exports, require('./commons'))
Object.assign(exports, require('./manage-indices'))
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
  const client = new elasticsearch.Client({ node, auth: config.elasticsearch.auth, ...config.elasticsearch.options })
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
