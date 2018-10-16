const config = require('config')
const flatten = require('flat')
const unflatten = flatten.unflatten
const acceptLangParser = require('accept-language-parser')
const flatOpts = { delimiter: '_' }

exports.locales = config.i18n.locales.map(l => {
  if (typeof l === 'string') return { code: l }
  else return l
})

// Build a map of messages of this form
// {fr: {msg1: 'libellé 1'}, en: {msg1: 'label 1'}}
const messages = {}
exports.locales.forEach(l => {
  messages[l.code] = require('./' + l.code)
})

const flatMessages = flatten(messages, flatOpts)

// Manage overriding by environment variables of this form
// 'I18N_en_msg1="another label"'
Object.keys(process.env).forEach(k => {
  if (k.startsWith('I18N_')) {
    flatMessages[k.replace('I18N_', '')] = process.env[k]
  }
})

exports.messages = unflatten(flatMessages, flatOpts)

// A subset of messages for UI separated for performance.
// exports.publicMessages = unflatten(
//   Object.keys(flatMessages)
//     .filter(k => ['common', 'pages', 'doc'].includes(k.split('_')[1]))
//     .reduce((a, k) => { a[k] = flatMessages[k]; return a }, {})
//   , flatOpts)

exports.middleware = (req, res, next) => {
  const locales = acceptLangParser.parse(req.get('Accept-Language'))
  const localeCode = (locales && locales[0] && locales[0].code) || config.i18n.defaultLocale
  req.messages = exports.messages[localeCode] || exports.messages[config.i18n.defaultLocale]
  next()
}
