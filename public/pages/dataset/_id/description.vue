<template lang="html">
  <div>
    <dataset-info/>
    <dataset-schema/>
  </div>
</template>

<script>
import DatasetInfo from '../../../components/DatasetInfo.vue'
import DatasetSchema from '../../../components/DatasetSchema.vue'

export default {
  components: {DatasetInfo, DatasetSchema}
}
</script>

<style lang="css">
</style>
