import Vue from 'vue'
import colors from 'vuetify/es5/util/colors'

import Vuetify from 'vuetify/lib'
require('../stylus/main.styl')

Vue.use(Vuetify, {
  theme: {
    primary: colors.blue.darken1,
    accent: colors.orange.base
  }
})
