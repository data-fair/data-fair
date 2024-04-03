const { Parser } = require('expr-eval')
const md5 = require('md5')

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
  if (typeof arg !== 'string') return arg
  if (typeof separator !== 'string') return arg
  return arg.split(separator)
}

parser.functions.JOIN = function (arg, separator = ',') {
  if (!Array.isArray(arg)) return arg
  if (typeof separator !== 'string') return arg
  return arg.join(separator)
}

exports.parser = parser
