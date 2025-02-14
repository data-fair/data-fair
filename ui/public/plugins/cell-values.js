import Vue from 'vue'
const truncateMiddle = require('truncate-middle')
const moment = require('moment')
require('moment/locale/fr')

Vue.filter('cellValues', function (values, property, truncate = 50) {
  if (values === undefined || values === null) return ''
  if (!Array.isArray(values)) values = [values]
  return values.map(value => {
    if (value === undefined || value === null) return ''
    if (property['x-labels'] && property['x-labels']['' + value]) return property['x-labels']['' + value]
    if (property.format === 'date-time') {
      if (value.endsWith('Z')) return moment(value).format('lll')
      // we use parseZone to show the data in the originally stored timezone
      return moment.parseZone(value).format('lll')
    }
    if (property.format === 'date') return moment(value).format('L')
    if (property.type === 'boolean') {
      if (typeof value === 'string') return value === 'true' ? 'oui' : 'non'
      return value ? 'oui' : 'non'
    }
    if (property.type === 'number' || property.type === 'integer') return value.toLocaleString()
    return truncateMiddle(value + '', truncate, 0, '...')
  }).join(', ')
})
