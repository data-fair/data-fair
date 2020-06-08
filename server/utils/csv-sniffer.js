const { Writable } = require('stream')
const csv = require('csv-parser')
const pump = require('util').promisify(require('pump'))

const possibleLinesDelimiters = [{ d: '\r\n', regexp: /\r\n/g }, { d: '\n', regexp: /[^\r]\n/g }]
const possibleFieldsDelimiters = [',', ';', '\t', '|']
const possibleEscapeChars = ['"', "'"]
const possibleQuoteChars = ['"', "'"]

exports.sniff = async (sample) => {
  const result = {}

  // best line delimiter is simply the most frequent one, longer ones in priority
  result.linesDelimiter = possibleLinesDelimiters
    .map(sep => ({ d: sep.d, count: (sample.match(sep.regexp) || []).length }))
    .reduce((a, item) => a && a.count >= item.count ? a : item, null)
    .d

  const lines = sample.split(result.linesDelimiter).filter(l => !!l).slice(0, 10)

  // the parameters combination with the most successfully extracted values is probably the best one
  const combinations = []
  for (const fd of possibleFieldsDelimiters) {
    for (const ec of possibleEscapeChars) {
      for (const qc of possibleQuoteChars) {
        let score = 0
        let labels
        const parser = csv({ separator: fd, quote: qc, escape: ec, newline: result.linesDelimiter })
        parser.on('headers', headers => {
          labels = headers
        })
        const parsePromise = pump(parser, new Writable({
          objectMode: true,
          write(chunk, encoding, callback) {
            Object.keys(chunk).forEach(key => {
              if (chunk[key]) score += 1
              else if (chunk[key] === undefined) score -= 1
            })
            callback()
          },
        }))
        parser.write(lines.join(result.linesDelimiter))
        parser.end()
        await parsePromise
        combinations.push({ props: { fieldsDelimiter: fd, quote: qc, escapeChar: ec, labels }, score })
      }
    }
  }

  const bestCombination = combinations.sort((a, b) => b.score - a.score)[0]
  Object.assign(result, bestCombination.props)
  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')

  return result
}
