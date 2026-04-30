import Vue from 'vue'
const NumberAbbreviate = require('number-abbreviate')

const numberAbbreviate = new NumberAbbreviate([' k', ' M', ' G', ' T'])

Vue.filter('bytes', function (bytes, locale = 'fr') {
  const suffix = bytes > 1000 ? ({ fr: 'o', en: 'b' }[locale] || 'o') : ' octets'
  return numberAbbreviate.abbreviate(bytes, 1) + suffix
})
