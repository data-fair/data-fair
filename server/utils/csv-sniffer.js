const { Writable } = require('stream')
const csv = require('csv-parser')
const pump = require('util').promisify(require('pump'))

const possibleLinesDelimiters = ['\r\n', '\n\r', '\n', '\r']
const possibleFieldsDelimiters = [',', ';', '\t', '|']
const possibleEscapeChars = ['"', "'"]

exports.sniff = async (sample) => {
  const result = {}

  // best line delimiter is simply the most frequent one, longer ones in priority
  result.linesDelimiter = possibleLinesDelimiters
    .map(d => ({ d, count: (sample.match(new RegExp(d, 'g')) || []).length }))
    .reduce((a, item) => a && a.count >= item.count ? a : item, null)
    .d

  const lines = sample.split(result.linesDelimiter)
  lines.pop() // last line is probably incomplete

  // the parameters combination with the most successfully extracted values is probably the best one
  const combinations = []
  for (const fd of possibleFieldsDelimiters) {
    for (const ec of possibleEscapeChars) {
      let nbValues = 0
      const parser = csv({ separator: fd, quote: ec, newline: result.linesDelimiter })
      const parsePromise = pump(parser, new Writable({
        objectMode: true,
        write(chunk, encoding, callback) {
          if (!result.labels) result.labels = Object.keys(chunk)
          nbValues += Object.keys(chunk).filter(key => !!chunk[key]).length
          callback()
        }
      }))
      parser.write(sample)
      parser.end()
      await parsePromise
      combinations.push({ props: { fieldsDelimiter: fd, escapeChar: ec }, nbValues })
    }
  }

  const bestCombination = combinations.sort((a, b) => b.nbValues - a.nbValues)[0]

  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')

  return { ...result, ...bestCombination.props }
}
