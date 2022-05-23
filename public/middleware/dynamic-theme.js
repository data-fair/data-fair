import Vue from 'vue'

export default async function ({ $vuetify, query, store }) {
  if (query.primary) {
    // ensure the color will provide a readable contrast with white text in buttons
    const readableColor = Vue.prototype.$readableColor(query.primary)
    $vuetify.theme.themes.dark.primary = readableColor
    $vuetify.theme.themes.light.primary = readableColor
  }
}
