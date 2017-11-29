const Ajv = require('ajv')
const ajv = new Ajv()

exports.sniff = (values) => {
  if (checkAll(values, isBoolean)) return {type: 'boolean'}
  if (checkAll(values, val => intRegexp.test(val))) return {type: 'integer'}
  if (checkAll(values, val => floatRegexp.test(val))) return {type: 'number'}
  if (checkAll(values, dateTimeSchema)) return {type: 'string', format: 'date-time'}
  if (checkAll(values, dateSchema)) return {type: 'string', format: 'date'}
  if (checkAll(values, uriRefSchema)) return {type: 'string', format: 'uri-reference'}
  return {type: 'string'}
}

exports.format = (value, prop) => {
  if (prop.type === 'string') return value
  if (!value) return null
  if (prop.type === 'boolean') return value === '1' || value.toLowerCase() === 'true'
  if (prop.type === 'integer' || prop.type === 'number') return value ? Number(value) : null
}

function checkAll(values, check) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] && !check(values[i])) {
      return false
    }
  }
  return true
}

const isBoolean = (value) => ['0', '1', '-1', 'true', 'false'].indexOf(value.toLowerCase()) !== -1
const intRegexp = /^(-|\+)?[0-9]+$/
const floatRegexp = /^(-|\+)?([0-9]+(\.[0-9]+)?)$/
const dateTimeSchema = ajv.compile({'type': 'string', 'format': 'date-time'})
const dateSchema = ajv.compile({'type': 'string', 'format': 'date'})
const uriRefSchema = ajv.compile({'type': 'string', 'format': 'uri-reference'})
