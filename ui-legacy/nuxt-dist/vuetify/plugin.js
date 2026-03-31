import Vue from 'vue'
import Vuetify from 'vuetify/lib/framework'

import options from './options'

Vue.use(Vuetify, {
})

export default (ctx) => {
  const vuetifyOptions = typeof options === 'function' ? options(ctx) : options

  const vuetify = new Vuetify(vuetifyOptions)

  ctx.app.vuetify = vuetify
  ctx.$vuetify = vuetify.framework
}
