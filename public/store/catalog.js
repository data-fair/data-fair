// A module of the store for the currently worked on catalog
// Used in the catalog vue and all its tabs and their components
import eventBus from '~/event-bus'

export default () => ({
  namespaced: true,
  state: {
    catalogId: null,
    catalog: null,
    api: null,
    // TODO: fetch nbPublications so we can display a warning when deleting
    nbPublications: null,
    error: null,
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.catalogId ? rootState.env.publicUrl + '/api/v1/catalogs/' + state.catalogId : null,
    can: (state, getters, rootState) => (operation) => {
      if (rootState.session && rootState.session.user && rootState.session.user.adminMode) return true
      return (state.catalog && state.catalog.userPermissions.includes(operation)) || false
    },
  },
  mutations: {
    setAny(state, params) {
      Object.assign(state, params)
    },
    patch(state, patch) {
      Object.assign(state.catalog, patch)
    },
  },
  actions: {
    async fetchInfo({ commit, dispatch, getters, state }) {
      commit('setAny', { error: null })
      try {
        const catalog = await this.$axios.$get(`api/v1/catalogs/${state.catalogId}`)
        commit('setAny', { catalog })
        const api = await this.$axios.$get(`api/v1/catalogs/${state.catalogId}/api-docs.json`)
        commit('setAny', { api })
      } catch (error) {
        if (error.response) commit('setAny', { error: error.response })
        console.log(error)
      }
    },
    async setId({ commit, getters, dispatch, state }, catalogId) {
      commit('setAny', { catalogId })
      await dispatch('fetchInfo')
    },
    clear({ commit, state }) {
      commit('setAny', { catalogId: null, catalog: null })
    },
    async patch({ commit, getters, dispatch }, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', 'La configuration du catalogue a bien été mise à jour.')
        return true
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour de la configuration du catalogue:' })
        return false
      }
    },
    async patchAndCommit({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async remove({ state, getters, dispatch }) {
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `La configuration du catalogue ${state.catalog.title} a bien été supprimée`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression de la configuration du catalogue:' })
      }
    },
    async changeOwner({ commit, state }, owner) {
      try {
        await this.$axios.$put(`api/v1/catalogs/${state.catalog.id}/owner`, owner)
        commit('patch', { owner })
        eventBus.$emit('notification', `Le catalogue ${state.catalog.title} a changé de propriétaire`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant le changement de propriétaire' })
      }
    },
  },
})
