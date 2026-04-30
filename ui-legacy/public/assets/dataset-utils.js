const slug = require('slugify')

// WARNING: this code is duplicated in dataset-schema.vue
exports.escapeKey = (key) => {
  return slug(key, { lower: true, strict: true, replacement: '_' })
}
