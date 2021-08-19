import Vue from 'vue'

const truncateMiddle = require('truncate-middle')

Vue.filter('truncate', function (text, before, after = 0, ellipsis = '...') {
  return truncateMiddle(text, before, after, ellipsis)
})
