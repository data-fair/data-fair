import Vue from 'vue'
import VueMultianalytics from '@koumoul/vue-multianalytics'

export default ({ store, env, app }) => {
  Vue.use(VueMultianalytics, { modules: env.analytics, routing: { vueRouter: app.router } })
}
