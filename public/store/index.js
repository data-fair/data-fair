import Vue from 'vue'
import Vuex from 'vuex'
import {sessionStore} from '@koumoul/sd-vue'
import dataset from './dataset'
import remoteService from './remote-service'
import application from './application'
import catalog from './catalog'

Vue.use(Vuex)

export default () => {
  return new Vuex.Store({
    modules: {dataset, remoteService, application, catalog, session: sessionStore},
    state: {
      user: null,
      vocabulary: null,
      vocabularyArray: [],
      licenses: {},
      env: {},
      searchQueries: {}
    },
    getters: {
      ownerLicenses: (state) => (owner) => {
        return state.licenses[owner.type + '/' + owner.id]
      },
      searchQuery: (state) => (type) => {
        const searchQuery = Object.assign({}, state.searchQueries[type])
        if (searchQuery.owner === undefined && state.user) searchQuery.owner = `user:${state.user.id}`
        return searchQuery
      }
    },
    mutations: {
      setAny(state, params) {
        Object.assign(state, params)
      },
      ownerLicenses(state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      },
      setSearchQuery(state, {type, query}) {
        Vue.set(state.searchQueries, type, query)
      }
    },
    actions: {
      async fetchVocabulary({state, commit}) {
        if (state.vocabulary) return
        const vocabulary = {}
        const vocabularyArray = await this.$axios.$get('api/v1/vocabulary')
        commit('setAny', {vocabularyArray})
        vocabularyArray.forEach(term => {
          term.identifiers.forEach(id => {
            vocabulary[id] = term
          })
        })
        commit('setAny', {vocabulary})
      },
      async fetchLicenses({getters, state, commit}, owner) {
        if (getters.ownerLicenses(owner)) return
        const licenses = await this.$axios.$get('api/v1/settings/' + owner.type + '/' + owner.id + '/licenses')
        commit('ownerLicenses', {owner, licenses})
      },
      nuxtServerInit({commit, dispatch}, {req, env, app}) {
        commit('setAny', {env: {...env}, user: req.user})
        dispatch('session/init', {user: req.user, baseUrl: env.publicUrl + '/api/v1/session'})
      },
      searchQuery({commit}, params) {
        commit('setSearchQuery', params)
      }
    }
  })
}
