import sanitizeHtml from 'sanitize-html'
import { getSanitizeOpts } from '@data-fair/lib-utils/sanitize-html.js'

const sanitizeOpts = getSanitizeOpts(sanitizeHtml.defaults)

/** @param {string} html */
export default (html) => sanitizeHtml(html, sanitizeOpts)
