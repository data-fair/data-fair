const { Writable } = require('stream')
const csv = require('csv-parser')
const pump = require('util').promisify(require('pump'))
const debug = require('debug')('csv-sniffer')

const possibleLinesDelimiters = ['\r\n', '\n']
const possibleFieldsDelimiters = [',', ';', '\t', '|']
// const possibleEscapeChars = ['"', "'"]
const possibleQuoteChars = ['"', "'"]

exports.sniff = async (sample) => {
  // the parameters combination with the most successfully extracted values is probably the best one
  const combinations = []
  for (const ld of possibleLinesDelimiters) {
    for (const fd of possibleFieldsDelimiters) {
      for (const qc of possibleQuoteChars) {
        let score = 0
        let labels
        const parserOpts = { separator: fd, quote: qc, escape: qc, newline: ld }
        debug('Evaluate parser opts', JSON.stringify(parserOpts))
        const parser = csv(parserOpts)
        parser.on('headers', headers => { labels = headers })

        const checkChunk = (chunk) => {
          // console.log(chunk)

          Object.keys(chunk).forEach(key => {
            // none matching labels and object keys means a failure of csv-parse to parse a line
            if (!labels.includes(key)) {
              score -= 10
              debug('Unmatched object key, score -= 10')
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
              /* if (val.includes('\n')) {
                // if the value contains line breaks quoting was probably good, and we need to compensate for having potentially less lines
                const lineBreaksBoost = val.split('\n').length * 0.5
                debug('Value contains linebreaks, score += ' + lineBreaksBoost)
                score += lineBreaksBoost
              } else {
                // having many none empty values is a good sign
                // debug('Filled value, score += 1')
                score += 1
              } */
              score += 1

              // value is prefixed/suffixed with a potential quote, probably missed it
              if (possibleQuoteChars.includes(val[0])) {
                debug('Starting with potential quote char, score -= 2', val.slice(0, 10))
                score -= 2
              }
              if (possibleQuoteChars.includes(val[val.length - 1])) {
                debug('Ending with potential quote char, score -= 2', val.slice(val.length - 10, val.length))
                score -= 2
              }
            }
          })
        }

        let previousChunk
        let i = 0
        const parsePromise = pump(parser, new Writable({
          objectMode: true,
          write (chunk, encoding, callback) {
            i++
            if (i > 1000) return callback()
            if (previousChunk) checkChunk(previousChunk)
            previousChunk = chunk
            callback()
          }
        }))
        parser.write(sample)
        parser.end()
        await parsePromise

        // on larger files prevent checking last chunk as it might be broken by the sampling method
        if (i < 10 && previousChunk) checkChunk(previousChunk)
        debug('score', score)
        combinations.push({ props: { fieldsDelimiter: fd, quote: qc, escapeChar: qc, linesDelimiter: ld, labels }, score })
      }
    }
  }
  const bestCombination = combinations.sort((a, b) => b.score - a.score)[0]
  debug(combinations)
  const result = bestCombination.props
  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')

  return result
}
