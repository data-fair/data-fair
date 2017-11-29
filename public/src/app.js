import Vue from 'vue'
import VueMaterial from 'vue-material'
import 'vue-material/dist/vue-material.css'
import VueResource from 'vue-resource'
import VueRouter from 'vue-router'
// import VueCookie from 'vue-cookie'

import routes from './routes.js'
import store from './store.js'

import App from './App.vue'

__webpack_public_path__ = window.CONFIG.publicUrl + '/bundles/' // eslint-disable-line

Vue.use(VueMaterial)
Vue.use(VueResource)
Vue.use(VueRouter)
Vue.use(require('vue-moment'))
// Vue.use(VueCookie)

Vue.material.registerTheme('default', {
  primary: {
    color: 'light-blue',
    hue: '700'
  },
  warn: 'pink',
  accent: 'deep-orange',
  background: 'white'
})

Vue.material.registerTheme('success', {
  primary: {
    color: 'green',
    hue: '400'
  }
})

Vue.material.registerTheme('error', {
  primary: {
    color: 'red',
    hue: '400'
  }
})

let base = window.CONFIG.publicUrl.split('//').pop().split('/')
base.shift()
base = base.join('/')

const router = global.router = new VueRouter({
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
      this.$http.post(window.CONFIG.directoryUrl + '/api/auth/exchange').then(response => {
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
