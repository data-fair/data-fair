import Vue from 'vue'
import Vuex from 'vuex'
import { sessionStoreBuilder } from '@koumoul/sd-vue/src'
import dataset from './dataset'
import remoteService from './remote-service'
import application from './application'
import catalog from './catalog'

Vue.use(Vuex)

const propertyTypes = [
  { type: 'string', title: 'Texte' },
  { type: 'string', maxLength: 100000, title: 'Texte long' },
  { type: 'string', format: 'date', title: 'Date' },
  { type: 'string', format: 'date-time', title: 'Date et heure' },
  { type: 'integer', title: 'Nombre entier' },
  { type: 'number', title: 'Nombre' },
  { type: 'boolean', title: 'Booléen' },
]

export default () => {
  return new Vuex.Store({
    modules: {
      dataset: dataset(),
      remoteService: remoteService(),
      application: application(),
      catalog: catalog(),
      session: sessionStoreBuilder(),
    },
    state: {
      vocabulary: null,
      vocabularyArray: [],
      licenses: {},
      env: {},
      searchQueries: {},
      projections: null,
      propertyTypes,
    },
    getters: {
      ownerLicenses: (state) => (owner) => {
        return state.licenses[owner.type + '/' + owner.id]
      },
      searchQuery: (state) => (type) => {
        const searchQuery = Object.assign({}, state.searchQueries[type])
        if (searchQuery.owner === undefined && state.user) searchQuery.owner = `user:${state.user.id}`
        return searchQuery
      },
    },
    mutations: {
      setAny(state, params) {
        Object.assign(state, params)
      },
      ownerLicenses(state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      },
      setSearchQuery(state, { type, query }) {
        Vue.set(state.searchQueries, type, query)
      },
    },
    actions: {
      async fetchVocabulary({ state, commit }) {
        if (state.vocabulary) return
        const vocabulary = {}
        const vocabularyArray = await this.$axios.$get('api/v1/vocabulary')
        commit('setAny', { vocabularyArray })
        vocabularyArray.forEach(term => {
          term.identifiers.forEach(id => {
            vocabulary[id] = term
          })
        })
        commit('setAny', { vocabulary })
      },
      async fetchProjections({ state, commit }) {
        if (state.projections) return
        const projections = await this.$axios.$get('api/v1/projections')
        commit('setAny', { projections })
      },
      async fetchLicenses({ getters, state, commit }, owner) {
        if (getters.ownerLicenses(owner)) return
        const licenses = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/licenses')
        commit('ownerLicenses', { owner, licenses })
      },
      searchQuery({ commit }, params) {
        commit('setSearchQuery', params)
      },
    },
  })
}
