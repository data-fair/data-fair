import Vue from 'vue'
import VueMultianalytics from '@koumoul/vue-multianalytics/src'

export default ({ store, env, app, route }) => {
  if (!route.name.startsWith('embed-')) {
    Vue.use(VueMultianalytics, { modules: env.analytics, routing: { vueRouter: app.router, preferredProperty: 'fullPath' } })
  }
}
