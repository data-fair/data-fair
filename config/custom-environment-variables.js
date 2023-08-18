module.exports = {
  port: 'PORT',
  mode: 'MODE',
  publicUrl: 'PUBLIC_URL',
  oldPublicUrl: 'OLD_PUBLIC_URL',
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
  mongo: {
    url: 'MONGO_URL',
    maxBulkOps: {
      __name: 'MONGO_MAX_BULK_OPS',
      __format: 'json'
    }
  },
  cache: {
    publicMaxAge: {
      __name: 'CACHE_PUBLIC_MAX_AGE',
      __format: 'json'
    },
    timestampedPublicMaxAge: {
      __name: 'CACHE_TIMESTAMPED_PUBLIC_MAX_AGE',
      __format: 'json'
    },
    // size of cache of vector tiles in mongodb (in mb)
    mongoSize: {
      __name: 'CACHE_MONGO_SIZE',
      __format: 'json'
    }
  },
  analytics: {
    __name: 'ANALYTICS',
    __format: 'json'
  },
  elasticsearch: {
    host: 'ES_HOST',
    nodes: {
      __name: 'ES_NODES',
      __format: 'json'
    },
    auth: {
      __name: 'ES_AUTH',
      __format: 'json'
    },
    defaultAnalyzer: 'ES_DEFAULT_ANALYZER',
    maxBulkLines: {
      __name: 'ES_MAX_BULK_LINES',
      __format: 'json'
    },
    maxBulkChars: {
      __name: 'ES_MAX_BULK_CHARS',
      __format: 'json'
    },
    maxShardSize: {
      __name: 'ES_MAX_SHARD_SIZE',
      __format: 'json'
    },
    nbReplicas: {
      __name: 'ES_NB_REPLICAS',
      __format: 'json'
    }
  },
  secretKeys: {
    identities: 'SECRET_IDENTITIES',
    limits: 'SECRET_LIMITS',
    notifications: 'SECRET_NOTIFICATIONS',
    masterData: 'SECRET_MASTER_DATA'
  },
  globalWebhooks: {
    consumption: {
      __name: 'WEBHOOKS_CONSUMPTION',
      __format: 'json'
    }
  },
  brand: {
    logo: 'BRAND_LOGO',
    title: 'BRAND_TITLE',
    description: 'BRAND_DESCRIPTION',
    url: 'BRAND_URL',
    embed: 'BRAND_EMBED'
  },
  theme: {
    dark: {
      __name: 'THEME_DARK',
      __format: 'json'
    },
    colors: {
      primary: 'THEME_PRIMARY',
      secondary: 'THEME_SECONDARY',
      accent: 'THEME_ACCENT',
      error: 'THEME_ERROR',
      info: 'THEME_INFO',
      success: 'THEME_SUCCESS',
      warning: 'THEME_WARNING'
    },
    darkColors: {
      primary: 'THEME_DARK_PRIMARY',
      secondary: 'THEME_DARK_SECONDARY',
      accent: 'THEME_DARK_ACCENT',
      error: 'THEME_DARK_ERROR',
      info: 'THEME_DARK_INFO',
      success: 'THEME_DARK_SUCCESS',
      warning: 'THEME_DARK_WARNING'
    },
    cssUrl: 'THEME_CSS_URL',
    cssText: 'THEME_CSS_TEXT'
  },
  darkModeSwitch: {
    __name: 'DARK_MODE_SWITCH',
    __format: 'json'
  },
  defaultLimits: {
    totalStorage: {
      __name: 'DEFAULT_LIMITS_TOTAL_STORAGE',
      __format: 'json'
    },
    totalIndexed: {
      __name: 'DEFAULT_LIMITS_TOTAL_INDEXED',
      __format: 'json'
    },
    datasetStorage: {
      __name: 'DEFAULT_LIMITS_DATASET_STORAGE',
      __format: 'json'
    },
    datasetIndexed: {
      __name: 'DEFAULT_LIMITS_DATASET_INDEXED',
      __format: 'json'
    },
    nbDatasets: {
      __name: 'DEFAULT_LIMITS_NB_DATASETS',
      __format: 'json'
    },
    maxSpreadsheetSize: {
      __name: 'DEFAULT_LIMITS_MAX_SPREADSHEET_SIZE',
      __format: 'json'
    }
  },
  worker: {
    interval: {
      __name: 'WORKER_INTERVAL',
      __format: 'json'
    },
    concurrency: {
      __name: 'WORKER_CONCURRENCY',
      __format: 'json'
    },
    spawnTask: {
      __name: 'WORKER_SPAWN_TASK',
      __format: 'json'
    }
  },
  browserLogLevel: 'BROWSER_LOG_LEVEL',
  listenWhenReady: {
    __name: 'LISTEN_WHEN_READY',
    __format: 'json'
  },
  applications: {
    __name: 'APPLICATIONS',
    __format: 'json'
  },
  applicationsPrivateMapping: {
    __name: 'APPLICATIONS_PRIVATE_MAPPING',
    __format: 'json'
  },
  applicationsDirectories: {
    __name: 'APPLICATIONS_DIRECTORIES',
    __format: 'json'
  },
  baseAppsCategories: {
    __name: 'BASE_APPS_CATEGORIES',
    __format: 'json'
  },
  remoteServices: {
    __name: 'REMOTE_SERVICES',
    __format: 'json'
  },
  remoteServicesPrivateMapping: {
    __name: 'REMOTE_SERVICES_PRIVATE_MAPPING',
    __format: 'json'
  },
  defaultRemoteKey: {
    value: 'DEFAULT_REMOTE_KEY'
  },
  catalogs: {
    __name: 'CATALOGS',
    __format: 'json'
  },
  disableSharing: {
    __name: 'DISABLE_SHARING',
    __format: 'json'
  },
  disableApplications: {
    __name: 'DISABLE_APPLICATIONS',
    __format: 'json'
  },
  disableRemoteServices: {
    __name: 'DISABLE_REMOTE_SERVICES',
    __format: 'json'
  },
  disablePublicationSites: {
    __name: 'DISABLE_PUBLICATION_SITES'
  },
  info: {
    termsOfService: 'INFO_TOS',
    contact: {
      __name: 'INFO_CONTACT',
      __format: 'json'
    }
  },
  ogr2ogr: {
    skip: {
      __name: 'OGR2OGR_SKIP',
      __format: 'json'
    },
    timeout: {
      __name: 'OGR2OGR_TIMEOUT',
      __format: 'json'
    }
  },
  extraNavigationItems: {
    __name: 'EXTRA_NAV_ITEMS',
    __format: 'json'
  },
  extraAdminNavigationItems: {
    __name: 'EXTRA_ADMIN_NAV_ITEMS',
    __format: 'json'
  },
  dateFormats: {
    __name: 'DATE_FORMATS',
    __format: 'json'
  },
  dateTimeFormats: {
    __name: 'DATE_TIME_FORMATS',
    __format: 'json'
  },
  defaultTimeZone: 'DEFAULT_TIME_ZONE',
  i18n: {
    locales: 'I18N_LOCALES',
    defaultLocale: 'I18N_DEFAULT_LOCALE'
  },
  prometheus: {
    active: {
      __name: 'PROMETHEUS_ACTIVE',
      __format: 'json'
    },
    port: 'PROMETHEUS_PORT'
  },
  agentkeepaliveOptions: {
    __name: 'AGENTKEEPALIVE_OPTIONS',
    __format: 'json'
  },
  exportRestDatasets: {
    cron: 'EXPORT_REST_DATASETS_CRON'
  },
  clamav: {
    active: {
      __name: 'CLAMAV_ACTIVE',
      __format: 'json'
    },
    host: 'CLAMAV_HOST',
    port: 'CLAMAV_PORT',
    dataDir: 'CLAMAV_DATA_DIR'
  }
}
