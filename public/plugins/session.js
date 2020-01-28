export default ({ store, app, env }) => {
  store.commit('setAny', { env: { ...env } })
  store.dispatch('session/init', { cookies: app.$cookies, baseUrl: env.publicUrl + '/api/v1/session' })
  store.dispatch('session/loop', app.$cookies)
}
