export default async ({ store, app, env, $vuetify, route, i18n }) => {
  let publicUrl = window.location.origin + env.basePath
  if (publicUrl.endsWith('/')) publicUrl = publicUrl.substr(0, publicUrl.length - 1)
  store.commit('setAny', {
    env: {
      ...env,
      // reconstruct this env var that we used to have but lost when implementing multi-domain exposition
      publicUrl
    }
  })
  store.dispatch('session/init', {
    cookies: app.$cookies,
    directoryUrl: env.directoryUrl,
    logoutRedirectUrl: publicUrl
  })

  // support opening with active account defined in URL
  if (route.query.account) {
    const parts = route.query.account.split(':')
    store.commit('session/setAny', { reloadAfterAccountChange: false })
    if (parts[0] === 'user') {
      store.dispatch('session/switchOrganization', null)
    } else {
      store.dispatch('session/switchOrganization', parts[1])
    }
    window.onNuxtReady(() => {
      const query = { ...route.query }
      delete query.account
      app.router.replace({ query })
      store.commit('session/setAny', { reloadAfterAccountChange: true })
    })
  }
  // no need to maintain keepalive / readcookie loops in every embedded view
  if (!route.path.startsWith('/embed/')) {
    store.dispatch('session/loop', app.$cookies)
  }
  if (app.$cookies.get('theme_dark') !== undefined) $vuetify.theme.dark = app.$cookies.get('theme_dark')
  if (route.query.dark) $vuetify.theme.dark = route.query.dark === 'true'
  $vuetify.theme.themes.light.admin = env.theme.colors.admin
  $vuetify.theme.themes.dark.admin = env.theme.darkColors.admin || env.theme.colors.admin

  if (!route.path.startsWith('/embed/')) {
    // use mostly to detect if the user has a subscription with explicit limits or is using the service default limits
    await store.dispatch('fetchLimits')
  }
}
