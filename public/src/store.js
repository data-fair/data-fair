import Vue from 'vue'
import Vuex from 'vuex'
import jwtDecode from 'jwt-decode'

Vue.use(Vuex)

module.exports = new Vuex.Store({
  state: {
    user: null,
    notification: '',
    notificationError: '',
    vocabulary: null
  },
  mutations: {
    user(state, account) {
      if (account) {
        account.isAdmin = account.roles && account.roles.indexOf('administrator') >= 0
      }
      state.user = account
    },
    notification(state, notification) {
      state.notification = notification
    },
    notificationError(state, notificationError) {
      state.notificationError = notificationError
    },
    vocabulary(state, vocab) {
      state.vocabulary = vocab
    }
  },
  actions: {
    logout(context) {
      Vue.cookie.delete('id_token')
      context.commit('user')
      global.router.push('/')
    },
    async userAccount(context) {
      const jwt = Vue.cookie.get('id_token')
      if (jwt) {
        const user = jwtDecode(jwt)
        context.commit('user', user)
        const response = await Vue.http.get(window.CONFIG.directoryUrl + '/api/users/' + user.id)
        context.commit('user', Object.assign(response.data, {organizations: user.organizations}))
      } else {
        context.commit('user')
      }
    },
    notify(context, notification) {
      context.commit('notification', notification)
    },
    notifyError(context, notification) {
      context.commit('notificationError', notification)
    },
    async fetchVocabulary(context) {
      if (context.state.vocabulary) return
      const vocabulary = {}
      const results = await Vue.http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary')
      results.data.forEach(term => {
        term.identifiers.forEach(id => { vocabulary[id] = term })
      })
      context.commit('vocabulary', vocabulary)
    }
  }
})
