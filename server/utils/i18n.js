const acceptLangParser = require('accept-language-parser')

const fr = require('../resources/messages-fr.json')
const messages = {
  fr,
  en: { ...fr, ...require('../resources/messages-en.json') },
}

exports.middleware = (req, res, next) => {
  const locales = acceptLangParser.parse(req.get('Accept-Language'))
  const localeCode = (locales && locales[0] && locales[0].code) || 'fr'
  req.messages = messages[localeCode] || messages.fr
  next()
}
