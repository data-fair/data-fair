module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5601',
  directoryUrl: 'http://localhost:5700',
  dataDir: './data/' + (process.env.NODE_ENV || 'development'),
  mongoUrl: 'mongodb://localhost:27017/accessible-data-' + (process.env.NODE_ENV || 'development'),
  elasticsearch: {
    host: 'localhost:9200'
  },
  indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    }
  },
  defaultLimits: {
    // Maximum storage space per user or organization
    // -1 for unlimited storage
    totalStorage: -1,
    // Maximum storage space for 1 dataset
    datasetStorage: -1
  },
  headers: {
    storedBytesLimit: 'X-TaxMan-RateLimit'
  }
}
