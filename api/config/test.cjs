if (!process.env.WORKTREE) throw new Error('missing WORKTREE env variable, use "source dev/env.sh" to load env vars')

module.exports = {
  port: process.env.DEV_API_PORT,
  mongo: {
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-test`,
    maxBulkOps: 100
  },
  elasticsearch: {
    host: `localhost:${process.env.ES_PORT}`,
    acceptYellowStatus: true,
    singleLineOpRefresh: true
  },
  publicUrl: `http://localhost:${process.env.NGINX_PORT1}/data-fair`,
  wsPublicUrl: `ws://localhost:${process.env.NGINX_PORT1}/data-fair`,
  s3: {
    region: 'us-east-1',
    endpoint: `http://localhost:${process.env.S3_PORT}`,
    bucket: 'buckettest',
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    forcePathStyle: true
  },
  directoryUrl: `http://localhost:${process.env.NGINX_PORT1}/simple-directory`,
  privateDirectoryUrl: `http://localhost:${process.env.SD_PORT}`,
  captureUrl: `http://localhost:${process.env.NGINX_PORT1}/capture`,
  privateCaptureUrl: `http://localhost:${process.env.CAPTURE_PORT}`,
  dataDir: './data/test',
  tmpDir: './data/test-tmp',
  workerTmpDir: './data/test-worker-tmp',
  brand: {
    embed: '<div>application embed</div>'
  },
  defaultLimits: {
    totalStorage: 200000,
    datasetStorage: 160000,
    nbDatasets: 20,
    remoteServiceRate: {
      duration: 1,
      nb: 10,
      kb: 50
    },
    apiRate: {
      anonymous: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 100000,
          static: 200000
        }
      },
      user: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 200000,
          static: 400000
        }
      },
      postApplicationKey: {
        duration: 60,
        nb: 1
      },
      appCaptures: {
        duration: 60,
        nb: 10
      }
    }
  },
  worker: {
    interval: 500,
    baseConcurrency: 1,
    errorRetryDelay: 0,
    closeTimeout: 1
  },
  locks: {
    // in seconds
    ttl: 1
  },
  datasetStateRetries: {
    interval: 1,
    nb: 1
  },
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: 'test_default_key'
  },
  remoteTimeout: 500,
  secretKeys: {
    identities: 'identities-test-key',
    limits: 'limits-test-key'
  },
  nuxtBuild: {
    active: false
  },
  applications: [{
    title: 'App test1',
    url: 'http://monapp1.com',
    public: true
  }, {
    title: 'App test2',
    url: 'http://monapp2.com'
  }, {
    title: 'App test3',
    url: 'http://monapp3.com',
    public: true
  }],
  remoteServices: [{
    title: 'Geocoder',
    url: 'http://test.com/geocoder/api-docs.json'
  }, {
    title: 'Sirene',
    url: 'http://test.com/sirene/api-docs.json'
  }],
  observer: {
    port: process.env.DEV_OBSERVER_PORT
  },
  cache: {
    // set cache-control max-age for public GET endpoints (in seconds)
    publicMaxAge: 1
  },
  clamav: {
    active: true,
    dataDir: '/data/data-fair/test',
    port: process.env.CLAMAV_PORT,
  },
  assertImmutable: true,
  remoteAttachmentCacheDuration: 1000,
  compatODS: true
}
