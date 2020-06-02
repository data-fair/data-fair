export default async function ({ $vuetify, query }) {
  if (query.dark === 'true') $vuetify.theme.dark = true
  if (query.primary) {
    $vuetify.theme.themes.dark.primary = query.primary
    $vuetify.theme.themes.light.primary = query.primary
  }
}
