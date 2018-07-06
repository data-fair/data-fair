// A module of the store for the currently worked on dataset
// Used in the dataset vue and all its tabs and their components
import Vue from 'vue'
import eventBus from '../event-bus.js'

export default {
  namespaced: true,
  state: {
    datasetId: null,
    dataset: null,
    api: null,
    journal: [],
    remoteServices: [],
    catalogs: null
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.datasetId ? rootState.env.publicUrl + '/api/v1/datasets/' + state.datasetId : null,
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
    can: (state) => (operation) => (state.dataset && state.dataset.userPermissions.includes(operation)) || false,
    isOwner: (state, getters, rootState) => {
      if (!rootState.session || !rootState.session.user) return false
      if (state.dataset.owner.type === 'user' && state.dataset.owner.id === rootState.session.user.id) return true
      if (state.dataset.owner.type === 'organization') {
        const userOrga = rootState.session.user.organizations.find(o => o.id === state.dataset.owner.id)
        return userOrga && userOrga.role === 'admin'
      }
      return false
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
      if (!state.journal.find(e => e.date === event.date)) {
        state.journal.unshift(event)
      }
    },
    addRemoteService(state, service) {
      state.remoteServices.push(service)
    },
    writePublication(state, publication) {
      state.dataset.publications.push(publication)
    },
    deletePublication(state, id) {
      state.dataset.publications = state.dataset.publications.filter(p => p.id !== id)
    }
  },
  actions: {
    async fetchInfo({commit, getters}) {
      let dataset
      try {
        dataset = await this.$axios.$get(getters.resourceUrl)
      } catch (error) {
        eventBus.$emit('notification', {error, msg: `Erreur pendant la récupération des informations du jeu de données:`})
        return
      }
      const extensions = (dataset.extensions || []).map(ext => {
        ext.error = ext.error || ''
        ext.progress = ext.progress || 0
        ext.select = ext.select || []
        return ext
      })
      Vue.set(dataset, 'extensions', extensions)
      Vue.set(dataset, 'schema', dataset.schema || [])
      Vue.set(dataset, 'publications', dataset.publications || [])

      commit('setAny', {dataset})
      const api = await this.$axios.$get(getters.resourceUrl + '/api-docs.json')
      commit('setAny', {api})
      const journal = await this.$axios.$get(getters.resourceUrl + '/journal')
      commit('setAny', {journal})
    },
    async setId({commit, getters, dispatch, state}, datasetId) {
      commit('setAny', {datasetId})
      dispatch('fetchInfo')

      const newChannel = 'datasets/' + datasetId + '/journal'
      eventBus.$emit('subscribe', newChannel)
      eventBus.$on(newChannel, event => {
        if (event.type === 'finalize-end') {
          eventBus.$emit('notification', {type: 'success', msg: 'Le jeu de données a été traité en fonction de vos dernières modifications et est prêt à être utilisé ou édité de nouveau.'})
          dispatch('fetchInfo')
        }
        if (event.type === 'error') eventBus.$emit('notification', {error: event.data, msg: 'Le service a rencontré une erreur pendant le traitement du jeu de données:'})
        dispatch('addJournalEvent', event)
      })
    },
    clear({commit, state}) {
      if (state.datasetId) eventBus.$emit('unsubscribe', 'datasets/' + state.datasetId + '/journal')
      commit('setAny', {datasetId: null, dataset: null, api: null, journal: []})
    },
    async patch({commit, getters, dispatch}, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', 'Le jeu de données a bien été mis à jour.')
        return true
      } catch (error) {
        if (error.status === 409) {
          eventBus.$emit('notification', `Le jeu de données est en cours de traitement et votre modification n'a pas pu être appliquée. Veuillez essayer de nouveau un peu plus tard.`)
        } else {
          eventBus.$emit('notification', {error, msg: 'Erreur pendant la mise à jour du jeu de données'})
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
        eventBus.$emit('notification', `Le jeu de données ${state.dataset.title} a bien été supprimé`)
      } catch (error) {
        eventBus.$emit('notification', {error, msg: 'Erreur pendant la suppression du jeu de données'})
      }
    },
    addJournalEvent({commit}, event) {
      commit('addJournalEvent', event)
    },
    async fetchRemoteService({commit, getters, state}, id) {
      if (getters.remoteServicesMap[id]) return
      const remoteService = await this.$axios.$get('api/v1/remote-services/' + id)
      commit('addRemoteService', remoteService)
    },
    async fetchRemoteServices({getters, commit, state}) {
      let remoteServices = []
      if (getters.concepts.size) {
        const inputConcepts = [...getters.concepts].filter(c => c !== 'http://schema.org/identifier').map(encodeURIComponent).join(',')
        const data = await this.$axios.$get('api/v1/remote-services?input-concepts=' + inputConcepts)
        remoteServices = data.results.filter(s => s.owner.type === state.dataset.owner.type && s.owner.id === state.dataset.owner.id)
      }
      commit('setAny', {remoteServices})
    },
    async fetchCatalogs({getters, commit, state}) {
      const catalogs = await this.$axios.$get(`api/v1/settings/${state.dataset.owner.type}/${state.dataset.owner.id}/catalogs`)
      commit('setAny', {catalogs})
    },
    async writePublication({commit, state, getters}, publication) {
      try {
        const createdPublication = await this.$axios.$post(`${getters.resourceUrl}/publications`, publication)
        commit('writePublication', createdPublication)
      } catch (error) {
        eventBus.$emit('notification', {error, msg: 'Erreur pendant la création d\'une publication'})
      }
    },
    async deletePublication({commit, state, getters}, id) {
      await this.$axios.$delete(`${getters.resourceUrl}/publications/${id}`)
      commit('deletePublication', id)
    }
  }
}
