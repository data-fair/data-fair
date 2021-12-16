module.exports = {
  port: 4657,
  publicUrl: 'http://localhost:4657',
  wsPublicUrl: 'ws://localhost:4657',
  dataDir: './data/test',
  brand: {
    embed: '<div>application embed</div>',
  },
  defaultLimits: {
    totalStorage: 200000,
    datasetStorage: 160000,
    remoteServiceRate: {
      duration: 1,
      nb: 10,
      kb: 50,
    },
    apiRate: {
      anonymous: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 100000,
          static: 200000,
        },
      },
      user: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 200000,
          static: 400000,
        },
      },
    },
  },
  worker: {
    interval: 100,
    inactiveInterval: 0,
    releaseInterval: 0,
    concurrency: 1,
    spawnTask: false,
  },
  locks: {
    // in seconds
    ttl: 0.1,
  },
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: 'test_default_key',
  },
  remoteTimeout: 500,
  secretKeys: {
    identities: 'identities-test-key',
    limits: 'limits-test-key',
  },
  nuxtBuild: {
    active: false,
  },
  applications: [{
    url: 'http://monapp1.com',
    public: true,
  }, {
    url: 'http://monapp2.com',
  }],
  remoteServices: [{
    title: 'Geocoder',
    url: 'http://test.com/geocoder/api-docs.json',
  }, {
    title: 'Sirene',
    url: 'http://test.com/sirene/api-docs.json',
  }],
  tippecanoe: {
    skip: false,
    minFeatures: 2,
    docker: true,
  },
}
