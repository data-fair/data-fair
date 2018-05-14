import Vue from 'vue'
import Vuex from 'vuex'
import dataset from './dataset'
import remoteService from './remote-service'
import application from './application'

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
      }
    },
    mutations: {
      setAny(state, params) {
        Object.assign(state, params)
      },
      ownerLicenses(state, payload) {
        Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
      }
    },
    actions: {
      login({state}) {
        const path = this.$router.currentRoute.path
        window.location.href = `${state.env.publicUrl}/api/v1/session/login?redirect=${state.env.publicUrl}${path}?id_token=`
      },
      async logout({commit}) {
        await this.$axios.post('api/v1/session/logout')
        commit('setAny', {user: null})
        this.$router.push('/')
      },
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
      }
    }
  })
}
