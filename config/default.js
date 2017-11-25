module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5601',
  directoryUrl: 'https://staging.koumoul.com',
  dataDir: './data',
  mongoUrl: 'mongodb://localhost:27017/accessible-data-' + (process.env.NODE_ENV || 'development')
}
