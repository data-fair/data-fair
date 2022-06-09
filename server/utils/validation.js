const slugify = require('slugify')
const createError = require('http-errors')

exports.validateId = (id) => {
  if (!id) return
  const slug = slugify(id, { lower: true, strict: true })
  if (slug !== id) throw createError(400, `id "${id}" should be more URL friendly, maybe try "${slug}" ?`)
}
