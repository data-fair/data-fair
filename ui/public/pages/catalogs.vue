<template>
  <d-frame
    v-if="env.enableCatalogs"
    :height="`${windowHeight - 48}px`"
    :src="src"
    sync-params
  />
</template>

<script>
import { mapState } from 'vuex'

export default {
  data () {
    return {
      src: window.location.origin + '/catalogs/catalogs'
    }
  },
  computed: {
    ...mapState(['env']),
  }
}
</script>
