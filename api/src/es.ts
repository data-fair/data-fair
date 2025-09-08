import config from '#config'
import elasticsearch, { type ClientOptions, type Client } from '@elastic/elasticsearch'

export class DfEs {
  private _client?: Client

  get client () {
    if (!this._client) throw new Error('db was not connected')
    return this._client
  }

  async connect () {
    let node = config.elasticsearch.nodes
    if (!node) {
      node = config.elasticsearch.host
      if (!node.startsWith('http')) node = 'http://' + node
    }
    const options: ClientOptions = {
      node,
      auth: config.elasticsearch.auth,
      requestTimeout: 240000, // same as timeout in bulk indexing requests
      ...config.elasticsearch.options
    }
    if (config.elasticsearch.ca) {
      options.tls = options.tls ?? {} // note, in v8 this becomes "tls"
      options.tls.ca = config.elasticsearch.ca
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
    this._client = client
  }

  async init () {
    await this.connect()
    await this.client.ingest.putPipeline({
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
  }
}

const dfEs = new DfEs()

export default dfEs
