<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="!env.openapiViewerV2"
      :url="env.publicUrl + '/api/v1/api-docs.json'"
    />
    <open-api
      v-else
      type="general"
    />
  </v-container>
</template>

<script>
import { mapState } from 'vuex'

export default {
  computed: {
    ...mapState(['env'])
  }
}
</script>

<style lang="css">
</style>
