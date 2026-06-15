import { Marked } from 'marked'
import truncateMiddle from 'truncate-middle'
import truncateHTML from 'truncate-html'
import memoize from 'memoizee'
import sanitizeHtml from '@data-fair/data-fair-shared/sanitize-html.js'
import { markedVuetify } from '@data-fair/lib-utils/marked-vuetify.js'

export const defaultMarked = new Marked()
export const vuetifyMarked = new Marked()
vuetifyMarked.use(markedVuetify)

const prepare = (key: any, updatedAt: any, html: any, truncate: any, text: any) => {
  if (html === 'true') text = (defaultMarked.parse(text) as string).trim()
  else if (html === 'vuetify') text = (vuetifyMarked.parse(text) as string).trim()
  text = sanitizeHtml(text)
  if (truncate) {
    truncate = Number(truncate)
    if (html) {
      // truncate-html's default export is a function merged with a namespace; under
      // nodenext the default-import binding loses its call signature, so we re-expose
      // the documented callable signature (no runtime change).
      text = (truncateHTML as unknown as (html: string, length?: number) => string)(text, truncate)
    } else {
      text = truncateMiddle(text, truncate, 0, '...')
    }
  }
  return text
}
const memoizedPrepare = memoize(prepare, {
  profileName: 'prepareMarkdownContent',
  primitive: true,
  max: 10000,
  maxAge: 1000 * 60 * 60, // 1 hour
  length: 4 // this way the cache key is key/updatedAt/html/truncate and text that can be large is not used as a key
})

export const prepareMarkdownContent = (text: any, html: any, truncate: any = null, key: any, updatedAt: any) => {
  return updatedAt ? memoizedPrepare(key, updatedAt, html, truncate, text) : prepare(key, updatedAt, html, truncate, text)
}
