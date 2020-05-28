module.exports = {
  type: 'object',
  required: ['catalog', 'status'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
    },
    catalog: {
      type: 'string',
      description: 'L\'identifiant du catalogue de destination de cette publication.',
    },
    status: {
      type: 'string',
      description: 'A simple flag to clearly identify the publications that were successful. If "published" then the targetUrl key should be defined, If "error" then the error key should be defined.',
      enum: ['waiting', 'published', 'error', 'deleted'],
    },
    publishedAt: {
      type: 'string',
      description: 'Date of the last update for this publication',
      format: 'date-time',
    },
    error: {
      type: 'string',
    },
    targetUrl: {
      type: 'string',
    },
    result: {
      type: 'object',
      description: 'The result of pushing the publication. The structure of this object is permissive and depends on the type of catalog',
    },
    addToDataset: {
      type: 'object',
      description: 'Present if the publication should be pushed as a resource in a catalog dataset instead of a separate catalog dataset.',
    },
  },
}
