<template lang="html">
  <v-container fluid>
    <dataset-info />
    <dataset-schema-edit v-if="can('writeDescription')" />
    <dataset-schema-view v-else />
  </v-container>
</template>

<script>
  import DatasetInfo from '../../../components/datasets/info.vue'
  import DatasetSchemaEdit from '../../../components/datasets/schema-edit.vue'
  import DatasetSchemaView from '../../../components/datasets/schema-view.vue'
  import { mapGetters } from 'vuex'

  export default {
    components: { DatasetInfo, DatasetSchemaView, DatasetSchemaEdit },
    computed: {
      ...mapGetters('dataset', ['can']),
    },
  }
</script>

<style lang="css">
</style>
