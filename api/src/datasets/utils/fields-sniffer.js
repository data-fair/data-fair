import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import moment from 'moment-timezone'
import config from '#config'
import slug from 'slugify'

const ajv = new Ajv()
addFormats(ajv)

export const sniff = (values, attachmentsPaths = [], existingField) => {
  if (!values.length) return { type: 'empty' }

  if (attachmentsPaths && attachmentsPaths.length && checkAll(values, isOneOf, attachmentsPaths, 'Vous avez chargé des pièces jointes, et une colonne semble contenir des chemins vers ces pièces jointes. Mais certaines valeurs sont erronées.')) {
    return { type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
  }
  if (checkAll(values, val => booleanRegexp.test(val))) return { type: 'boolean' }
  if (checkAll(values, checkInteger)) return { type: 'integer' }
  if (checkAll(values, val => !isNaN(formatNumber(trimValue(val))))) return { type: 'number' }
  for (const dateTimeFormat of config.dateTimeFormats) {
    if (checkAll(values, hasDateFormat(dateTimeFormat))) return { type: 'string', format: 'date-time', dateTimeFormat }
  }
  if (checkAll(values, dateTimeSchema)) return { type: 'string', format: 'date-time' }
  for (const dateFormat of config.dateFormats) {
    if (checkAll(values, hasDateFormat(dateFormat))) return { type: 'string', format: 'date', dateFormat }
  }
  if (checkAll(values, dateSchema)) return { type: 'string', format: 'date' }
  if (checkAll(values, val => val.length <= 200)) return { type: 'string' }
  // TODO: detect color codes ?
  // TODO: detect markdown/html format ?
  return { type: 'string', 'x-display': 'textarea' }
}

// underscore is accepted and ignored around numbers and booleans
const trimablePrefix = '(\\s|_)*'

const trimValue = (value) => {
  return value
    .trim()
    .replace(new RegExp(`^${trimablePrefix}`, 'g'), '')
    .replace(new RegExp(`${trimablePrefix}$`, 'g'), '')
}

const formatNumber = (cleanValue) => {
  return Number(cleanValue.replace(/\s/g, '').replace(',', '.'))
}

const checkInteger = (val) => {
  const number = formatNumber(trimValue(val))
  if (isNaN(number)) return false
  return Number.isInteger(number)
}

export const format = (value, prop, fileProp) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') value = JSON.stringify(value)
  value = value.trim()
  if (!value) return null
  if (prop.type === 'string' && prop.format === 'date') {
    const dateFormat = (fileProp && fileProp.dateFormat) || prop.dateFormat
    if (dateFormat) {
      const date = moment(value, dateFormat, true)
      if (date.isValid()) return date.format('YYYY-MM-DD')
    }
  }

  if (prop.type === 'string' && prop.format === 'date-time') {
    const dateTimeFormat = (fileProp && fileProp.dateTimeFormat) || prop.dateTimeFormat
    if (dateTimeFormat) {
      const timeZone = prop.timeZone || config.defaultTimeZone
      const date = moment.tz(value, dateTimeFormat, true, timeZone) // the boolean is for strict mode
      // format will store the timezone info, it is a richer info than always storing with Z suffix
      // when showing the date it is preferred to use moment "parseZone" and show the data in the original time zone
      // instead of moving to the user's time zone
      if (date.isValid()) return date.format()
    } else {
      if (value[10] !== 'T') value = value.substring(0, 10) + 'T' + value.substring(11)
      const isValid = dateTimeSchema(value)
      if (!isValid) {
        const date = moment.tz(value, null, true, prop.timeZone || config.defaultTimeZone)
        value = date.format()
      }
    }
  }
  if (prop.type === 'string') return value
  const cleanValue = trimValue(value)
  if (!cleanValue) return null
  if (prop.type === 'boolean') return ['1', 'true', 'vrai', 'oui', 'yes'].includes(cleanValue.toLowerCase())
  if (prop.type === 'integer' || prop.type === 'number') return formatNumber(cleanValue)
}

// WARNING: this code is duplicated in public/assets/dataset-utils.js
export const escapeKey = (key, dataset) => {
  const algorithm = dataset?.analysis?.escapeKeyAlgorithm
  if (algorithm === 'legacy') {
    key = key.replace(/\.|\s|\$|;|,|:|!/g, '_').replace(/"/g, '')
    // prefixing by _ is reserved to fields calculated by data-fair
    while (key.startsWith('_')) {
      key = key.slice(1)
    }
    return key
  } else {
    return slug(key, { lower: true, strict: true, replacement: '_' })
  }
}

function checkAll (values, check, param, throwIfAlmost) {
  const definedValues = values
    .filter(v => !!v)
    .map(v => v.trim())
    .filter(v => !!v)

  if (!definedValues.length) return false
  const invalidValues = []
  const validValues = []
  for (const value of definedValues) {
    if (check(value, param)) {
      validValues.push(value)
    } else {
      invalidValues.push(value)
    }
  }
  if (throwIfAlmost) {
    if (invalidValues.length && invalidValues.length <= (definedValues.length / 2)) {
      const invalidValuesMsg = invalidValues.slice(0, 3).join(', ') + (invalidValues.length > 3 ? '...' : '.')
      const validValuesMsg = validValues.slice(0, 3).join(', ') + (validValues.length > 3 ? '...' : '.')
      throw new Error(`${throwIfAlmost}
Valeurs invalides : ${invalidValuesMsg}
Valeurs valides : ${validValuesMsg}
`)
    }
  }
  return !invalidValues.length
}

const isOneOf = (value, values) => values.includes(value)
// const isBoolean = (value) => ['0', '1', '-1', 'true', 'false'].indexOf(value.toLowerCase()) !== -1
const booleanRegexp = new RegExp(`^${trimablePrefix}(0|1|-1|true|false|vrai|faux|oui|non|yes|no)${trimablePrefix}$`, 'i')
const dateTimeSchema = ajv.compile({ type: 'string', format: 'date-time' })
const dateSchema = ajv.compile({ type: 'string', format: 'date' })
const hasDateFormat = (format) => (value) => moment(value, format, true).isValid()
