// A module of the store for the currently worked on dataset
// Used in the DatasetVue and all its tabs and their components
import Vue from 'vue'
const ws = require('../ws.js')
const utils = require('../utils.js')

module.exports = {
  namespaced: true,
  state: {
    datasetId: null,
    dataset: null,
    api: null,
    journal: [],
    remoteServices: []
  },
  getters: {
    resourceUrl: state => window.CONFIG.publicUrl + '/api/v1/datasets/' + state.datasetId,
    concepts: state => new Set(state.dataset.schema.map(field => field['x-refersTo']).filter(c => c)),
    remoteServicesMap: (state, getters) => {
      const res = {}
      state.remoteServices.forEach(service => {
        service = Object.assign({}, service)
        service.actions = service.actions
          .filter(a => a.inputCollection && a.outputCollection)
          .filter(a => a.input.find(i => getters.concepts.has(i.concept)))
          .reduce((a, b) => { a[b.id] = b; return a }, {})
        res[service.id] = service
      })
      return res
    },
    isOwner: (state, getters, rootState) => {
      return utils.isOwner(state.dataset, rootState.user)
    }
  },
  mutations: {
    setAny(state, params) {
      Object.assign(state, params)
    },
    patch(state, patch) {
      Object.assign(state.dataset, patch)
    },
    addJournalEvent(state, event) {
      state.journal.unshift(event)
    },
    addRemoteService(state, service) {
      state.remoteServices.push(service)
    }
  },
  actions: {
    async fetchInfo({commit, getters}) {
      const dataset = (await Vue.http.get(getters.resourceUrl)).data
      commit('setAny', {dataset})
      const api = (await Vue.http.get(getters.resourceUrl + '/api-docs.json')).data
      commit('setAny', {api})
    },
    async setId({commit, getters, dispatch, state}, datasetId) {
      commit('setAny', {datasetId, dataset: null, api: null})
      dispatch('fetchInfo')

      // TODO: better way to wait for connected state of websocket
      setTimeout(() => {
        if (state.datasetId) ws.$emit('unsubscribe', 'datasets/' + state.datasetId + '/journal')
        const newChannel = 'datasets/' + datasetId + '/journal'
        ws.$emit('subscribe', newChannel)
        ws.$on(newChannel, event => {
          dispatch('fetchInfo')
          dispatch('addJournalEvent', event)
        })
      }, 2000)
    },
    async patch({commit, getters, dispatch}, patch) {
      try {
        await Vue.http.patch(getters.resourceUrl, patch)
        commit('patch', patch)
        dispatch('notify', 'Le jeu de données a bien été mis à jour.', {root: true})
      } catch (error) {
        if (error.status === 409) {
          dispatch('notifyError', `Le jeu de données est en cours de traitement et votre modification n'a pas pu être appliquée. Veuillez essayer de nouveau un peu plus tard.`, {root: true})
        } else {
          dispatch('notifyError', `Erreur ${error.status} pendant la mise à jour du jeu de données`, {root: true})
        }
      }
    },
    async remove({state, getters, dispatch}) {
      try {
        Vue.http.delete(getters.resourceUrl)
        dispatch('notify', `Le jeu de données ${state.dataset.title} a bien été supprimé`, {root: true})
      } catch (error) {
        dispatch('notifyError', `Erreur ${error.status} pendant la suppression du jeu de données ${state.dataset.title}`, {root: true})
      }
    },
    async fetchJournal({getters, commit}) {
      const journal = (await Vue.http.get(getters.resourceUrl + '/journal')).data
      commit('setAny', {journal})
    },
    addJournalEvent({commit}, event) {
      commit('addJournalEvent', event)
    },
    async fetchRemoteService({commit, getters}, id) {
      if (getters.remoteServicesMap[id]) return
      const remoteService = (await Vue.http.get(window.CONFIG.publicUrl + '/api/v1/remote-services/' + id)).data
      commit('addRemoteService', remoteService)
    },
    async fetchRemoteServices({getters, commit, state}) {
      let remoteServices = []
      if (getters.concepts.size) {
        const res = await Vue.http.get(window.CONFIG.publicUrl + '/api/v1/remote-services?input-concepts=' + [...getters.concepts].map(encodeURIComponent).join(','))
        remoteServices = res.data.results.filter(s => s.owner.type === state.dataset.owner.type && s.owner.id === state.dataset.owner.id)
      }
      commit('setAny', {remoteServices})
    }
  }
}
