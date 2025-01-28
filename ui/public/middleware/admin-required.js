export default function authRequired ({ redirect, route, store, error }) {
  if (!store.state.session || !store.state.session.user || !store.state.session.user.adminMode) {
    return error({ i18n: 'adminRequired' })
  }
}
