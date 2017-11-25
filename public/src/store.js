import Vue from 'vue'
import Vuex from 'vuex'
import jwtDecode from 'jwt-decode'

Vue.use(Vuex)

module.exports = new Vuex.Store({
  state: {
    user: null
  },
  mutations: {
    user(state, account) {
      if (account) {
        account.isAdmin = account.roles && account.roles.indexOf('administrator') >= 0
      }
      state.user = account
    }
  },
  actions: {
    logout(context) {
      localStorage.removeItem('id_token')
      context.commit('user')
      global.router.push('/')
    },
    userAccount(context) {
      const jwt = localStorage.getItem('id_token')
      if (jwt) {
        const user = jwtDecode(jwt)
        context.commit('user', user)
        Vue.http.get(window.CONFIG.directoryUrl + '/api/accounts/' + user._id).then(response => {
          context.commit('user', Object.assign(response.data, {organizations: user.organizations}))
        })
      } else {
        context.commit('user')
      }
    }
  }
})
