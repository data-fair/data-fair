<template>
  <journal :journal="journal" type="dataset"/>
</template>

<script>
import Journal from '../../../../components/Journal.vue'
const { mapState } = require('vuex')

export default {
  components: { Journal },
  computed: {
    ...mapState('dataset', ['journal'])
  }
}
</script>
