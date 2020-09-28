const { Writable } = require('stream')
const csv = require('csv-parser')
const pump = require('util').promisify(require('pump'))
const debug = require('debug')('csv-sniffer')

const possibleLinesDelimiters = ['\r\n', '\n']
const possibleFieldsDelimiters = [',', ';', '\t', '|']
const possibleEscapeChars = ['"', "'"]
const possibleQuoteChars = ['"', "'"]

exports.sniff = async (sample) => {
  // the parameters combination with the most successfully extracted values is probably the best one
  const combinations = []
  for (const ld of possibleLinesDelimiters) {
    const lines = sample.split(ld).filter(l => !!l).slice(0, 10)
    for (const fd of possibleFieldsDelimiters) {
      for (const ec of possibleEscapeChars) {
        for (const qc of possibleQuoteChars) {
          let score = 0
          let labels
          const parserOpts = { separator: fd, quote: qc, escape: ec, newline: ld }
          debug('Evaluate parser opts', JSON.stringify(parserOpts))
          const parser = csv(parserOpts)
          parser.on('headers', headers => { labels = headers })
          const parsePromise = pump(parser, new Writable({
            objectMode: true,
            write(chunk, encoding, callback) {
              Object.keys(chunk).forEach(key => {
                // none matching labels and object keys means a failure of csv-parse to parse a line
                if (!labels.includes(key)) {
                  score -= 2
                  debug('Unmatched object key, score -= 2')
                }
              })
              labels.forEach(key => {
                const val = chunk[key]
                // console.log(key, chunk[key])
                if (val === undefined) {
                  // This is not necessarily a bad thing it seems
                  // maybe undefined at the end of a line is not as bad (it seems that csv-stringify doesn't complete the trailing commas)
                  // debug('Undefined property, score -= 0.1')
                  // score -= 0.1
                } else if (val) {
                  // having many none empty values is a good sign
                  debug('Filled value, score += 1')
                  score += 1

                  // value is prefixed/suffixed with a potential separator, probably missed it
                  if (possibleQuoteChars.includes(val[0])) {
                    debug('Starting with potential quote char, score -= 1')
                    score -= 1
                  }
                  if (possibleQuoteChars.includes(val[val.length - 1])) {
                    debug('Starting with potential quote char, score -= 1')
                    score -= 1
                  }
                }
              })
              callback()
            },
          }))
          parser.write(lines.join(ld))
          parser.end()
          await parsePromise
          combinations.push({ props: { fieldsDelimiter: fd, quote: qc, escapeChar: ec, linesDelimiter: ld, labels }, score })
        }
      }
    }
  }
  const bestCombination = combinations.sort((a, b) => b.score - a.score)[0]
  debug(combinations)
  const result = bestCombination.props
  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')

  return result
}
