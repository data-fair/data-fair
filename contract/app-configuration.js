module.exports = {
  type: 'object',
  description: 'A free format configuration object used by applications. A minimal common structure is used to ensure proper linking between applications and datasets and remote services',
  additionalProperties: true,
  properties: {
    datasets: {
      type: 'array',
      items: {
        type: ['object', 'null'],
        required: ['href'],
        properties: {
          href: {
            type: 'string'
          },
          key: {
            type: 'string',
            description: 'Not the id of the dataset, but a key inside this configuration object to define the role of the dataset in this context.'
          },
          name: {
            type: 'string'
          },
          applicationKeyPermissions: {
            type: 'object',
            description: 'The permissions that should be applied to users accessing this dataset through a protecte application key of this application',
            default: { classes: ['read'] },
            properties: {
              operations: {
                type: 'array',
                items: {
                  type: 'string',
                  description: 'API operation that can be used'
                }
              },
              classes: {
                type: 'array',
                items: {
                  type: 'string',
                  description: 'API permission classes that can be used'
                }
              }
            }
          }
        }
      }
    }
  }
}
