// A module of the store for the currently worked on application
// Used in the application vue and all its tabs and their components
import eventBus from '../event-bus.js'

export default {
  namespaced: true,
  state: {
    applicationId: null,
    application: null,
    api: null
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.applicationId ? rootState.env.publicUrl + '/api/v1/applications/' + state.applicationId : null,
    isOwner: (state) => {
      return state.application.userPermissions.isOwner
    }
  },
  mutations: {
    setAny(state, params) {
      Object.assign(state, params)
    },
    patch(state, patch) {
      Object.assign(state.application, patch)
    }
  },
  actions: {
    async fetchInfo({commit, dispatch, getters}) {
      try {
        const application = await this.$axios.$get(getters.resourceUrl)
        const api = await this.$axios.$get(getters.resourceUrl + '/api-docs.json')
        commit('setAny', {application, api})
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la récupération de la définition de l'API`})
      }
    },
    async setId({commit, getters, dispatch, state}, applicationId) {
      commit('setAny', {applicationId})
      dispatch('fetchInfo')
    },
    clear({commit, state}) {
      commit('setAny', {applicationId: null, application: null})
    },
    async patch({commit, getters, dispatch}, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', `La configuration d'application a bien été mise à jour.`)
        return true
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la mise à jour de la configuration d'application:`})
        return false
      }
    },
    async patchAndCommit({commit, getters, dispatch}, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async remove({state, getters, dispatch}) {
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `La configuration d'application ${state.application.title} a bien été supprimée.`)
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la suppression de la configuration d'application:`})
      }
    }
  }
}
