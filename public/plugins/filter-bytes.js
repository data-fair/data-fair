import Vue from 'vue'
const NumberAbbreviate = require('number-abbreviate')

const numberAbbreviate = new NumberAbbreviate(['k', 'M', 'G', 'T'])

Vue.filter('bytes', function (bytes, locale = 'fr') {
  const suffix = { fr: 'o', en: 'b' }[locale] || 'o'
  return numberAbbreviate.abbreviate(bytes, 1) + suffix
})
