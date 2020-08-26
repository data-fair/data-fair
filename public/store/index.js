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
      vocabularyTags: [],
      vocabularyItems: [],
      licenses: {},
      topics: {},
      env: {},
      searchQueries: {},
      projections: null,
      propertyTypes,
      breadcrumbsRouteName: null,
      breadcrumbItems: null,
    },
    getters: {
      ownerLicenses: (state) => (owner) => {
        return state.licenses[owner.type + '/' + owner.id]
      },
      ownerTopics: (state) => (owner) => {
        return state.topics[owner.type + '/' + owner.id]
      },
      searchQuery: (state) => (type) => {
        const searchQuery = Object.assign({}, state.searchQueries[type])
        if (searchQuery.owner === undefined && state.user) searchQuery.owner = `user:${state.user.id}`
        return searchQuery
      },
      propTypeTitle: (state) => (prop) => {
        if (prop.type === 'object') return 'Objet JSON'
        if (prop.type === 'array') return 'Tableau JSON'
        if (prop.format) {
          const type = propertyTypes.find(p => p.type === prop.type && p.format === prop.format)
          if (type) return type.title
        }
        return propertyTypes.find(p => p.type === prop.type).title
      },
      canContrib(state, getters) {
        const activeAccount = getters['session/activeAccount']
        if (activeAccount.type === 'user') return true
        const role = state.session.user.organization.role
        return role === state.env.adminRole || role === state.env.contribRole
      },
      canAdmin(state, getters) {
        const activeAccount = getters['session/activeAccount']
        if (activeAccount.type === 'user') return true
        const role = state.session.user.organization.role
        return role === state.env.adminRole
      },
    },
    mutations: {
      setAny(state, params) {
        Object.assign(state, params)
      },
      ownerLicenses(state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      },
      ownerTopics(state, payload) {
        Vue.set(state.topics, payload.owner.type + '/' + payload.owner.id, payload.topics)
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
        const vocabularyTags = []
        commit('setAny', { vocabularyArray })
        vocabularyArray.forEach(term => {
          if (!vocabularyTags.includes(term.tag)) vocabularyTags.push(term.tag)
          term.identifiers.forEach(id => { vocabulary[id] = term })
        })
        commit('setAny', { vocabularyTags })
        commit('setAny', { vocabulary })
        const vocabularyItems = []
        vocabularyArray
          .filter(term => !term.tag)
          .forEach(term => {
            vocabularyItems.push({ text: term.title, value: term.identifiers[0] })
          })
        vocabularyTags.forEach(tag => {
          vocabularyItems.push({ divider: true })
          vocabularyItems.push({ header: tag })
          vocabularyArray
            .filter(term => term.tag === tag)
            .forEach(term => {
              vocabularyItems.push({ text: term.title, value: term.identifiers[0], tag, description: term.description })
            })
        })
        commit('setAny', { vocabularyItems })
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
      async fetchTopics({ getters, state, commit }, owner) {
        if (getters.ownerTopics(owner)) return
        const topics = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/topics')
        commit('ownerTopics', { owner, topics })
      },
      searchQuery({ commit }, params) {
        commit('setSearchQuery', params)
      },
      breadcrumbs({ commit }, breadcrumbItems) {
        commit('setAny', { breadcrumbItems, breadcrumbsRouteName: this.$router.currentRoute.name })
      },
    },
  })
}
