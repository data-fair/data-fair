const fs = require('fs-extra')
const { Readable } = require('stream')
const vocabulary = require('../../contract/vocabulary')
const icalendar = require('icalendar')
const moment = require('moment')

exports.eventsStream = async (filePath) => {
  const cal = icalendar.parse_calendar(await fs.readFile(filePath, 'utf8'))
  const events = cal.events()
  return new Readable({
    objectMode: true,
    read() {
      this.i = this.i || 0
      let line
      do {
        const event = events[this.i]
        if (!event) return this.push(null)
        line = {}
        Object.keys(event.properties).forEach(p => {
          let value = event.properties[p][0].value
          if (Array.isArray(value)) value = value.join(', ')
          if (p.startsWith('DT')) value = moment(value).toISOString()
          line[p] = value
        })
        // No DTEND means eaither a full day event, or a single point in time event
        // it depends on if only the date part of the data should be used (no date-time)
        // we do not distinguish date and a date-time in data-fair yet, so we make this explicit
        if (!line.DTEND && event.properties.DTSTART[0].value.date_only) {
          line.DTEND = moment(line.DTSTART).add(1, 'days').toISOString()
        }
        this.i += 1
      } while (this.push(line))
    }
  })
}

exports.prepareSchema = (dataset) => {
  if (!dataset.schema.find(f => f.key === 'GEO')) {
    const concept = vocabulary.find(c => c.identifiers.includes('http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'))
    dataset.schema.push({
      key: 'GEO',
      'x-originalName': 'GEO',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    })
  }
  if (!dataset.schema.find(f => f.key === 'URL')) {
    const concept = vocabulary.find(c => c.identifiers.includes('https://schema.org/WebPage'))
    dataset.schema.push({
      key: 'URL',
      'x-originalName': 'URL',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'https://schema.org/WebPage'
    })
  }
  if (!dataset.schema.find(f => f.key === 'DTSTART')) {
    const concept = vocabulary.find(c => c.identifiers.includes('https://schema.org/startDate'))
    dataset.schema.push({
      key: 'DTSTART',
      'x-originalName': 'DTSTART',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'https://schema.org/startDate'
    })
  }
  if (!dataset.schema.find(f => f.key === 'DTEND')) {
    const concept = vocabulary.find(c => c.identifiers.includes('https://schema.org/endDate'))
    dataset.schema.push({
      key: 'DTEND',
      'x-originalName': 'DTEND',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'https://schema.org/endDate'
    })
  }
  if (!dataset.schema.find(f => f.key === 'SUMMARY')) {
    const concept = vocabulary.find(c => c.identifiers.includes('http://www.w3.org/2000/01/rdf-schema#label'))
    dataset.schema.push({
      key: 'SUMMARY',
      'x-originalName': 'SUMMARY',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label'
    })
  }
  if (!dataset.schema.find(f => f.key === 'DESCRIPTION')) {
    const concept = vocabulary.find(c => c.identifiers.includes('http://schema.org/description'))
    dataset.schema.push({
      key: 'DESCRIPTION',
      'x-originalName': 'DESCRIPTION',
      type: 'string',
      title: concept.title,
      description: concept.description,
      'x-refersTo': 'http://schema.org/description'
    })
  }
}
