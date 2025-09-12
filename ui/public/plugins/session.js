export default async ({ store, app, env, $vuetify, route, i18n }) => {
  let publicUrl = window.location.origin + env.basePath
  if (publicUrl.endsWith('/')) publicUrl = publicUrl.substr(0, publicUrl.length - 1)

  env.extraNavigationItems = env.extraNavigationItems ?? []
  env.extraAdminNavigationItems = env.extraAdminNavigationItems ?? []

  if (env.eventsIntegration && !env.extraNavigationItems.some(e => e.id === 'events')) {
    env.extraNavigationItems.push({
      id: 'events',
      title: 'Traçabilité (bêta)',
      can: 'admin',
      iframe: '/events/embed/events/',
      basePath: '/events',
      icon: 'mdi-clipboard-text-clock',
      dFrame: true
    })
  }

  if (env.catalogsIntegration) {
    env.extraNavigationItems.unshift({
      id: 'catalogs',
      title: 'Catalogues (bêta)',
      subtitle: 'Nouvelle version',
      can: 'adminDep',
      iframe: '/catalogs/catalogs/',
      basePath: '/catalogs',
      icon: 'mdi-transit-connection',
      dFrame: true
    })

    env.extraAdminNavigationItems.push({
      id: 'catalogs-plugins',
      title: 'Plugins - Catalogues',
      iframe: '/catalogs/admin/plugins/',
      basePath: '/catalogs',
      icon: 'mdi-transit-connection',
      dFrame: true
    })
  }

  if (env.portalsIntegration) {
    env.extraNavigationItems.push({
      id: 'portals-manager-portals',
      title: 'Portails (bêta)',
      subtitle: 'Nouvelle version',
      can: 'adminDep',
      iframe: '/portals-manager/portals/',
      basePath: '/portals-manager',
      icon: 'mdi-presentation',
      dFrame: true
    })
    env.extraNavigationItems.push({
      id: 'portals-manager-pages',
      title: 'Pages de portails (bêta)',
      subtitle: 'Nouvelle version',
      can: 'adminDep',
      iframe: '/portals-manager/pages/',
      basePath: '/portals-manager',
      icon: 'mdi-text-box-edit-outline',
      dFrame: true
    })
  }

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
