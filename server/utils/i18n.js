const config = require('config')
const acceptLangParser = require('accept-language-parser')

const fr = require('../resources/messages-fr.json')
const messages = {
  fr,
  en: { ...fr, ...require('../resources/messages-en.json') },
}

exports.middleware = (req, res, next) => {
  const locales = acceptLangParser.parse(req.get('Accept-Language'))
  const localeCode = req.cookies.i18n_lang || (locales && locales[0] && locales[0].code) || config.i18n.defaultLocale
  req.locale = localeCode
  req.messages = messages[localeCode] || messages.fr
  next()
}
