import { Parser } from 'expr-eval'
import md5 from 'md5'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { ajv, errorsText, localize } from './ajv.js'
import { cleanJsonSchemaProperty } from './schema.js'
import slug from 'slugify'

dayjs.extend(customParseFormat)
dayjs.extend(timezone)
dayjs.extend(utc)

/**
 *
 * @param {string} defaultTimezone
 * @returns
 */
export default (defaultTimezone) => {
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

  parser.functions.TITLE = function (arg) {
    if (typeof arg !== 'string') return arg
    // cf https://stackoverflow.com/a/196991/10132434
    return arg.replace(
      /\w\S*/g,
      text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    )
  }

  parser.functions.PHRASE = function (arg) {
    if (typeof arg !== 'string') return arg
    return arg.charAt(0).toUpperCase() + arg.substring(1).toLowerCase()
  }

  parser.functions.PAD_LEFT = function (arg, length, pad) {
    if (typeof arg !== 'string') arg = '' + arg
    if (typeof pad !== 'string') pad = '' + pad
    return arg.padStart(length, pad)
  }

  parser.functions.PAD_RIGHT = function (arg, length, pad) {
    if (typeof arg !== 'string') arg = '' + arg
    if (typeof pad !== 'string') pad = '' + pad
    return arg.padEnd(length, pad)
  }

  parser.functions.SUBSTRING = function (arg, start, length) {
    if (typeof arg !== 'string') return arg
    let res = arg.substring(start)
    if (length !== undefined && length !== null) res = res.substring(0, length)
    return res
  }

  parser.functions.REPLACE = function (arg, search, replace) {
    if (typeof arg !== 'string') return arg
    return arg.replaceAll(search, replace)
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

  parser.functions.SLUG = function (arg, replacement = '-') {
    if (typeof arg !== 'string') arg = '' + arg
    return slug.default(arg, { lower: true, strict: true, replacement })
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

  parser.functions.TRUTHY = function (arg) {
    return !!arg
  }

  parser.functions.DEFINED = function (arg) {
    return arg !== undefined && arg !== null
  }

  parser.functions.JSON_PARSE = function (arg) {
    if (typeof arg !== 'string') return arg
    if (!arg) return undefined
    return JSON.parse(arg)
  }

  parser.functions.GET = function (arg, key, def) {
    if (typeof arg !== 'object') return arg
    return arg[key] ?? def
  }

  return {
    parser,
    check: (expr, schema, fullSchema) => {
      try {
        const parsedExpression = parser.parse(expr)
        const variables = parsedExpression.variables({ withMembers: true })
        for (const variable of variables) {
          if (!schema.find(p => p.key === variable)) {
            const altProp = schema.find(p => p['x-originalName'] === variable || p.title === variable)
            if (altProp) return `la clé de la colonne ${variable} est ${altProp.key}`
            const extProp = fullSchema.find(p => p.key === variable || p['x-originalName'] === variable || p.title === variable)
            if (extProp) return `la colonne ${variable} est définie par une extension qui est appliquée après cette expression`
            // we cannot fail here because variables() also returns locally defined functions
            // we rely on eval time errors in this case
            // return `colonne ${variable} inconnue`
          }
        }
      } catch (err) {
        return err.message
      }
    },
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
          [property.key]: propertySchema
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
          result = result.split(property.separator.trim()).map(part => part.trim())
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
  if (property.type === 'string') {
    value = '' + value
    if (property.format === 'date-time' && value.length > 10 && value[10] !== 'T') {
      value = value.substring(0, 10) + 'T' + value.substring(11)
    }
  }
  if (['number', 'integer'].includes(property.type)) {
    const numberValue = Number(value)
    if (isNaN(numberValue)) return value
    if (property.type === 'integer') return Math.round(numberValue)
    return numberValue
  }
  return value
}
