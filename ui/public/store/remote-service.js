// A module of the store for the currently worked on remoteService
// Used in the remoteService vue and all its tabs and their components
import eventBus from '~/event-bus'

export default () => ({
  namespaced: true,
  state: {
    remoteServiceId: null,
    remoteService: null,
    api: null
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.remoteServiceId ? rootState.env.publicUrl + '/api/v1/remote-services/' + state.remoteServiceId : null
  },
  mutations: {
    setAny (state, params) {
      Object.assign(state, params)
    },
    patch (state, patch) {
      Object.assign(state.remoteService, patch)
    }
  },
  actions: {
    async fetchInfo ({ commit, dispatch, getters, rootState }) {
      const remoteService = await this.$axios.$get(getters.resourceUrl)
      remoteService.parameters = remoteService.parameters || []
      commit('setAny', { remoteService })
      const api = await this.$axios.$get(getters.resourceUrl + '/api-docs.json')
      commit('setAny', { api })
    },
    async setId ({ commit, getters, dispatch, state }, remoteServiceId) {
      commit('setAny', { remoteServiceId })
      await dispatch('fetchInfo')
    },
    clear ({ commit, state }) {
      commit('setAny', { remoteServiceId: null, remoteService: null })
    },
    async patch ({ commit, getters, dispatch }, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', 'La configuration du service a été mise à jour.')
        return true
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour de la configuration du service:' })
        return false
      }
    },
    async patchAndCommit ({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async remove ({ state, getters, dispatch }) {
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `La configuration du service ${state.remoteService.title} a été supprimée`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression de la configuration du service:' })
      }
    },
    async refresh ({ state, dispatch }) {
      try {
        const apiDoc = await this.$axios.$get(state.remoteService.url)
        if (!await dispatch('patch', { apiDoc })) return
        eventBus.$emit('notification', 'La définition de l\'API a été mise à jour')
        dispatch('fetchInfo')
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour de la définition de l\'API:' })
      }
    }
  }
})
