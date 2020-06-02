export default ({ store, app, env }) => {
  store.commit('setAny', { env: { ...env } })
  store.dispatch('session/init', {
    cookies: app.$cookies,
    baseUrl: env.publicUrl + '/api/v1/session',
    cookieDomain: env.sessionDomain,
  })
  store.dispatch('session/loop', app.$cookies)
}
