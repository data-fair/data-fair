import Vue from 'vue'

Vue.filter('displayBytes', function (aSize, locale = 'fr') {
  aSize = Math.abs(parseInt(aSize, 10))
  if (aSize === 0) return '0 octets'
  const def = {
    fr: [[1, 'octets'], [1000, 'ko'], [1000 * 1000, 'Mo'], [1000 * 1000 * 1000, 'Go'], [1000 * 1000 * 1000 * 1000, 'To'], [1000 * 1000 * 1000 * 1000 * 1000, 'Po']],
    en: [[1, 'bytes'], [1000, 'kb'], [1000 * 1000, 'Mb'], [1000 * 1000 * 1000, 'Gb'], [1000 * 1000 * 1000 * 1000, 'Tb'], [1000 * 1000 * 1000 * 1000 * 1000, 'Pb']],
  }[locale]
  for (var i = 0; i < def.length; i++) {
    if (aSize < def[i][0]) return (aSize / def[i - 1][0]).toLocaleString(locale, { maximumFractionDigits: 0 }) + ' ' + def[i - 1][1]
  }
})
