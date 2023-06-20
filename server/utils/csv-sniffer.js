const { Writable } = require('stream')
const csv = require('csv-parser')
const escapeStringRegexp = require('escape-string-regexp')
const pump = require('../utils/pipe')
const debug = require('debug')('csv-sniffer')

const possibleLinesDelimiters = ['\r\n', '\n']
// const possibleLinesDelimiters = ['\n']
const possibleFieldsDelimiters = [',', ';', '\t', '|']
// const possibleFieldsDelimiters = [',']
// const possibleEscapeChars = ['"', "'"]
const possibleQuoteChars = ['"', "'"]
// const possibleQuoteChars = ["'"]
// const possibleQuoteChars = ['"']

exports.sniff = async (sample) => {
  const intoStream = (await import('into-stream')).default

  // the parameters combination with the most successfully extracted values is probably the best one
  const combinations = []
  for (const ld of possibleLinesDelimiters) {
    for (const fd of possibleFieldsDelimiters) {
      for (const qc of possibleQuoteChars) {
        const scoreParts = {
          lines: 0,
          values: 0,
          missingLabels: 0,
          trimQuotes: 0,
          headerTrimQuotes: 0,
          lineBreaksBoost: 0,
          fullSepCount: 0
        }
        let labels
        const parserOpts = { separator: fd, quote: qc, escape: qc, newline: ld }
        debug('Evaluate parser opts', JSON.stringify(parserOpts))
        const parser = csv(parserOpts)
        parser.on('headers', headers => {
          // debug('headers', headers)
          for (const header of headers) {
            // header is prefixed/suffixed with a potential quote, probably missed it
            if (possibleQuoteChars.includes(header[0])) scoreParts.headerTrimQuotes -= 10
            if (possibleQuoteChars.includes(header[header.length - 1])) scoreParts.headerTrimQuotes -= 10
          }
          labels = headers
        })

        const checkChunk = (chunk) => {
          // console.log(chunk)
          for (const key of Object.keys(chunk)) {
            // none matching labels and object keys means a failure of csv-parse to parse a line
            if (!labels.includes(key)) {
              scoreParts.missingLabels -= 10
              debug('Unmatched object key, score -= 10')
            }
          }
          for (const key of labels) {
            const val = chunk[key]
            // console.log(key, chunk[key])
            if (val === undefined) {
              // This is not necessarily a bad thing it seems
              // maybe undefined at the end of a line is not as bad (it seems that csv-stringify doesn't complete the trailing commas)
              // debug('Undefined property, score -= 0.1')
              // score -= 0.1
            } else if (val) {
              if (val.includes('\n')) {
                // if the value contains line breaks quoting was probably good, and we need to compensate for having potentially less lines
                // debug('Value contains linebreaks, score += ' + lineBreaksBoost)
                // scoreParts.lineBreaksBoost += val.split('\n').length * 0.5
              } else {
                // having many none empty values is a good sign
                // debug('Filled value, score += 1')
                // score += 1
              }
              // having many none empty values is a good sign
              scoreParts.values += 1

              // value is prefixed/suffixed with a potential quote, probably missed it
              if (possibleQuoteChars.includes(val[0])) scoreParts.trimQuotes -= 2
              if (possibleQuoteChars.includes(val[val.length - 1])) scoreParts.trimQuotes -= 2
            }
          }
        }

        let previousChunk
        let i = 0

        // lots of separators surrounded by quotes is a good sign of a strictly formatted CSV
        // for example '","'
        const fullSepRegexp = new RegExp(escapeStringRegexp(qc + fd + qc), 'g')
        scoreParts.fullSepCount += ((sample || '').match(fullSepRegexp) || []).length * 2

        await pump(intoStream(sample), parser, new Writable({
          objectMode: true,
          write (chunk, encoding, callback) {
            i++
            // having many lines is a good sign
            scoreParts.lines += 0.5
            if (i > 1000) return callback()
            if (previousChunk) checkChunk(previousChunk)
            previousChunk = chunk
            callback()
          }
        }))
        // on larger files prevent checking last chunk as it might be broken by the sampling method
        if (i < 10 && previousChunk) checkChunk(previousChunk)
        const score = Object.keys(scoreParts).reduce((score, key) => score + scoreParts[key], 0)
        debug('score', score, scoreParts)
        combinations.push({ props: { fieldsDelimiter: fd, quote: qc, escapeChar: qc, linesDelimiter: ld, labels }, score, scoreParts })
      }
    }
  }
  const bestCombination = combinations.sort((a, b) => b.score - a.score)[0]
  // debug('combinations', combinations)
  const result = bestCombination.props
  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')
  debug('bestCombination', bestCombination)
  return result
}
