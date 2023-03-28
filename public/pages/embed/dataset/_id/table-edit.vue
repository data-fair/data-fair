<template lang="html">
  <v-container
    fluid
    class="pa-0 embed-table-edit"
  >
    <dataset-table />
  </v-container>
</template>

<script>
export default {
  mounted () {
    this.$store.dispatch('dataset/subscribe')
  }
}
</script>

<style>
</style>
