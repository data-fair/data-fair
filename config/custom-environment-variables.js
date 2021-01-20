module.exports = {
  port: 'PORT',
  mode: 'MODE',
  publicUrl: 'PUBLIC_URL',
  wsPublicUrl: 'WS_PUBLIC_URL',
  sessionDomain: 'SESSION_DOMAIN',
  directoryUrl: 'DIRECTORY_URL',
  privateDirectoryUrl: 'PRIVATE_DIRECTORY_URL',
  openapiViewerUrl: 'OPENAPI_VIEWER_URL',
  captureUrl: 'CAPTURE_URL',
  privateCaptureUrl: 'PRIVATE_CAPTURE_URL',
  notifyUrl: 'NOTIFY_URL',
  privateNotifyUrl: 'PRIVATE_NOTIFY_URL',
  notifyWSUrl: 'NOTIFY_WS_URL',
  subscriptionUrl: 'SUBSCRIPTION_URL',
  mongoUrl: 'MONGO_URL',
  analytics: {
    __name: 'ANALYTICS',
    __format: 'json',
  },
  elasticsearch: {
    host: 'ES_HOST',
    defaultAnalyzer: 'ES_DEFAULT_ANALYZER',
    maxBulkLines: {
      __name: 'ES_MAX_BULK_LINES',
      __format: 'json',
    },
    maxBulkChars: {
      __name: 'ES_MAX_BULK_CHARS',
      __format: 'json',
    },
  },
  defaultRemoteKey: {
    value: 'DEFAULT_REMOTE_KEY',
  },
  secretKeys: {
    identities: 'SECRET_IDENTITIES',
    limits: 'SECRET_LIMITS',
    notifications: 'SECRET_NOTIFICATIONS',
  },
  globalWebhooks: {
    consumption: {
      __name: 'WEBHOOKS_CONSUMPTION',
      __format: 'json',
    },
  },
  brand: {
    logo: 'BRAND_LOGO',
    title: 'BRAND_TITLE',
    description: 'BRAND_DESCRIPTION',
    url: 'BRAND_URL',
    embed: 'BRAND_EMBED',
  },
  theme: {
    dark: {
      __name: 'THEME_DARK',
      __format: 'json',
    },
    colors: {
      primary: 'THEME_PRIMARY',
      secondary: 'THEME_SECONDARY',
      accent: 'THEME_ACCENT',
      error: 'THEME_ERROR',
      info: 'THEME_INFO',
      success: 'THEME_SUCCESS',
      warning: 'THEME_WARNING',
    },
    darkColors: {
      primary: 'THEME_DARK_PRIMARY',
      secondary: 'THEME_DARK_SECONDARY',
      accent: 'THEME_DARK_ACCENT',
      error: 'THEME_DARK_ERROR',
      info: 'THEME_DARK_INFO',
      success: 'THEME_DARK_SUCCESS',
      warning: 'THEME_DARK_WARNING',
    },
    cssUrl: 'THEME_CSS_URL',
    cssText: 'THEME_CSS_TEXT',
  },
  darkModeSwitch: {
    __name: 'DARK_MODE_SWITCH',
    __format: 'json',
  },
  defaultLimits: {
    totalStorage: {
      __name: 'DEFAULT_LIMITS_TOTAL_STORAGE',
      __format: 'json',
    },
    datasetStorage: {
      __name: 'DEFAULT_LIMITS_DATASET_STORAGE',
      __format: 'json',
    },
    maxSpreadsheetSize: {
      __name: 'DEFAULT_LIMITS_MAX_SPREADSHEET_SIZE',
      __format: 'json',
    },
  },
  worker: {
    interval: {
      __name: 'WORKER_INTERVAL',
      __format: 'json',
    },
    concurrency: {
      __name: 'WORKER_CONCURRENCY',
      __format: 'json',
    },
    spawnTask: {
      __name: 'WORKER_SPAWN_TASK',
      __format: 'json',
    },
  },
  browserLogLevel: 'BROWSER_LOG_LEVEL',
  listenWhenReady: {
    __name: 'LISTEN_WHEN_READY',
    __format: 'json',
  },
  thumbor: {
    url: 'THUMBOR_URL',
    key: 'THUMBOR_KEY',
  },
  info: {
    termsOfService: 'INFO_TOS',
    contact: {
      __name: 'INFO_CONTACT',
      __format: 'json',
    },
  },
  tippecanoe: {
    skip: {
      __name: 'TIPPECANOE_SKIP',
      __format: 'json',
    },
  },
  datasetUrlTemplate: 'DATASET_URL_TEMPLATE',
  applicationUrlTemplate: 'APPLICATION_URL_TEMPLATE',
  doc: {
    datasetEdit: 'DOC_DATASET_EDIT',
    datasetExtend: 'DOC_DATASET_EXTEND',
    datasetAttachments: 'DOC_DATASET_ATTACHMENTS',
    settings: 'DOC_SETTINGS',
    catalogs: 'DOC_CATALOGS',
  },
  extraNavigationItems: {
    __name: 'EXTRA_NAV_ITEMS',
    __format: 'json',
  },
  extraAdminNavigationItems: {
    __name: 'EXTRA_ADMIN_NAV_ITEMS',
    __format: 'json',
  },
  dateFormats: {
    __name: 'DATE_FORMATS',
    __format: 'json',
  },
  dateTimeFormats: {
    __name: 'DATE_TIME_FORMATS',
    __format: 'json',
  },
}
