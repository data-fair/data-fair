<template lang="html">
  <v-container>
    <permissions :resource="catalog" :resource-url="resourceUrl" :api="api" />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import Permissions from '../../../components/Permissions.vue'

export default {
  components: { Permissions },
  computed: {
    ...mapState('catalog', ['catalog', 'api']),
    ...mapGetters('catalog', ['resourceUrl'])
  }
}
</script>

<style lang="css">
</style>
