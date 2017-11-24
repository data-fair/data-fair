module.exports = {
  port: 5600,
  baseUrl: 'http://localhost:5601',
  koumoulUrl: 'https://staging.koumoul.com',
  koumoulKid: 'koumoul-staging',
  dataDir: './data',
  mongoUrl: 'mongodb://localhost:27017/accessible-data-' + (process.env.NODE_ENV || 'development')
}
