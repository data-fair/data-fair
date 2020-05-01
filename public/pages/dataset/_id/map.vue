<template lang="html">
  <v-container fluid>
    <dataset-map
      :height-margin="60"
      :show-select="true"
    />
  </v-container>
</template>

<script>
  import DatasetMap from '../../../components/datasets/map.vue'

  export default {
    components: { DatasetMap },
  }
</script>

<style lang="css">
</style>
