const owner = require('./owner')
const eventBy = require('./event-by')

module.exports = {
  'title': 'Application configuration',
  'type': 'object',
  'additionalProperties': false,
  'required': ['id', 'owner', 'url'],
  'properties': {
    'id': {
      'type': 'string',
      'description': 'Identifier of the application configuration'
    },
    'title': {
      'type': 'string',
      'description': 'Short title of the application configuration'
    },
    'description': {
      'type': 'string',
      'description': 'Detailed description of the application configuration'
    },
    'applicationName': {
      'type': 'string',
      'description': 'Identifier of the origin application'
    },
    'createdBy': eventBy,
    'updatedBy': eventBy,
    'createdAt': {
      'type': 'string',
      'description': 'Creation date of this application configuration',
      'format': 'date-time'
    },
    'updatedAt': {
      'type': 'string',
      'description': 'Date of the last update for this application configuration',
      'format': 'date-time'
    },
    owner,
    'configuration': {
      'type': 'object'
    },
    'url': {
      'type': 'string',
      'description': 'The URL the application is located to'
    }
  }
}
