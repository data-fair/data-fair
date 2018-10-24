import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export default () => {
  return new Vuex.Store({
    state: {
      env: {}
    },
    mutations: {
      setAny(state, params) {
        Object.assign(state, params)
      }
    },
    actions: {
      nuxtServerInit({ commit, dispatch }, { req, env, app }) {
        commit('setAny', { env: { ...env } })
      }
    }
  })
}
