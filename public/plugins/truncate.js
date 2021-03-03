import Vue from 'vue'
import VueTruncate from 'vue-truncate-filter'
Vue.use(VueTruncate)

const truncateMiddle = require('truncate-middle')

Vue.filter('truncateMiddle', function (text, before, after = 0, ellipsis = '...') {
  return truncateMiddle(text, before, after, ellipsis)
})
