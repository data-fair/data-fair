module.exports = {
  port: 'PORT',
  mode: 'MODE',
  noFS: {
    __name: 'NO_FS',
    __format: 'json'
  },
  publicUrl: 'PUBLIC_URL',
  oldPublicUrl: 'OLD_PUBLIC_URL',
  wsPublicUrl: 'WS_PUBLIC_URL',
  sessionDomain: 'SESSION_DOMAIN',
  directoryUrl: 'DIRECTORY_URL',
  privateDirectoryUrl: 'PRIVATE_DIRECTORY_URL',
  captureUrl: 'CAPTURE_URL',
  privateCaptureUrl: 'PRIVATE_CAPTURE_URL',
  privateCatalogsUrl: 'PRIVATE_CATALOGS_URL',
  privateEventsUrl: 'PRIVATE_EVENTS_URL',
  privatePortalsManagerUrl: 'PRIVATE_PORTALS_MANAGER_URL',
  privateProcessingsUrl: 'PRIVATE_PROCESSINGS_URL',
  privateMetricsUrl: 'PRIVATE_METRICS_URL',
  subscriptionUrl: 'SUBSCRIPTION_URL',
  mongo: {
    url: 'MONGO_URL',
    maxBulkOps: {
      __name: 'MONGO_MAX_BULK_OPS',
      __format: 'json'
    },
    options: {
      __name: 'MONGO_OPTIONS',
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
    },
    reverseProxyCache: 'REVERSE_PROXY_CACHE'
  },
  tiles: {
    maxThreads: {
      __name: 'TILES_MAX_THREADS',
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
    options: {
      __name: 'ES_OPTIONS',
      __format: 'json'
    },
    ca: 'ES_CA',
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
    },
    searchTimeout: 'ES_SEARCH_TIMEOUT',
    acceptYellowStatus: {
      __name: 'ES_ACCEPT_YELLOW_STATUS',
      __format: 'json'
    }
  },
  secretKeys: {
    identities: 'SECRET_IDENTITIES',
    limits: 'SECRET_LIMITS',
    catalogs: 'SECRET_CATALOGS',
    events: 'SECRET_EVENTS',
    ignoreRateLimiting: 'SECRET_IGNORE_RATE_LIMITING'
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
    baseConcurrency: {
      __name: 'WORKER_BASE_CONCURRENCY',
      __format: 'json'
    },
    errorRetryDelay: {
      __name: 'WORKER_ERROR_RETRY_DELAY',
      __format: 'json'
    },
    closeTimeout: {
      __name: 'WORKER_CLOSE_TIMEOUT',
      __format: 'json'
    },
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
    __name: 'DISABLE_PUBLICATION_SITES',
    __format: 'json'
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
  extraDocLinks: {
    __name: 'EXTRA_DOC_LINKS',
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
  observer: {
    active: {
      __name: 'OBSERVER_ACTIVE',
      __format: 'json'
    },
    port: 'OBSERVER_PORT'
  },
  agentkeepaliveOptions: {
    __name: 'AGENTKEEPALIVE_OPTIONS',
    __format: 'json'
  },
  clamav: {
    active: {
      __name: 'CLAMAV_ACTIVE',
      __format: 'json'
    },
    host: 'CLAMAV_HOST',
    port: 'CLAMAV_PORT',
    dataDir: 'CLAMAV_DATA_DIR'
  },
  assertImmutable: {
    __name: 'ASSERT_IMMUTABLE',
    __format: 'json'
  },
  extensionUpdateDelay: {
    __name: 'EXTENSION_UPDATE_DELAY',
    __format: 'json'
  },
  compatODS: {
    __name: 'COMPAT_ODS',
    __format: 'json'
  }
}
