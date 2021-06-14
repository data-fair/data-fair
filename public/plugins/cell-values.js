import Vue from 'vue'
const truncateMiddle = require('truncate-middle')
const moment = require('moment')
require('moment/locale/fr')

Vue.filter('cellValues', function (values, property) {
  if (values === undefined || values === null) return ''
  if (!Array.isArray(values)) values = [values]
  return values.map(value => {
    if (value === undefined || value === null) return ''
    if (property['x-labels'] && property['x-labels']['' + value]) return property['x-labels']['' + value]
    if (property.format === 'date-time') return moment(value).format('DD/MM/YYYY, HH:mm')
    if (property.format === 'date') return moment(value).format('DD/MM/YYYY')
    if (property.type === 'boolean') {
      if (typeof value === 'string') return value === 'true' ? 'oui' : 'non'
      return value ? 'oui' : 'non'
    }
    return truncateMiddle(value + '', 50, 0, '...')
  }).join(', ')
})
