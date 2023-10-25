const { Parser } = require('expr-eval')

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
  return sum / nbValues
}

exports.parser = parser
