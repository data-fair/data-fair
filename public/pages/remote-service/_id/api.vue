<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl"
      :url="resourceUrl + '/api-docs.json'"
    />
  </v-container>
</template>

<script>
  import { mapGetters } from 'vuex'
  import OpenApi from '~/components/open-api.vue'

  export default {
    components: { OpenApi },
    computed: {
      ...mapGetters('remoteService', ['resourceUrl']),
    },
  }
</script>

<style lang="css">
</style>
