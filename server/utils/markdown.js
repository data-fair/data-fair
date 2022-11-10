const marked = require('marked')
const truncateMiddle = require('truncate-middle')
const truncateHTML = require('truncate-html')
const memoize = require('memoizee')
const sanitizeHtml = require('../../shared/sanitize-html')

const prepare = (key, updatedAt, html, truncate, text) => {
  if (html) text = marked.parse(text).trim()
  text = sanitizeHtml(text)
  if (truncate) {
    truncate = Number(truncate)
    if (html) {
      text = truncateHTML(text, truncate)
    } else {
      text = truncateMiddle(text, truncate, 0, '...')
    }
  }
  return text
}
const memoizedPrepare = memoize(prepare, {
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
  length: 4 // this way the cache key is key/updatedAt/html/truncate and text that can be large is not used as a key
})

exports.prepareMarkdownContent = (text, html = false, truncate = null, key, updatedAt) => {
  return updatedAt ? memoizedPrepare(key, updatedAt, html, truncate, text) : prepare(key, updatedAt, html, truncate, text)
}
