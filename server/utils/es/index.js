const config = require('config')
const elasticsearch = require('elasticsearch')

module.exports = {
  ...require('./commons'),
  ...require('./manage-indices'),
  search: require('./search'),
  valuesAgg: require('./values-agg'),
  metricAgg: require('./metric-agg'),
  geoAgg: require('./geo-agg'),
  bboxAgg: require('./bbox-agg'),
  wordsAgg: require('./words-agg'),
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
          // ignore_missing: true,
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
