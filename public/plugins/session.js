export default async ({ store, app, env, $vuetify, route }) => {
  let publicUrl = window.location.origin + env.basePath
  if (publicUrl.endsWith('/')) publicUrl = publicUrl.substr(0, publicUrl.length - 1)
  store.commit('setAny', {
    env: {
      ...env,
      // reconstruct this env var that we used to have but lost when implementing multi-domain exposition
      publicUrl,
    },
  })
  store.dispatch('session/init', {
    cookies: app.$cookies,
    directoryUrl: env.directoryUrl,
  })
  store.dispatch('session/loop', app.$cookies)
  if (app.$cookies.get('theme_dark') !== undefined) $vuetify.theme.dark = app.$cookies.get('theme_dark')
  if (route.query.dark) $vuetify.theme.dark = route.query.dark === 'true'
  await store.dispatch('fetchLimits')
}
