<template lang="html">
  <v-container fluid class="pa-0">
    <open-api v-if="resourceUrl" :url="resourceUrl"/>
  </v-container>
</template>

<script>
import OpenApi from '../components/OpenApi.vue'

export default {
  components: { OpenApi },
  computed: {
    resourceUrl() {
      return this.$store.state.env.publicUrl + '/api/v1/api-docs.json'
    }
  }
}
</script>

<style lang="css">
</style>
