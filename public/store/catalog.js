// A module of the store for the currently worked on catalog
// Used in the catalog vue and all its tabs and their components
import eventBus from '../event-bus.js'

export default {
  namespaced: true,
  state: {
    catalogId: null,
    catalog: null,
    api: null,
    // TODO: fetch nbPublications so we can display a warning when deleting
    nbPublications: null
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.catalogId ? rootState.env.publicUrl + '/api/v1/catalogs/' + state.catalogId : null,
    can: (state) => (operation) => (state.catalog && state.catalog.userPermissions.includes(operation)) || false
  },
  mutations: {
    setAny(state, params) {
      Object.assign(state, params)
    },
    patch(state, patch) {
      Object.assign(state.catalog, patch)
    }
  },
  actions: {
    async fetchInfo({ commit, dispatch, getters, rootState }) {
      try {
        const catalog = await this.$axios.$get(getters.resourceUrl)
        commit('setAny', { catalog })
        const api = await this.$axios.$get(getters.resourceUrl + '/api-docs.json')
        commit('setAny', { api })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des informations du catalogue:` })
      }
    },
    async setId({ commit, getters, dispatch, state }, catalogId) {
      commit('setAny', { catalogId })
      dispatch('fetchInfo')
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
        eventBus.$emit('notification', { error, msg: `Erreur pendant la mise à jour de la configuration du catalogue:` })
        return false
      }
    },
    async patchAndCommit({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async remove({ state, getters, dispatch }) {
      const options = { headers: { 'x-organizationId': 'user' } }
      if (state.catalog.owner.type === 'organization') options.headers = { 'x-organizationId': state.catalog.owner.id }
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `La configuration du catalogue ${state.catalog.title} a bien été supprimée`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la suppression de la configuration du catalogue:` })
      }
    }
  }
}
