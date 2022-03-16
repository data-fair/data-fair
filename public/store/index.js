import Vue from 'vue'
import Vuex from 'vuex'
import { sessionStoreBuilder } from '@koumoul/sd-vue/src'
import dataset from './dataset'
import remoteService from './remote-service'
import application from './application'
import catalog from './catalog'
import tinycolor from 'tinycolor2'

Vue.use(Vuex)

const propertyTypes = [
  { type: 'string', title: 'Texte', icon: 'mdi-text-short' },
  { type: 'string', maxLength: 100000, title: 'Texte long', icon: 'mdi-text-subject' },
  { type: 'string', format: 'date', title: 'Date', icon: 'mdi-calendar' },
  { type: 'string', format: 'date-time', title: 'Date et heure', icon: 'mdi-clock-outline' },
  { type: 'integer', title: 'Nombre entier', icon: 'mdi-numeric' },
  { type: 'number', title: 'Nombre', icon: 'mdi-numeric' },
  { type: 'boolean', title: 'Booléen', icon: 'mdi-checkbox-marked-circle-outline' }
]

export default () => {
  return new Vuex.Store({
    modules: {
      dataset: dataset(),
      remoteService: remoteService(),
      application: application(),
      catalog: catalog(),
      session: sessionStoreBuilder()
    },
    state: {
      vocabulary: null,
      vocabularyArray: [],
      vocabularyTags: [],
      vocabularyItems: [],
      licenses: {},
      topics: {},
      publicationSites: {},
      env: {},
      searchQueries: {},
      projections: null,
      propertyTypes,
      breadcrumbsRouteName: null,
      breadcrumbItems: null,
      limits: null,
      accepted: [
        '.csv',
        '.geojson',
        '.gpkg',
        '.zip',
        '.ods',
        '.fods',
        '.xlsx',
        '.xls',
        '.dbf',
        '.txt',
        '.dif',
        '.tsv',
        '.kml',
        '.kmz',
        '.xml',
        '.gpx',
        '.ics'
      ]
    },
    getters: {
      ownerLicenses: (state) => (owner) => {
        return state.licenses[owner.type + '/' + owner.id]
      },
      ownerTopics: (state) => (owner) => {
        return state.topics[owner.type + '/' + owner.id]
      },
      ownerPublicationSites: (state) => (owner) => {
        return state.publicationSites[owner.type + '/' + owner.id]
      },
      activeAccountPublicationSitesById: (state, getters) => {
        const activeAccount = getters['session/activeAccount']
        return activeAccount && state.publicationSites[activeAccount.type + '/' + activeAccount.id]
          .reduce((a, ps) => { a[ps.type + ':' + ps.id] = ps; return a }, {})
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
      propTypeIcon: (state) => (prop) => {
        if (prop.type === 'object') return 'mdi-code-braces'
        if (prop.type === 'array') return 'mdi-code-array'
        if (prop.format) {
          const type = propertyTypes.find(p => p.type === prop.type && p.format === prop.format)
          if (type) return type.icon
        }
        return propertyTypes.find(p => p.type === prop.type).icon
      },
      canContrib (state, getters) {
        const activeAccount = getters['session/activeAccount']
        if (!activeAccount) return false
        if (activeAccount.type === 'user') return true
        const role = state.session.user.organization.role
        return role === state.env.adminRole || role === state.env.contribRole
      },
      canAdmin (state, getters) {
        const activeAccount = getters['session/activeAccount']
        if (!activeAccount) return false
        if (activeAccount.type === 'user') return true
        const role = state.session.user.organization.role
        return role === state.env.adminRole
      },
      missingSubscription (state) {
        return !!(state.limits && state.limits.defaults && state.env.subscriptionUrl)
      },
      lightPrimary5 (state) {
        return tinycolor(state.env.theme.colors.primary).brighten(5).toHexString()
      },
      lightPrimary10 (state) {
        return tinycolor(state.env.theme.colors.primary).brighten(10).toHexString()
      },
      darkPrimary5 (state) {
        return tinycolor(state.env.theme.colors.primary).darken(5).toHexString()
      },
      darkPrimary10 (state) {
        return tinycolor(state.env.theme.colors.primary).darken(10).toHexString()
      },
      lightAccent10 (state) {
        return tinycolor(state.env.theme.colors.accent).brighten(10).toHexString()
      },
      darkAccent10 (state) {
        return tinycolor(state.env.theme.colors.accent).darken(10).toHexString()
      }
    },
    mutations: {
      setAny (state, params) {
        Object.assign(state, params)
      },
      ownerLicenses (state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      },
      ownerTopics (state, payload) {
        if (payload.topics) {
          for (const topic of payload.topics) {
            if (topic.icon) delete topic.icon.svg
          }
        }
        Vue.set(state.topics, payload.owner.type + '/' + payload.owner.id, payload.topics)
      },
      ownerPublicationSites (state, payload) {
        Vue.set(state.publicationSites, payload.owner.type + '/' + payload.owner.id, payload.publicationSites)
      },
      setSearchQuery (state, { type, query }) {
        Vue.set(state.searchQueries, type, query)
      }
    },
    actions: {
      async fetchLimits ({ getters, commit }) {
        const activeAccount = getters['session/activeAccount']
        if (!activeAccount) return
        const limits = await this.$axios.$get(`api/v1/limits/${activeAccount.type}/${activeAccount.id}`)
        commit('setAny', { limits })
      },
      async fetchVocabulary ({ state, commit }, force = false) {
        if (state.vocabulary && !force) return
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
            vocabularyItems.push({ text: term.title, value: term.identifiers[0], type: term.type, format: term.format })
          })
        vocabularyTags.forEach(tag => {
          vocabularyItems.push({ divider: true })
          vocabularyItems.push({ header: tag })
          vocabularyArray
            .filter(term => term.tag === tag)
            .forEach(term => {
              vocabularyItems.push({ text: term.title, value: term.identifiers[0], tag, description: term.description, type: term.type, format: term.format })
            })
        })
        commit('setAny', { vocabularyItems })
      },
      async fetchProjections ({ state, commit }) {
        if (state.projections) return
        const projections = await this.$axios.$get('api/v1/projections')
        commit('setAny', { projections })
      },
      async fetchLicenses ({ getters, state, commit }, owner) {
        if (getters.ownerLicenses(owner)) return
        const licenses = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/licenses')
        commit('ownerLicenses', { owner, licenses })
      },
      async fetchTopics ({ getters, state, commit }, owner) {
        if (getters.ownerTopics(owner)) return
        const topics = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/topics')
        commit('ownerTopics', { owner, topics })
      },
      async fetchPublicationSites ({ getters, state, commit }, owner) {
        if (getters.ownerPublicationSites(owner)) return
        const publicationSites = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/publication-sites')
        commit('ownerPublicationSites', { owner, publicationSites })
      },
      searchQuery ({ commit }, params) {
        commit('setSearchQuery', params)
      },
      breadcrumbs ({ commit }, breadcrumbItems) {
        commit('setAny', { breadcrumbItems, breadcrumbsRouteName: this.$router.currentRoute.name })
      }
    }
  })
}
