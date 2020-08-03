// A module of the store for the currently worked on dataset
// Used in the dataset vue and all its tabs and their components
import Vue from 'vue'
import eventBus from '~/event-bus'

export default () => ({
  namespaced: true,
  state: {
    datasetId: null,
    dataset: null,
    api: null,
    journal: [],
    remoteServices: [],
    applications: null,
    nbApplications: null,
    nbVirtualDatasets: null,
    dataFiles: null,
    eventStates: {
      'data-updated': 'uploaded',
      'download-end': 'uploaded',
      'convert-start': 'uploaded',
      'convert-end': 'loaded',
      'analyze-start': 'loaded',
      'analyze-end': 'analyzed',
      'schematize-start': 'analyzed',
      'schematize-end': 'schematized',
      'index-start': 'schematized',
      'index-end': 'indexed',
      'extend-start': 'indexed',
      'extend-end': 'extended',
      'finalize-start': 'extended',
      'finalize-end': 'finalized',
      error: 'error',
    },
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.datasetId ? rootState.env.publicUrl + '/api/v1/datasets/' + state.datasetId : null,
    journalChannel: (state) => 'datasets/' + state.datasetId + '/journal',
    concepts: state => {
      if (!state.dataset) return new Set()
      return new Set(state.dataset.schema.map(field => field['x-refersTo']).filter(c => c))
    },
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
    can: (state, getters, rootState) => (operation) => {
      if (rootState.session && rootState.session.user && rootState.session.user.adminMode) return true
      return (state.dataset && state.dataset.userPermissions.includes(operation)) || false
    },
    isOwner: (state, getters, rootState) => {
      if (!state.dataset) return
      if (!rootState.session || !rootState.session.user) return false
      if (state.dataset.owner.type === 'user' && state.dataset.owner.id === rootState.session.user.id) return true
      if (state.dataset.owner.type === 'organization') {
        const userOrga = rootState.session.user.organizations.find(o => o.id === state.dataset.owner.id)
        return userOrga && userOrga.role === 'admin'
      }
      return false
    },
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
  },
  actions: {
    async fetchInfo({ commit, dispatch }) {
      try {
        await dispatch('fetchDataset')
        await Promise.all([
          dispatch('fetchApplications'),
          dispatch('fetchVirtuals'),
          dispatch('fetchApiDoc'),
          dispatch('fetchDataFiles'),
          dispatch('fetchJournal'),
        ])
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des informations du jeu de données:' })
      }
    },
    async fetchDataset({ commit, state }) {
      const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`)
      const extensions = (dataset.extensions || []).map(ext => {
        ext.error = ext.error || ''
        ext.progress = ext.progress || 0
        ext.select = ext.select || []
        return ext
      })
      Vue.set(dataset, 'extensions', extensions)
      Vue.set(dataset, 'schema', dataset.schema || [])
      Vue.set(dataset, 'publications', dataset.publications || [])
      commit('setAny', { dataset })
    },
    async fetchApplications({ commit, state }) {
      const apps = await this.$axios.$get('api/v1/applications', { params: { dataset: state.dataset.id, size: 10000, select: 'id,title' } })
      commit('setAny', { nbApplications: apps.count, applications: apps.results })
    },
    async fetchVirtuals({ commit, state }) {
      const virtuals = await this.$axios.$get('api/v1/datasets', { params: { children: state.dataset.id, size: 0 } })
      commit('setAny', { nbVirtualDatasets: virtuals.count })
    },
    async fetchApiDoc({ commit, state }) {
      const api = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/api-docs.json`)
      commit('setAny', { api })
    },
    async fetchJournal({ commit, state }) {
      const journal = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/journal`)
      commit('setAny', { journal })
    },
    async fetchDataFiles({ commit, state }) {
      const dataFiles = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/data-files`)
      commit('setAny', { dataFiles })
    },
    async setId({ commit, getters, dispatch, state }, datasetId) {
      commit('setAny', { datasetId })
      await dispatch('fetchInfo')
    },
    subscribe({ getters, dispatch, state, commit }) {
      eventBus.$emit('subscribe', getters.journalChannel)
      eventBus.$on(getters.journalChannel, async event => {
        if (event.type === 'finalize-end') {
          eventBus.$emit('notification', { type: 'success', msg: 'Le jeu de données a été traité en fonction de vos dernières modifications et est prêt à être utilisé ou édité de nouveau.' })
        }
        if (event.type === 'error') {
          eventBus.$emit('notification', { error: event.data, msg: 'Le service a rencontré une erreur pendant le traitement du jeu de données:' })
        }
        dispatch('addJournalEvent', event)

        // refresh dataset with relevant parts when receiving journal event
        if (state.eventStates[event.type] && state.dataset) {
          commit('patch', { status: state.eventStates[event.type] })
        }
        if (event.type === 'schematize-end' || event.type === 'extend-start') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema' } })
          commit('patch', { schema: dataset.schema })
        }
        if (event.type === 'finalize-end') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema,bbox' } })
          commit('patch', { schema: dataset.schema, bbox: dataset.bbox })
        }
        if (event.type === 'publication') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'publications' } })
          commit('patch', { publications: dataset.publications })
        }
        dispatch('fetchApiDoc')
      })
    },
    clear({ commit, state }) {
      if (state.datasetId) eventBus.$emit('unsubscribe', 'datasets/' + state.datasetId + '/journal')
      commit('setAny', { datasetId: null, dataset: null, api: null, journal: [] })
    },
    async patch({ commit, getters, dispatch }, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', 'Le jeu de données a bien été mis à jour.')
        return true
      } catch (error) {
        if (error.status === 409) {
          eventBus.$emit('notification', 'Le jeu de données est en cours de traitement et votre modification n\'a pas pu être appliquée. Veuillez essayer de nouveau un peu plus tard.')
        } else {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour du jeu de données' })
        }
        return false
      }
    },
    async patchAndCommit({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async reindex({ state, dispatch }) {
      await this.$axios.$post(`api/v1/datasets/${state.dataset.id}/_reindex`)
    },
    async remove({ state, getters, dispatch }) {
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `Le jeu de données ${state.dataset.title} a bien été supprimé`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression du jeu de données' })
      }
    },
    addJournalEvent({ commit }, event) {
      commit('addJournalEvent', event)
    },
    async fetchRemoteServices({ getters, commit, state }) {
      let remoteServices = []
      const data = await this.$axios.$get('api/v1/remote-services', {
        params: { size: 100 },
      })
      remoteServices = data.results
      commit('setAny', { remoteServices })
    },
    async changeOwner({ commit, state }, owner) {
      try {
        await this.$axios.$put(`api/v1/datasets/${state.dataset.id}/owner`, owner)
        commit('patch', { owner })
        eventBus.$emit('notification', `Le jeu de données ${state.dataset.title} a changé de propriétaire`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant le changement de propriétaire' })
      }
    },
  },
})
