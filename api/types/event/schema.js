export default {
  $id: 'https://github.com/data-fair/data-fair/event',
  title: 'Event',
  'x-exports': ['types'],
  required: ['type', 'date'],
  additionalProperties: false,
  properties: {
    type: {
      type: 'string'
    },
    date: {
      type: 'string',
      format: 'date-time'
    },
    data: {
      type: 'string'
    },
    draft: {
      type: 'boolean'
    },
    store: {
      type: 'boolean' // This is used exclusively in WebSockets.
    },
    href: {
      type: 'string' // optional link attached to the event (used in webhook text and journal entries)
    },
    hasDiagnosticFile: {
      type: 'boolean' // true if a validation-diagnostic.csv file was produced for this event (e.g. unicity constraint violations)
    },
    diagnosticErrorCount: {
      type: 'integer' // number of error lines recorded in the diagnostic file
    },
    diagnosticCapped: {
      type: 'boolean' // true if the diagnostic file hit its line cap and does not contain every error
    },
    unicityErrorCount: {
      type: 'integer' // number of duplicate lines detected by a unique constraint check
    }
  }
}
