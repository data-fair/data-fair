const { Parser } = require('expr-eval')
const md5 = require('md5')
const dayjs = require('dayjs')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const timezone = require('dayjs/plugin/timezone')
const utc = require('dayjs/plugin/utc')
const { ajv, errorsText, localize } = require('./ajv')
const { cleanJsonSchemaProperty } = require('./schema')

dayjs.extend(customParseFormat)
dayjs.extend(timezone)
dayjs.extend(utc)

/**
 *
 * @param {string} defaultTimezone
 * @returns
 */
module.exports = (defaultTimezone) => {
  const parser = new Parser({
    //  Useless in our use case
    //  mathematical
    add: true,
    concatenate: true,
    divide: true,
    factorial: true,
    multiply: true,
    power: true,
    remainer: true,
    substract: true,

    //  programatic, allowed so that function definition is possible
    assignment: true,

    //  logical
    logical: true,
    comparison: true,
    in: true
  })

  parser.functions.CONCAT = parser.functions.CONCATENATE = function () {
    let result = ''
    for (let i = 0; i < arguments.length; i++) {
      result += arguments[i] ?? ''
    }
    return result
  }

  parser.functions.UPPER = function (arg) {
    if (typeof arg !== 'string') return arg
    return arg.toUpperCase()
  }

  parser.functions.LOWER = function (arg) {
    if (typeof arg !== 'string') return arg
    return arg.toLowerCase()
  }

  parser.functions.TRIM = function (arg) {
    if (typeof arg !== 'string') return arg
    return arg.trim().replace(/\W+/g, ' ')
  }

  /** parser.functions.SPLIT = parser.functions.TEXTSPLIT = function (arg, separator) {
    if (typeof arg !== 'string') return arg
    return arg.split(separator)
  } */

  parser.functions.SUBSTRING = function (arg, start, length) {
    if (typeof arg !== 'string') return arg
    let res = arg.substring(start)
    if (length !== undefined && length !== null) res = res.substring(0, length)
    return res
  }

  parser.functions.REPLACE = function (arg, search, replace) {
    if (typeof arg !== 'string') return arg
    let res = arg
    while (res.includes(search)) {
      res = res.replace(search, replace)
    }
    return res
  }

  parser.functions.EXTRACT = function (arg, before, after) {
    if (typeof arg !== 'string') return arg
    let start = 0
    if (before) {
      start = arg.indexOf(before)
      if (start === -1) return undefined
      start += before.length
    }
    let end = arg.length
    if (after) {
      end = arg.indexOf(after, start + before.length)
      if (end === -1) return undefined
    }
    return arg.substring(start, end)
  }

  parser.functions.SUM = function () {
    let result = 0
    for (let i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] === 'number') result += arguments[i]
    }
    return result
  }

  parser.functions.AVG = parser.functions.AVERAGE = function () {
    let sum = 0
    let nbValues = 0
    for (let i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] === 'number') {
        sum += arguments[i]
        nbValues += 1
      }
    }
    if (nbValues === 0) return undefined
    return sum / nbValues
  }

  parser.functions.STRPOS = function (arg, search) {
    if (typeof arg !== 'string') return -1
    if (typeof search !== 'string') return -1
    return arg.indexOf(search)
  }

  parser.functions.MD5 = function () {
    const args = Array.from(arguments)
    if (args.length === 1 && typeof args[0] === 'string') return md5(args[0])
    return md5(JSON.stringify(args).slice(1, -1))
  }

  parser.functions.SPLIT = function (arg, separator) {
    if (arg === null || arg === undefined) return []
    if (typeof arg !== 'string') return arg
    if (typeof separator !== 'string') return arg
    return arg.split(separator)
  }

  parser.functions.JOIN = function (arg, separator = ',') {
    if (!Array.isArray(arg)) return arg
    if (typeof separator !== 'string') return arg
    return arg.join(separator)
  }

  parser.functions.TRANSFORM_DATE = function (arg, inputFormat = '', outputFormat = '', inputTimeZone = '', outputTimeZone = '') {
    if (!['string', 'number'].includes(typeof arg)) return arg
    if (typeof inputFormat !== 'string') return arg
    if (typeof outputFormat !== 'string') return arg

    inputTimeZone = inputTimeZone || defaultTimezone
    outputTimeZone = outputTimeZone || defaultTimezone

    let date
    if (inputFormat === 'X') date = dayjs.unix(arg)
    else if (inputFormat === 'x') date = dayjs(arg)
    else if (inputFormat) date = dayjs.tz(arg, inputFormat, inputTimeZone)
    else date = dayjs(arg)

    if (outputFormat === 'X') return date.unix()
    if (outputFormat === 'x') return date.valueOf()
    date = date.tz(outputTimeZone)
    return date.format(outputFormat)
  }

  return {
    parser,
    /**
     * @param {string} expr
     * @param {any} property
     * @param {string} locale
     */
    compile: (expr, property, locale = 'fr') => {
      const parsedExpression = parser.parse(expr)

      const propertySchema = cleanJsonSchemaProperty(property)
      /** @type {any} */
      const schema = {
        type: 'object',
        properties: {
          [property.key]: property.separator ? { type: 'array', items: propertySchema } : propertySchema
        }
      }
      if (property['x-required']) schema.required = [property.key]
      const validate = ajv.compile(schema)

      /**
       * @param {any} data
       */
      return (data) => {
        let result = parsedExpression.evaluate(data)
        if (property.separator && typeof result === 'string') {
          result = result.split(property.separator)
        }
        if (property.separator && Array.isArray(result)) {
          result = result.map(value => fixValue(value, property))
        } else {
          result = fixValue(result, property)
        }

        /** @type {any} */
        const validateData = {}
        if (result !== null && result !== undefined) validateData[property.key] = result
        if (!validate(validateData)) {
          (localize[locale] || localize.fr)(validate.errors)
          let message = errorsText(validate.errors)
          if (result !== undefined) message += ` (résultat : ${JSON.stringify(result)})`
          throw new Error(message)
        }

        if (property.separator && Array.isArray(result)) {
          return result.join(property.separator)
        } else {
          return result
        }
      }
    }
  }
}

/**
 * @param {any} value
 * @param {any} property
 * @returns {any}
 */
const fixValue = (value, property) => {
  if (value === null || value === undefined) return null
  if (property.type === 'string' && ['boolean', 'number'].includes(typeof value)) {
    return value + ''
  }
  if (property.type === 'boolean') return !!(value)
  if (property.type === 'string') value = '' + value
  if (['number', 'integer'].includes(property.type)) {
    const numberValue = Number(value)
    if (isNaN(numberValue)) return value
    if (property.type === 'integer') return Math.round(numberValue)
    return numberValue
  }
  return value
}
