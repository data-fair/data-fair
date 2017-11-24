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
    login(context, email) {
      if (!email) {
        return global.vue.$notify({
          type: 'warning',
          text: 'Vous n\'avez pas saisi d\'email'
        })
      }
      Vue.http.post(window.public_url + '/api/v1/auth/passwordless', {
        email: email
      }).then((response) => {
        global.vue.$notify({
          type: 'success',
          text: 'Un email vous a été envoyé à cette adresse : ' + email
        })
      }, (error) => {
        global.vue.$notify({
          type: 'danger',
          text: `Une erreur est survenue lors de l'envoi d'un email : ${error.body}<br>
          Si le problème persiste merci de nous contacter à <a href="contact@dawizz.fr">contact@dawizz.fr</a>`
        })
      })
    },
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
        Vue.http.get(window.koumoul_url + '/api/accounts/' + user._id).then(response => {
          context.commit('user', Object.assign(response.data, {organizations: user.organizations}))
        })
      } else {
        context.commit('user')
      }
    }
  }
})
