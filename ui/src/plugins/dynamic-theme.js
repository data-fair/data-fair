export default async function ({ $vuetify, store, route }) {
  if (route.query.primary) {
    store.state.style.queryPrimary = route.query.primary
    $vuetify.theme.themes.dark.primary = store.getters.primary
    $vuetify.theme.themes.light.primary = store.getters.primary
  }
}
