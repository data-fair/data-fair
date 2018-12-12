export default ({ store, app }) => {
  store.dispatch('session/loop', app.$cookies)
}
