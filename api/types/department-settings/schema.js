import settingsSchema from '../settings/schema.js'

// only some settings are managed at the department levels
export default {
  ...settingsSchema,
  $id: 'https://github.com/data-fair/data-fair/department-settings',
  title: 'Department settings',
  'x-exports': ['types', 'resolvedSchema', 'validate'],
  properties: {
    id: settingsSchema.properties.id,
    type: settingsSchema.properties.id,
    name: settingsSchema.properties.name,
    department: { type: 'string' },
    apiKeys: settingsSchema.properties.apiKeys,
    publicationSites: settingsSchema.properties.publicationSites,
    webhooks: settingsSchema.properties.webhooks
  }
}
