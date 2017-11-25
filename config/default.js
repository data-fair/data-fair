module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5601',
  directoryUrl: 'http://localhost:5700',
  dataDir: './data',
  mongoUrl: 'mongodb://localhost:27017/accessible-data-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    }
  }
}
