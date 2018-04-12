// A module of the store for the currently worked on remoteService
// Used in the remoteService vue and all its tabs and their components

export default {
  namespaced: true,
  state: {
    remoteServiceId: null,
    remoteService: null,
    api: null
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.remoteServiceId ? rootState.env.publicUrl + '/api/v1/remote-services/' + state.remoteServiceId : null,
    isOwner: (state) => {
      return state.remoteService.userPermissions.isOwner
    }
  },
  mutations: {
    setAny(state, params) {
      Object.assign(state, params)
    },
    patch(state, patch) {
      Object.assign(state.remoteService, patch)
    }
  },
  actions: {
    async fetchInfo({commit, dispatch, getters}) {
      try {
        const remoteService = await this.$axios.$get(getters.resourceUrl)
        const api = await this.$axios.$get(getters.resourceUrl + '/api-docs.json')
        commit('setAny', {remoteService, api})
      } catch (error) {
        dispatch('notifyError', `Erreur ${error.status || error.message} pendant la récupération de la définition de l'API`, {root: true})
      }
    },
    async setId({commit, getters, dispatch, state}, remoteServiceId) {
      commit('setAny', {remoteServiceId})
      dispatch('fetchInfo')
    },
    clear({commit, state}) {
      commit('setAny', {remoteServiceId: null, remoteService: null})
    },
    async patch({commit, getters, dispatch}, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) dispatch('notify', 'La configuration de service distant a bien été miss à jour.', {root: true})
        return true
      } catch (error) {
        if (error.status === 409) {
          dispatch('notifyError', `La configuration de service distant est en cours de traitement et votre modification n'a pas pu être appliquée. Veuillez essayer de nouveau un peu plus tard.`, {root: true})
        } else {
          dispatch('notifyError', `Erreur ${error.status || error.message} pendant la mise à jour de la configuration de service distant`, {root: true})
        }
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
        dispatch('notify', `La configuration de service distant ${state.remoteService.title} a bien été supprimée`, {root: true})
      } catch (error) {
        dispatch('notifyError', `Erreur ${error.status || error.message} pendant la suppression de la configuration de service distant ${state.remoteService.title}`, {root: true})
      }
    },
    async refresh({commit, getters, dispatch}) {
      try {
        await this.$axios.$post(getters.resourceUrl + '/_update')
        dispatch('notify', `La définition de l'API a bien été mise à jour`, {root: true})
        dispatch('fetchInfo')
      } catch (error) {
        dispatch('notifyError', `Erreur ${error.status || error.message} pendant la mise à jour de la définition de l'API`, {root: true})
      }
    }
  }
}
