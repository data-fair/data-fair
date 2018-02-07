import Vue from 'vue'
import Vuex from 'vuex'
import jwtDecode from 'jwt-decode'

import dataset from './dataset.js'

Vue.use(Vuex)

module.exports = new Vuex.Store({
  modules: {dataset},
  state: {
    user: null,
    userOrganizations: null,
    notification: '',
    notificationError: '',
    vocabulary: null,
    vocabularyArray: [],
    usersInfo: {},
    licenses: {}
  },
  getters: {
    ownerLicenses: (state) => (owner) => {
      return state.licenses[owner.type + '/' + owner.id]
    }
  },
  mutations: {
    user(state, account) {
      if (account) {
        account.isAdmin = account.roles && account.roles.indexOf('administrator') >= 0
      }
      state.user = account
    },
    setAny(state, params) {
      Object.assign(state, params)
    },
    userOrganizations(state, userOrganizations) {
      state.userOrganizations = userOrganizations
    },
    userInfo(state, userInfo) {
      state.usersInfo[userInfo.id] = userInfo
    },
    ownerLicenses(state, payload) {
      Vue.set(state.licenses, payload.owner.type + '/' + payload.owner.id, payload.licenses)
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
        Vue.http.get(window.CONFIG.directoryUrl + '/api/users/' + user.id).then(response => {
          context.commit('user', Object.assign(response.data, {organizations: user.organizations}))
        })
        Vue.http.get(window.CONFIG.directoryUrl + '/api/organizations?is-member=true').then(response => {
          context.commit('setAny', {userOrganizations: Object.assign({}, ...response.data.results.map(o => ({[o.id]: o})))})
        })
      } else {
        context.commit('user')
        context.commit('setAny', {userOrganizations: null})
      }
    },
    notify(context, notification) {
      context.commit('setAny', {notification})
    },
    notifyError(context, notificationError) {
      context.commit('setAny', {notificationError})
    },
    async fetchVocabulary(context) {
      if (context.state.vocabulary) return
      const vocabulary = {}
      const vocabularyArray = (await Vue.http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary')).data
      context.commit('setAny', {vocabularyArray})
      vocabularyArray.forEach(term => {
        term.identifiers.forEach(id => {
          vocabulary[id] = term
        })
      })
      context.commit('setAny', {vocabulary})
    },
    async fetchUsers(context, ids) {
      const missingIds = ids.filter(id => !context.state.usersInfo[id])
      if (missingIds.length === 0) return
      const res = await Vue.http.get(window.CONFIG.directoryUrl + '/api/users', {params: {ids: missingIds}})
      res.data.results.forEach(user => context.commit('userInfo', user))
    },
    async fetchLicenses(context, owner) {
      if (context.getters.ownerLicenses(owner)) return
      const res = await Vue.http.get(window.CONFIG.publicUrl + '/api/v1/settings/' + owner.type + '/' + owner.id + '/licenses')
      context.commit('ownerLicenses', {owner, licenses: res.body})
    }
  }
})
