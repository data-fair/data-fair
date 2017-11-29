import Vue from 'vue'
import Vuex from 'vuex'
import jwtDecode from 'jwt-decode'

Vue.use(Vuex)

module.exports = new Vuex.Store({
  state: {
    user: null,
    notification: '',
    notificationError: ''
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
    }
  },
  actions: {
    logout(context) {
      Vue.cookie.delete('id_token')
      context.commit('user')
      global.router.push('/')
    },
    userAccount(context) {
      const jwt = Vue.cookie.get('id_token')
      if (jwt) {
        const user = jwtDecode(jwt)
        context.commit('user', user)
        Vue.http.get(window.CONFIG.directoryUrl + '/api/users/' + user.id).then(response => {
          context.commit('user', Object.assign(response.data, {organizations: user.organizations}))
        })
      } else {
        context.commit('user')
      }
    },
    notify(context, notification) {
      context.commit('notification', notification)
    },
    notifyError(context, notification) {
      context.commit('notificationError', notification)
    }
  }
})
