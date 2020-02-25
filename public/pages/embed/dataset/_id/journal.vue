<template>
  <journal :journal="journal" type="dataset" />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import Journal from '../../../../components/Journal.vue'
const { mapState } = require('vuex')

export default {
  components: { Journal },
  computed: {
    ...mapState('dataset', ['journal'])
  },
  mounted() {
    this.$store.dispatch('dataset/subscribe')
  }
}
</script>
