import Vue from 'vue'
import VueMatchHeights from 'vue-match-heights'

Vue.use(VueMatchHeights, {
  disabled: [768] // Optional: default viewports widths to disabled resizing on. Can be overridden per usage
})
