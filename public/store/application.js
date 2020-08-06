// A module of the store for the currently worked on application
// Used in the application vue and all its tabs and their components
import Vue from 'vue'
import eventBus from '~/event-bus'

export default () => ({
  namespaced: true,
  state: {
    applicationId: null,
    application: null,
    api: null,
    journal: [],
    config: null,
    configDraft: null,
    nbSessions: null,
    datasets: null,
    prodBaseApp: null,
  },
  getters: {
    resourceUrl: (state, getters, rootState) => state.applicationId ? rootState.env.publicUrl + '/api/v1/applications/' + state.applicationId : null,
    resourcePublicUrl: (state, getters, rootState) => rootState.env.applicationUrlTemplate && rootState.env.applicationUrlTemplate.replace('{id}', state.applicationId),
    can: (state, getters, rootState) => (operation) => {
      if (rootState.session && rootState.session.user && rootState.session.user.adminMode) return true
      return (state.application && state.application.userPermissions.includes(operation))
    },
    journalChannel: (state) => 'applications/' + state.applicationId + '/journal',
    draftErrorChannel: (state) => 'applications/' + state.applicationId + '/draft-error',
    applicationLink: (state, getters, rootState) => {
      if (state.application) return rootState.env.publicUrl + '/app/' + state.application.id
    },
    hasPrivateDatasets: (state) => {
      return state.datasets && !!state.datasets.find(a => a.visibility === 'private' || a.visibility === 'protected')
    },
  },
  mutations: {
    setAny(state, params) {
      for (const key in params) {
        Vue.set(state, key, params[key])
      }
    },
    patch(state, patch) {
      for (const key in patch) {
        Vue.set(state.application, key, patch[key])
      }
    },
    addJournalEvent(state, event) {
      if (!state.journal.find(e => e.date === event.date)) {
        state.journal.unshift(event)
      }
    },
  },
  actions: {
    async fetchInfo({ commit, dispatch, getters, state }) {
      try {
        await dispatch('fetchApplication')
        await Promise.all([
          dispatch('fetchAPI'),
          dispatch('fetchJournal'),
          dispatch('fetchActiveSessions'),
          dispatch('readConfig'),
          dispatch('fetchProdBaseApp'),
        ])
        await dispatch('fetchDatasets')
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des informations de l\'application' })
      }
    },
    async fetchApplication({ commit, state }) {
      const application = await this.$axios.$get(`api/v1/applications/${state.applicationId}`)
      Vue.set(application, 'publications', application.publications || [])
      commit('setAny', { application })
    },
    async fetchProdBaseApp({ commit, state }) {
      const prodBaseApp = await this.$axios.$get(`api/v1/applications/${state.applicationId}/base-application`)
      commit('setAny', { prodBaseApp })
    },
    async fetchAPI({ commit, state }) {
      const api = await this.$axios.$get(`api/v1/applications/${state.applicationId}/api-docs.json`)
      commit('setAny', { api })
    },
    async fetchJournal({ commit, state }) {
      const journal = await this.$axios.$get(`api/v1/applications/${state.applicationId}/journal`)
      commit('setAny', { journal })
    },
    async fetchActiveSessions({ commit, state }) {
      const activeSessions = await this.$axios.$get(`api/v1/applications/${state.applicationId}/active-sessions`)
      commit('setAny', { nbSessions: activeSessions.count })
    },
    async setId({ commit, getters, dispatch, state }, applicationId) {
      commit('setAny', { applicationId })
      await dispatch('fetchInfo')
    },
    subscribe({ commit, getters, dispatch }) {
      eventBus.$emit('subscribe', getters.journalChannel)
      eventBus.$on(getters.journalChannel, event => {
        if (event.type === 'error') {
          commit('patch', { errorMessage: event.data, status: 'error' })
        }
        dispatch('addJournalEvent', event)
      })

      eventBus.$emit('subscribe', getters.draftErrorChannel)
      eventBus.$on(getters.draftErrorChannel, event => {
        commit('patch', { errorMessageDraft: event.message })
      })
    },
    clear({ commit, state }) {
      commit('setAny', { applicationId: null, application: null })
    },
    async patch({ commit, getters, dispatch }, patch) {
      try {
        const silent = patch.silent
        delete patch.silent
        await this.$axios.patch(getters.resourceUrl, patch)
        if (!silent) eventBus.$emit('notification', 'La visualisation a bien été mise à jour.')
        return true
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour de la visualisation:' })
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
        eventBus.$emit('notification', `La visualisation ${state.application.title} a bien été supprimée.`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la suppression de la visualisation:' })
      }
    },
    addJournalEvent({ commit }, event) {
      commit('addJournalEvent', event)
    },
    async readConfig({ state, commit, getters }) {
      const config = await this.$axios.$get(getters.resourceUrl + '/configuration')
      commit('setAny', { config })
      return config
    },
    async fetchDatasets({ commit, state }) {
      const datasetsIds = ((state.config && state.config.datasets) || [])
        .map(d => d.id || d.href.split('/').pop())
      if (datasetsIds.length) {
        const res = await this.$axios.$get('api/v1/datasets', { params: { id: datasetsIds.join(','), select: 'id,title,visibility' } })
        commit('setAny', { datasets: res.results })
      } else {
        commit('setAny', { datasets: [] })
      }
    },
    async writeConfig({ state, commit, getters, dispatch }, config) {
      try {
        await this.$axios.$put(getters.resourceUrl + '/configuration', config)
        commit('setAny', { config: JSON.parse(JSON.stringify(config)) })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'écriture de la visualisation:' })
      }
    },
    async readConfigDraft({ state, commit, getters }) {
      const configDraft = await this.$axios.$get(getters.resourceUrl + '/configuration-draft')
      commit('setAny', { configDraft })
      return configDraft
    },
    async writeConfigDraft({ state, commit, getters, dispatch }, configDraft) {
      try {
        await this.$axios.$put(getters.resourceUrl + '/configuration-draft', configDraft)
        commit('setAny', { configDraft: JSON.parse(JSON.stringify(configDraft)) })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'écriture du brouillon de visualisation:' })
      }
    },
    async cancelConfigDraft({ state, commit, getters, dispatch }) {
      try {
        await this.$axios.$delete(getters.resourceUrl + '/configuration-draft')
        commit('setAny', { configDraft: state.config })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'écriture du brouillon de visualisation:' })
      }
    },
    async changeOwner({ commit, state }, owner) {
      try {
        await this.$axios.$put(`api/v1/applications/${state.application.id}/owner`, owner)
        commit('patch', { owner })
        eventBus.$emit('notification', `L'application ${state.application.title} a changé de propriétaire`)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant le changement de propriétaire' })
      }
    },
  },
})
