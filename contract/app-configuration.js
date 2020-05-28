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
            type: 'string',
          },
          key: {
            type: 'string',
            description: 'Not the id of the dataset, but a key inside this configuration object to define the role of the dataset in this context.',
          },
          name: {
            type: 'string',
          },
        },
      },
    },
  },
}
