<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api type="general" />
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
