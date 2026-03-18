import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import moment from 'moment-timezone'
import slug from 'slugify'
import compatOdsEscapeKey from '../../api-compat/ods/escape-key.ts'

const ajv = new Ajv()
addFormats(ajv)

export interface SniffDateConfig {
  dateTimeFormats: string[]
  dateFormats: string[]
}

export interface FormatDateConfig {
  defaultTimeZone: string
}

// underscore is accepted and ignored around numbers and booleans
const trimablePrefix = '(\\s|_)*'

const trimValue = (value: string): string => {
  return value
    .trim()
    .replace(new RegExp(`^${trimablePrefix}`, 'g'), '')
    .replace(new RegExp(`${trimablePrefix}$`, 'g'), '')
}

const formatNumber = (cleanValue: string): number => {
  return Number(cleanValue.replace(/\s/g, '').replace(',', '.'))
}

const checkInteger = (val: string): boolean => {
  const number = formatNumber(trimValue(val))
  if (isNaN(number)) return false
  return Number.isInteger(number)
}

const isOneOf = (value: string, values: string[]): boolean => values.includes(value)
const booleanRegexp = new RegExp(`^${trimablePrefix}(0|1|-1|true|false|vrai|faux|oui|non|yes|no)${trimablePrefix}$`, 'i')
const dateTimeSchema = ajv.compile({ type: 'string', format: 'date-time' })
const dateSchema = ajv.compile({ type: 'string', format: 'date' })
const hasDateFormat = (format: string) => (value: string): boolean => moment(value, format, true).isValid()

function checkAll (values: string[], check: (val: string, param?: any) => boolean, param?: any, throwIfAlmost?: string): boolean {
  const definedValues = values
    .filter(v => !!v)
    .map(v => v.trim())
    .filter(v => !!v)

  if (!definedValues.length) return false
  const invalidValues: string[] = []
  const validValues: string[] = []
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

const defaultSniffDateConfig: SniffDateConfig = {
  dateTimeFormats: [
    'D/M/YYYY H:m',
    'D/M/YY H:m',
    'D/M/YYYY, H:m',
    'D/M/YY, H:m',
    'D/M/YYYY H:m:s',
    'D/M/YY H:m:s',
    'D/M/YYYY, H:m:s',
    'D/M/YY, H:m:s',
    'YYYY-MM-DDTHH:mm:ss',
    'YYYY-MM-DD HH:mm:ss'
  ],
  dateFormats: [
    'D/M/YYYY',
    'D/M/YY',
    'YYYY/M/D'
  ]
}

export const sniff = (values: string[], attachmentsPaths: string[] = [], existingField?: any, dateConfig?: SniffDateConfig): any => {
  if (!values.length) return { type: 'empty' }

  const { dateTimeFormats, dateFormats } = dateConfig ?? defaultSniffDateConfig

  if (attachmentsPaths && attachmentsPaths.length && checkAll(values, isOneOf, attachmentsPaths, '[noretry] Vous avez chargé des pièces jointes, et une colonne semble contenir des chemins vers ces pièces jointes. Mais certaines valeurs sont erronées.')) {
    return { type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
  }
  if (checkAll(values, val => booleanRegexp.test(val))) return { type: 'boolean' }
  if (checkAll(values, checkInteger)) return { type: 'integer' }
  if (checkAll(values, val => !isNaN(formatNumber(trimValue(val))))) return { type: 'number' }
  for (const dateTimeFormat of dateTimeFormats) {
    if (checkAll(values, hasDateFormat(dateTimeFormat))) return { type: 'string', format: 'date-time', dateTimeFormat }
  }
  if (checkAll(values, dateTimeSchema)) return { type: 'string', format: 'date-time' }
  for (const dateFormat of dateFormats) {
    if (checkAll(values, hasDateFormat(dateFormat))) return { type: 'string', format: 'date', dateFormat }
  }
  if (checkAll(values, dateSchema)) return { type: 'string', format: 'date' }
  if (checkAll(values, val => val.length <= 200)) return { type: 'string' }
  return { type: 'string', 'x-display': 'textarea' }
}

export const format = (value: any, prop: any, fileProp?: any, ignoreSeparator?: boolean, dateConfig?: FormatDateConfig): any => {
  if (value === null || value === undefined || value === '') return null
  if (!ignoreSeparator && typeof value === 'string' && prop.separator) {
    return value.split(prop.separator.trim())
      .map((part: string) => format(part.trim(), prop, fileProp, true, dateConfig))
      .filter((v: any) => v !== null)
  }
  if (typeof value !== 'string') value = JSON.stringify(value)
  value = value.trim()
  if (!value) return null

  const defaultTimeZone = dateConfig?.defaultTimeZone ?? 'Europe/Paris'

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
      const timeZone = prop.timeZone || defaultTimeZone
      const date = moment.tz(value, dateTimeFormat, true, timeZone)
      if (date.isValid()) return date.format()
    } else {
      if (value[10] !== 'T') value = value.substring(0, 10) + 'T' + value.substring(11)
      const isValid = dateTimeSchema(value)
      if (!isValid) {
        const date = moment.tz(value, null as any, true, prop.timeZone || defaultTimeZone)
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
export const escapeKey = (key: string, algorithm?: string): string => {
  if (algorithm === 'legacy') {
    key = key.replace(/\.|\s|\$|;|,|:|!/g, '_').replace(/"/g, '')
    // prefixing by _ is reserved to fields calculated by data-fair
    while (key.startsWith('_')) {
      key = key.slice(1)
    }
    return key
  } else if (algorithm === 'compat-ods') {
    return compatOdsEscapeKey(key)
  } else {
    return slug(key, { lower: true, strict: true, replacement: '_' })
  }
}
