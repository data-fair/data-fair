module.exports = {
  publicUrl: 'PUBLIC_URL',
  wsPublicUrl: 'WS_PUBLIC_URL',
  directoryUrl: 'DIRECTORY_URL',
  openapiViewerUrl: 'OPENAPI_VIEWER_URL',
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
  defaultRemoteKey: {
    value: 'DEFAULT_REMOTE_KEY'
  },
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
  nuxtBuild: {
    active: {
      __name: 'NUXT_BUILD_ACTIVE',
      __format: 'json'
    },
    blocking: {
      __name: 'NUXT_BUILD_BLOCKING',
      __format: 'json'
    }
  },
  i18n: {
    defaultLocale: 'I18N_DEFAULT_LOCALE',
    locales: {
      __name: 'I18N_LOCALES',
      __format: 'json'
    }
  }
}
