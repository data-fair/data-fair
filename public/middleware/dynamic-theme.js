import tinycolor from 'tinycolor2'

export default async function ({ $vuetify, query, store }) {
  if (query.dark === 'true') $vuetify.theme.dark = true
  if (query.primary) {
    // ensure the color will provide a readable contrast with white text in buttons
    const c = tinycolor(query.primary)
    while (!tinycolor.isReadable('#FFFFFF', c)) {
      c.darken(2)
    }
    $vuetify.theme.themes.dark.primary = c.toHexString()
    $vuetify.theme.themes.light.primary = c.toHexString()
  }
}
