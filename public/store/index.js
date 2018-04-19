import Vue from 'vue'
import Vuex from 'vuex'
import jwtDecode from 'jwt-decode'
import dataset from './dataset'
import remoteService from './remote-service'
import application from './application'
import Cookie from 'js-cookie'
const cookieparser = require('cookieparser')

Vue.use(Vuex)

export default () => {
  return new Vuex.Store({
    modules: {dataset, remoteService, application},
    state: {
      user: null,
      vocabulary: null,
      vocabularyArray: [],
      licenses: {},
      env: {}
    },
    getters: {
      ownerLicenses: (state) => (owner) => {
        return state.licenses[owner.type + '/' + owner.id]
      },
      loginUrl: state => {
        const path = (this.$route && this.$route.path) || ''
        return `${state.env.directoryUrl}/login?redirect=${state.env.publicUrl}${path}?id_token=`
      }
    },
    mutations: {
      setJwt(state, jwt) {
        this.$axios.setToken(jwt, 'Bearer')
        state.jwt = jwt
      },
      setUser(state, user) {
        if (user && user.roles && user.roles.includes('administrator')) user.isAdmin = true
        state.user = user
      },
      setAny(state, params) {
        Object.assign(state, params)
      },
      ownerLicenses(state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      }
    },
    actions: {
      logout(context) {
        context.commit('setJwt')
        Cookie.remove('id_token')
        context.commit('setUser')
        context.commit('setUserOrganizations', {})
        this.$router.push('/')
      },
      async fetchVocabulary({state, commit}) {
        if (state.vocabulary) return
        const vocabulary = {}
        const vocabularyArray = await this.$axios.$get(state.env.publicUrl + '/api/v1/vocabulary')
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
        const licenses = await this.$axios.$get(state.env.publicUrl + '/api/v1/settings/' + owner.type + '/' + owner.id + '/licenses')
        commit('ownerLicenses', {owner, licenses})
      },
      nuxtServerInit({commit, dispatch}, {req, env, app}) {
        commit('setAny', {env: {...env}})
        let accessToken = null
        if (req.headers.cookie) accessToken = cookieparser.parse(req.headers.cookie).id_token
        commit('setJwt', accessToken)
        if (accessToken) {
          const user = jwtDecode(accessToken)
          commit('setUser', user)
        }
      }
    }
  })
}
