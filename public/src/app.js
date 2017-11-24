import Vue from 'vue'
import VueMaterial from 'vue-material'
import 'vue-material/dist/vue-material.css'
import VueResource from 'vue-resource'
import VueRouter from 'vue-router'
// import VueCookie from 'vue-cookie'
// import VueAnalytics from 'vue-ua'

import routes from './routes.js'
import store from './store.js'

import App from './App.vue'

Vue.use(VueMaterial)
Vue.use(VueResource)
Vue.use(VueRouter)
// Vue.use(VueCookie)

Vue.material.registerTheme('default', {
  primary: {
    color: 'teal',
    hue: '500'
  },
  accent: {
    color: 'deep-orange',
    hue: '600'
  },
  warn: {
    color: 'orange',
    hue: '400'
  }
})

let base = window.CONFIG.baseUrl.split('//').pop().split('/')
base.shift()
base = base.join('/')

const router = new VueRouter({
  mode: 'history',
  routes,
  base,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return {
        x: 0,
        y: 0
      }
    }
  }
})

// Vue.use(VueAnalytics, {
//   appName: 'Business Site', // Mandatory
//   appVersion: '1.0.0', // Mandatory
//   trackingId: 'UA-91383222-1', // Mandatory
//   debug: false, // Whether or not display console logs debugs (optional)
//   vueRouter: router
// })

Vue.http.interceptors.push(function(request, next) {
  const jwt = localStorage.getItem('id_token')
  if (jwt) {
    request.headers.set('Authorization', 'Bearer ' + jwt)
  }
  next()
})

/* eslint-disable no-new */
new Vue({
  template: '<App />',
  router,
  store,
  components: {
    App
  },
  created: function() {
    store.dispatch('userAccount')
    if (localStorage.getItem('id_token')) {
      this.$http.post(window.koumoul_url + '/api/auth/exchange').then(response => {
        localStorage.setItem('id_token', response.body)
      }, response => {
        localStorage.removeItem('id_token')
        this.$notify({
          type: 'danger',
          text: `Une erreur est survenue lors du renouvellement de votre jeton d'authentification : ` +
            response.body + `<br>Si le problème persiste merci de nous contacter à <a href="contact@dawizz.fr">contact@dawizz.fr</a>`
        })
      })
    }
  }
}).$mount('#app')
