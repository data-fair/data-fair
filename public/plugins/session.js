export default async ({ store, app, env, $vuetify, route }) => {
  store.commit('setAny', { env: { ...env } })
  store.dispatch('session/init', {
    cookies: app.$cookies,
    baseUrl: env.publicUrl + '/api/v1/session',
    cookieDomain: env.sessionDomain,
  })
  store.dispatch('session/loop', app.$cookies)
  if (app.$cookies.get('theme_dark') !== undefined) $vuetify.theme.dark = app.$cookies.get('theme_dark')
  if (route.query.dark) $vuetify.theme.dark = route.query.dark === 'true'
  await store.dispatch('fetchLimits')
}
