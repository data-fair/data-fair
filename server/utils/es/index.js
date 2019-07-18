const config = require('config')
const elasticsearch = require('elasticsearch')

const smallAggs = require('./small-aggs')
module.exports = {
  ...require('./commons'),
  ...require('./manage-indices'),
  search: require('./search'),
  count: require('./count'),
  valuesAgg: require('./values-agg'),
  values: require('./values'),
  metricAgg: require('./metric-agg'),
  geoAgg: require('./geo-agg'),
  bboxAgg: require('./bbox-agg'),
  wordsAgg: require('./words-agg'),
  maxAgg: smallAggs.max,
  minAgg: smallAggs.min,
  indexStream: require('./index-stream')
}

module.exports.init = async () => {
  const client = elasticsearch.Client(Object.assign({}, config.elasticsearch))
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
          properties: ['content', 'content_type', 'content_length']
        },
        remove: {
          field: '_file_raw'
        }
      }]
    }
  })
  return client
}
