export default async function ({ store, route, error }) {
  if (!store.state.user) {
    error({
      message: 'Vous devez être connecté pour accéder à cette page',
      statusCode: 401,
    })
  } else {
    if (route.params.type === 'user' && route.params.id !== store.state.user.id) {
      error({
        message: 'Vous n\'avez pas les permissions d\'accéder à cette page',
        statusCode: 403,
      })
    }
    if (route.params.type === 'organization' && !store.state.user.organizations.map(o => o.id).includes(route.params.id)) {
      error({
        message: 'Vous n\'avez pas les permissions d\'accéder à cette page',
        statusCode: 403,
      })
    }
  }
}
