<template>
<journal type="application" :journal="journal"/></template>

<script>
import Journal from '../../../components/Journal.vue'
const {mapState} = require('vuex')

export default {
  components: {Journal},
  computed: {
    ...mapState('application', ['journal'])
  }
}
</script>
