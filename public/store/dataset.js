// A module of the store for the currently worked on dataset
// Used in the dataset vue and all its tabs and their components
import Vue from 'vue'
import eventBus from '~/event-bus'

export default () => ({
  namespaced: true,
  state: {
    datasetId: null,
    dataset: null,
    validatedDataset: null,
    api: null,
    journal: [],
    remoteServices: [],
    applications: null,
    nbApplications: null,
    nbVirtualDatasets: null,
    dataFiles: null,
    jsonSchema: null,
    eventStates: {
      'data-updated': 'uploaded',
      'download-end': 'uploaded',
      'convert-start': 'uploaded',
      'convert-end': 'loaded',
      'analyze-start': 'loaded',
      'analyze-end': 'analyzed',
      'extend-start': 'analyzed',
      'extend-end': 'extended',
      'index-start': 'extended',
      'index-end': 'indexed',
      'finalize-start': 'indexed',
      'finalize-end': 'finalized',
      error: 'error'
    },
    lineUploadProgress: 0,
    showTableCard: null,
    draftMode: null,
    taskProgress: null,
    html: false
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.datasetId ? rootState.env.publicUrl + '/api/v1/datasets/' + state.datasetId : null,
    journalChannel: (state) => 'datasets/' + state.datasetId + '/journal',
    taskProgressChannel: (state) => 'datasets/' + state.datasetId + '/task-progress',
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
    hasPublicApplications: (state) => {
      return state.applications && !!state.applications.find(a => a.visibility === 'public')
    },
    qMode: (state) => {
      return state.dataset && state.dataset.count && state.dataset.count < 10000 ? 'complete' : 'simple'
    },
    availableMasters (state) {
      if (!state.remoteServices) return
      const masters = {}
      state.remoteServices.forEach(service => {
        service.actions
          .filter(a => !a.inputCollection && a.type === 'http://schema.org/SearchAction')
          .filter(a => a.output.filter(o => o.concept && o.concept !== 'http://www.w3.org/2000/01/rdf-schema#label').length === 1)
          .forEach(a => {
            const labelOutput = a.output.find(o => o.concept === 'http://www.w3.org/2000/01/rdf-schema#label')
            const keyOutput = a.output.find(o => o.concept && o.concept !== 'http://www.w3.org/2000/01/rdf-schema#label')
            const master = {
              id: service.id + '--' + a.id,
              title: a.summary,
              remoteService: service.id,
              action: a.id,
              'x-fromUrl': service.server + a.operation.path + '?q={q}',
              'x-itemKey': keyOutput.name,
              'x-itemTitle': labelOutput && labelOutput.name
            }
            masters[keyOutput.concept] = masters[keyOutput.concept] || []
            masters[keyOutput.concept].push(master)
          })
      })
      return masters
    },
    imageField (state) {
      return state.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    },
    labelField (state) {
      return state.dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label')
    },
    descriptionField (state) {
      return state.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org')
    },
    digitalDocumentField (state) {
      return state.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    },
    webPageField (state) {
      return state.dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/WebPage')
    }
  },
  mutations: {
    setAny (state, params) {
      for (const key in params) {
        Vue.set(state, key, params[key])
      }
    },
    patch (state, patch) {
      for (const key in patch) {
        Vue.set(state.dataset, key, patch[key])
      }
    },
    addJournalEvent (state, event) {
      if (!state.journal.find(e => e.date === event.date)) {
        state.journal.unshift(event)
      }
    }
  },
  actions: {
    async fetchInfo ({ commit, dispatch, getters }) {
      await dispatch('fetchDataset')
      await Promise.all([
        dispatch('fetchApplications'),
        dispatch('fetchVirtuals'),
        dispatch('fetchApiDoc'),
        dispatch('fetchDataFiles')
      ])
      if (getters.can('readJournal')) await dispatch('fetchJournal')
    },
    async fetchDataset ({ commit, state }) {
      const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { draft: state.draftMode, html: state.html } })
      const extensions = (dataset.extensions || []).map(ext => {
        ext.error = ext.error || ''
        ext.progress = ext.progress || 0
        ext.select = ext.select || []
        return ext
      })
      Vue.set(dataset, 'extensions', extensions)
      Vue.set(dataset, 'schema', dataset.schema || [])
      Vue.set(dataset, 'thumbnails', dataset.thumbnails || { resizeMode: 'crop', trim: false })
      Vue.set(dataset, 'publications', dataset.publications || [])
      Vue.set(dataset, 'publicationSites', dataset.publicationSites || [])
      if (dataset.isRest) {
        dataset.rest = dataset.rest || {}
        dataset.rest.ttl = dataset.rest.ttl || { active: false, prop: '_updatedAt', delay: { value: 30, unit: 'days' } }
        dataset.rest.historyTTL = dataset.rest.historyTTL || { active: false, delay: { value: 30, unit: 'days' } }
      }
      commit('setAny', { dataset })
      if (dataset.draftReason && dataset.draftReason.key === 'file-updated') {
        const validatedDataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`)
        commit('setAny', { validatedDataset })
      } else {
        commit('setAny', { validatedDataset: null })
      }
    },
    async fetchApplications ({ commit, state }) {
      const apps = await this.$axios.$get('api/v1/applications', { params: { dataset: state.dataset.id, size: 10000, select: 'id,title' } })
      if (state.dataset.extras && state.dataset.extras.reuses) {
        const ordered = state.dataset.extras.reuses.map(id => apps.results.find(a => a.id === id)).filter(a => a)
        const remaining = apps.results.filter(a => state.dataset.extras.reuses.indexOf(a.id) < 0)
        apps.results = [].concat(ordered, remaining)
      }
      commit('setAny', { nbApplications: apps.count, applications: apps.results })
    },
    async fetchVirtuals ({ commit, state }) {
      const virtuals = await this.$axios.$get('api/v1/datasets', { params: { children: state.dataset.id, size: 0 } })
      commit('setAny', { nbVirtualDatasets: virtuals.count })
    },
    async fetchApiDoc ({ commit, state }) {
      const api = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/api-docs.json`, { params: { draft: state.draftMode } })
      commit('setAny', { api })
    },
    async fetchJournal ({ commit, state }) {
      const journal = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/journal`, { params: { draft: state.draftMode } })
      commit('setAny', { journal })
    },
    async fetchDataFiles ({ commit, state }) {
      const dataFiles = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/data-files`, { params: { draft: state.draftMode } })
      commit('setAny', { dataFiles })
    },
    async fetchJsonSchema ({ commit, state }) {
      const jsonSchema = await this.$axios.$get(`api/v1/datasets/${state.datasetId}/schema`, { params: { mimeType: 'application/schema+json' } })
      commit('setAny', { jsonSchema })
    },
    async setId ({ commit, getters, dispatch, state }, { datasetId, draftMode, html, fetchInfo }) {
      dispatch('clear')
      commit('setAny', { datasetId, draftMode, html })
      if (fetchInfo !== false) await dispatch('fetchInfo')
    },
    subscribe ({ getters, dispatch, state, commit }) {
      eventBus.$emit('subscribe', getters.journalChannel)
      eventBus.$on(getters.journalChannel, async event => {
        if (event.type.endsWith('-start')) commit('setAny', { taskProgress: { task: event.type.replace('-start', '') } })
        if (event.type === 'finalize-end') {
          commit('setAny', { taskProgress: null })
          eventBus.$emit('notification', { type: 'success', msg: 'Le jeu de données a été traité en fonction de vos dernières modifications et est prêt à être utilisé ou édité de nouveau.' })
        }
        if (event.type === 'error') {
          commit('setAny', { taskProgress: null })
          eventBus.$emit('notification', { error: event.data, msg: 'Le service a rencontré une erreur pendant le traitement du jeu de données:' })
        }

        if (event.type === 'draft-validated' || event.type === 'draft-cancelled' || event.type === 'data-updated') {
          return dispatch('fetchInfo')
        }

        dispatch('addJournalEvent', event)

        // refresh dataset with relevant parts when receiving journal event
        if (state.eventStates[event.type] && state.dataset) {
          commit('patch', { status: state.eventStates[event.type] })
        }
        if (event.type === 'analyze-end' || event.type === 'extend-start') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema', draft: 'true' } })
          commit('patch', { schema: dataset.schema })
        }
        if (event.type === 'finalize-end') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema,bbox', draft: 'true' } })
          commit('patch', { schema: dataset.schema, bbox: dataset.bbox, finalizedAt: dataset.finalizedAt })
          if (state.jsonSchema) dispatch('fetchJsonSchema')
        }
        if (event.type === 'publication') {
          const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'publications', draft: 'true' } })
          commit('patch', { publications: dataset.publications })
        }
        dispatch('fetchApiDoc')
      })
      eventBus.$emit('subscribe', getters.taskProgressChannel)
      eventBus.$on(getters.taskProgressChannel, async taskProgress => {
        commit('setAny', { taskProgress })
      })
    },
    clear ({ commit, state, getters }) {
      if (state.datasetId) {
        eventBus.$emit('unsubscribe', getters.journalChannel)
        eventBus.$emit('unsubscribe', getters.taskProgressChannel)
      }
      commit('setAny', { datasetId: null, dataset: null, api: null, journal: [], showTableCard: null, remoteServices: null })
    },
    async patch ({ commit, getters, dispatch, state }, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        const patched = await this.$axios.patch(getters.resourceUrl, patch, { params: { draft: state.draftMode } })
        if (!silent) eventBus.$emit('notification', 'Le jeu de données a été mis à jour.')
        return patched.data
      } catch (error) {
        if (error.status === 409) {
          eventBus.$emit('notification', 'Le jeu de données est en cours de traitement et votre modification n\'a pas pu être appliquée. Veuillez essayer de nouveau un peu plus tard.')
        } else {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour du jeu de données' })
        }
        return false
      }
    },
    async patchAndCommit ({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) commit('patch', patch)
    },
    async patchAndApplyRemoteChange ({ commit, getters, dispatch }, patch) {
      const patched = await dispatch('patch', patch)
      if (patched) {
        Object.keys(patch).forEach(k => {
          patch[k] = patched[k]
        })
        commit('patch', patch)
      }
    },
    async reindex ({ state, dispatch }) {
      await this.$axios.$post(`api/v1/datasets/${state.dataset.id}/_reindex`, null, { params: { draft: state.draftMode } })
    },
    async cancelDraft ({ state, dispatch }) {
      await this.$axios.$delete(`api/v1/datasets/${state.dataset.id}/draft`)
    },
    async validateDraft ({ state, dispatch }) {
      await this.$axios.$post(`api/v1/datasets/${state.dataset.id}/draft`)
    },
    async remove ({ state, getters, dispatch }) {
      try {
        await this.$axios.delete(getters.resourceUrl)
        eventBus.$emit('notification', `Le jeu de données ${state.dataset.title || state.dataset.id} a été supprimé`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression du jeu de données' })
      }
    },
    addJournalEvent ({ commit }, event) {
      commit('addJournalEvent', event)
    },
    async fetchRemoteServices ({ getters, commit, state }) {
      if (state.remoteServices) return
      let remoteServices = []
      const data = await this.$axios.$get('api/v1/remote-services', {
        params: { size: 1000, privateAccess: `${state.dataset.owner.type}:${state.dataset.owner.id}` }
      })
      remoteServices = data.results
      commit('setAny', { remoteServices })
    },
    async changeOwner ({ commit, state }, owner) {
      try {
        await this.$axios.$put(`api/v1/datasets/${state.dataset.id}/owner`, owner)
        commit('patch', { owner })
        window.location.reload()
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant le changement de propriétaire' })
      }
    },
    async saveLine ({ commit, state, getters }, { file, line, id }) {
      const options = {
        onUploadProgress: (e) => {
          if (e.lengthComputable) {
            state.lineUploadProgress = (e.loaded / e.total) * 100
          }
        }
      }
      const formData = new FormData()
      if (file) formData.append('attachment', file)

      state.dataset.schema.filter(f => !f['x-calculated'] && !f['x-extension']).forEach(f => {
        if (line[f.key] !== null && line[f.key] !== undefined) formData.append([f.key], line[f.key])
      })
      if (id) {
        formData.append('_id', id)
      }

      try {
        const res = await this.$axios.$post(getters.resourceUrl + '/lines', formData, options)
        return res
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'enregistrement de la ligne\'' })
      }
      state.lineUploadProgress = 0
    }
  }
})
