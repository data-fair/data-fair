module.exports = {
  publicUrl: 'PUBLIC_URL',
  wsPublicUrl: 'WS_PUBLIC_URL',
  directoryUrl: 'DIRECTORY_URL',
  mongoUrl: 'MONGO_URL',
  analytics: 'ANALYTICS',
  elasticsearch: {
    host: 'ES_HOST',
    defaultAnalyzer: 'ES_DEFAULT_ANALYZER',
    maxBulkLines: {
      __name: 'ES_MAX_BULK_LINES',
      __format: 'json'
    },
    maxBulkChars: {
      __name: 'ES_MAX_BULK_CHARS',
      __format: 'json'
    }
  },
  defaultRemoteKey: 'DEFAULT_REMOTE_KEY',
  secretKeys: {
    ownerNames: 'SECRET_OWNERNAMES'
  },
  brand: {
    logo: 'BRAND_LOGO',
    title: 'BRAND_TITLE',
    description: 'BRAND_DESCRIPTION',
    url: 'BRAND_URL'
  },
  workers: {
    concurrency: 'WORKERS_CONCURRENCY'
  },
  defaultCatalog: {
    url: 'DEFAULT_CATALOG_URL',
    type: 'DEFAULT_CATALOG_TYPE'
  }
}
