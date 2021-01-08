const config = require('config')
const elasticsearch = require('@elastic/elasticsearch')

const smallAggs = require('./small-aggs')
Object.assign(exports, require('./commons'))
Object.assign(exports, require('./manage-indices'))
exports.search = require('./search')
exports.count = require('./count')
exports.valuesAgg = require('./values-agg')
exports.values = require('./values')
exports.metricAgg = require('./metric-agg')
exports.geoAgg = require('./geo-agg')
exports.bboxAgg = require('./bbox-agg')
exports.wordsAgg = require('./words-agg')
exports.maxAgg = smallAggs.max
exports.minAgg = smallAggs.min
exports.indexStream = require('./index-stream')
exports.errorMessage = (errBody) => {
  if (!errBody) return
  let message
  if (errBody.reason) message = errBody.reason
  if (errBody.root_cause && errBody.root_cause.reason) message = errBody.root_cause.reason
  if (errBody.root_cause && errBody.root_cause[0] && errBody.root_cause[0].reason) message = errBody.root_cause[0].reason
  if (errBody.failed_shards && errBody.failed_shards[0] && errBody.failed_shards[0].reason) {
    const shardReason = errBody.failed_shards[0].reason
    if (shardReason.caused_by && shardReason.caused_by.reason) {
      message = shardReason.caused_by.reason
    } else {
      message = shardReason.reason || shardReason
    }
  }
  return message
}
exports.init = async () => {
  let node = config.elasticsearch.host
  if (!node.startsWith('http')) node = 'http://' + node
  const client = new elasticsearch.Client(Object.assign({ node }, config.elasticsearch))
  await client.ping()
  await client.ingest.putPipeline({
    id: 'attachment',
    body: {
      description: 'Extract information from attached files',
      processors: [{
        attachment: {
          field: '_file_raw',
          target_field: '_file',
          ignore_missing: true,
          properties: ['content', 'content_type', 'content_length'],
        },
        remove: {
          field: '_file_raw',
          ignore_missing: true,
        },
      }],
    },
  })
  return client
}
