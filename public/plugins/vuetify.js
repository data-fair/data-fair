import 'material-design-icons-iconfont/dist/material-design-icons.css'
import Vue from 'vue'
import Vuetify from 'vuetify/lib'
require('../stylus/main.styl')

export default ({ env }) => {
  Vue.use(Vuetify, {
    theme: env.theme.colors
  })
}
