<template lang="html">
  <v-container>
    <permissions
      :resource="application"
      :resource-url="resourceUrl"
      :api="api"
    />
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import Permissions from '~/components/permissions.vue'

  export default {
    components: { Permissions },
    computed: {
      ...mapState('application', ['application', 'api']),
      ...mapGetters('application', ['resourceUrl']),
    },
  }
</script>

<style lang="css">
</style>
