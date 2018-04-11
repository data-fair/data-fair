import Cookie from 'js-cookie'

// Always exchange jwts when loading the page
export default ({store, app, $axios}) => {
  if (!store.state.jwt) return

  $axios.post(store.state.env.directoryUrl + '/api/auth/exchange').then(res => {
    Cookie.set('id_token', res.data, 30)
    store.commit('setJwt', res.data)
  }, err => {
    Cookie.remove('id_token')
    store.commit('setJwt')
    console.error(err)
    // TODO: use notifications
  })
}
