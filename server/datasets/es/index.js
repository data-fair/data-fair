import config from 'config'
import elasticsearch from '@elastic/elasticsearch'

export * from './manage-indices.js'
export * from './commons.js'
export { default as search } from './search.js'
export { default as multiSearch } from './multi-search.js'
export { default as count } from './count.js'
export { default as valuesAgg } from './values-agg.js'
export { default as values } from './values.js'
export * as metricAgg from './metric-agg.js'
export * as simpleMetricsAgg from './metric-agg.js'
export { default as geoAgg } from './geo-agg.js'
export { default as bboxAgg } from './bbox-agg.js'
export { default as wordsAgg } from './words-agg.js'
export { max as maxAgg, min as minAgg } from './small-aggs.js'
export { default as indexStream } from './index-stream.js'

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
