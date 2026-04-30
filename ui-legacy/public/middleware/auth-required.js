export default function authRequired ({ redirect, route, store, error }) {
  if (!store.state.session || !store.state.session.user) {
    return error({ i18n: 'authRequired' })
  }
}
