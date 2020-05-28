<template lang="html">
  <v-container fluid>
    <dataset-info />
    <dataset-schema />
  </v-container>
</template>

<script>
  import DatasetInfo from '~/components/datasets/info.vue'
  import DatasetSchema from '~/components/datasets/schema.vue'
  import { mapGetters } from 'vuex'

  export default {
    components: { DatasetInfo, DatasetSchema },
    computed: {
      ...mapGetters('dataset', ['can']),
    },
  }
</script>

<style lang="css">
</style>
