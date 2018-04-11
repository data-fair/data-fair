// Add jwt as "Authorization: Bearer..." when communicating with the users directory
export default ({$axios, store, app}) => {
  $axios.onRequest(config => {
    if (!config.url || !store.state.jwt) return
    if (config.url.indexOf(store.state.env.directoryUrl) >= 0) {
      config.headers.Authorization = 'Bearer ' + store.state.jwt
    }
  })
}
