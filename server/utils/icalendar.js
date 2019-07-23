const fs = require('fs-extra')
const { Readable } = require('stream')
const vocabulary = require('../../contract/vocabulary')
const icalendar = require('@koumoul/icalendar')
const moment = require('moment')
require('moment-timezone')
const rrule = require('rrule')
const localeTimeZone = moment.tz.guess()

// We want date_only dates to at time 00:00 in the most relevant timezone
function parseDate(prop, calendarTimeZone) {
  if (!prop.value.date_only) return moment(prop.value).toISOString()
  if (localeTimeZone === calendarTimeZone) return moment(prop.value).toISOString()
  const valueDay = moment(prop.value).format('YYYY-MM-DD')
  return moment.tz(valueDay, calendarTimeZone).toISOString()
}

exports.parse = async (filePath) => {
  let content = (await fs.readFile(filePath, 'utf8')).trim()
  // fix badly closed openagenda exports
  if (content.endsWith('END:VEVENT')) {
    content += '\nEND:VCALENDAR'
  }
  const cal = icalendar.parse_calendar(content)
  const infos = {}
  Object.keys(cal.properties).forEach(p => {
    let value = cal.properties[p][0].value
    if (Array.isArray(value)) value = value.join(', ')
    if (p.startsWith('DT')) value = moment(value).toISOString()
    infos[p] = value
  })

  // Do our best to capture main timezone of the whole calendar
  // console.log(cal.timezone('America/Los_Angeles'))
  try {
    infos.timeZone = cal.components.VTIMEZONE[0].properties.TZID[0].value
  } catch (err) {
    infos.timeZone = infos['X-WR-TIMEZONE'] || localeTimeZone
  }

  const events = cal.events()
  return { infos,
    eventsStream: new Readable({
      objectMode: true,
      read() {
        try {
          this.i = this.i || 0
          let line
          let pushOk = true
          do {
            const event = events[this.i]
            if (!event) return this.push(null)
            line = {}
            Object.keys(event.properties).forEach(p => {
              let value = event.properties[p][0].value
              if (Array.isArray(value)) value = value.join(', ')
              if (p.startsWith('DT')) value = parseDate(event.properties[p][0], infos.timeZone)
              line[p] = value
            })
            // No DTEND means eaither a full day event, or a single point in time event
            // it depends on if only the date part of the data should be used (no date-time)
            // we do not distinguish date and a date-time in data-fair yet, so we make this explicit
            // console.log(JSON.stringify(event.properties, null, 2))
            if (!line.DTEND && event.properties.DTSTART[0].value.date_only) {
              line.DTEND = moment(line.DTSTART).add(1, 'days').toISOString()
            }

            // pre-resolve recurring events, to prioritize ease of reading
            if (line.RRULE) {
              const opts = {
                dtstart: new Date(line.DTSTART)
              }
              Object.keys(line.RRULE).forEach(k => {
                opts[k.toLowerCase()] = isNaN(line.RRULE[k]) ? line.RRULE[k] : Number(line.RRULE[k])
              })
              if (opts.freq) opts.freq = rrule.RRule[opts.freq.toUpperCase()]
              if (!opts.until) opts.until = new Date(Date.UTC(2099, 12, 31))
              if (opts.byday) {
                opts.byweekday = opts.byday
                delete opts.byday
              }
              const rule = new rrule.RRule(opts)
              const startDates = rule.all().slice(0, 1000)
              const duration = moment(line.DTEND).diff(line.DTSTART)
              startDates.forEach(startDate => {
                const duplicateLine = {
                  ...line,
                  DTSTART: startDate.toISOString(),
                  DTEND: moment(startDate).add(duration).toISOString()
                }
                delete duplicateLine.RRULE
                pushOk = this.push(duplicateLine)
              })
            } else {
              pushOk = this.push(line)
            }

            this.i += 1
          } while (pushOk)
        } catch (err) {
          this.destroy(err)
        }
      }
    }) }
}

exports.prepareSchema = (dataset, icalInfos) => {
  dataset.extras = dataset.extras || {}
  dataset.extras.iCalendar = icalInfos
  dataset.timeZone = icalInfos.timeZone
  delete icalInfos.timeZone

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
