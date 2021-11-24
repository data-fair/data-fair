const i18n = require('i18n')

i18n.configure({
  defaultLocale: 'fr',
  directory: require('path').join(__dirname, '../../server/i18n'),
  cookie: 'i18n_lang',
  objectNotation: true,
})

exports.middleware = i18n.init
