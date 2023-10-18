const slugify = require('slugify')
const createError = require('http-errors')

exports.validateURLFriendly = (req, value) => {
  if (!value) return
  const slug = slugify(value, { lower: true, strict: true })
  if (slug !== value) throw createError(400, req.__('errors.urlFriendly', { value, slug }))
}
