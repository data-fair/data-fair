const sanitizeHtml = require('sanitize-html')

const opts = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['title', 'alt', 'src', 'srcset', 'height', 'width', 'sizes', 'loading']
  }
}

module.exports = (html) => sanitizeHtml(html, opts)
