<template lang="html">
  <dataset-map
    :height-margin="0"
    :show-select="false"
    :single-item="$route.query._id_eq ?? $route.query[`_d_${dataset.id}__id_eq`]"
  />
</template>

<script>
import { mapState } from 'vuex'

export default {
  computed: {
    ...mapState('dataset', ['dataset'])
  }
}
</script>

<style lang="css">
</style>
