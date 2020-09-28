const { Writable } = require('stream')
const csv = require('csv-parser')
const pump = require('util').promisify(require('pump'))

// const possibleLinesDelimiters = [{ d: '\r\n', regexp: /\r\n/g }, { d: '\n', regexp: /[^\r]\n/g }]
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
          const parser = csv({ separator: fd, quote: qc, escape: ec, newline: ld })
          parser.on('headers', headers => { labels = headers })
          const parsePromise = pump(parser, new Writable({
            objectMode: true,
            write(chunk, encoding, callback) {
              labels.forEach(key => {
                // console.log(key, chunk[key])
                if (chunk[key] === undefined) {
                  // TODO: maybe undefined at the end of a line is not as bad (it seems that csv-stringify doesn't complete the trailing commas)
                  score -= 0.5
                } else if (chunk[key].match(/^'.*'$/) || chunk[key].match(/^".*"$/)) {
                  // still wrapped in separators, can probably do better
                  score -= 1
                } else if (chunk[key]) {
                  // having many none empty values are a good sign
                  score += 1
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
  const result = bestCombination.props
  if (!result.labels || !result.labels.length) throw new Error('Échec de l\'analyse du fichier tabulaire, pas de colonne détectée.')

  return result
}
