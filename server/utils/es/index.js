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
