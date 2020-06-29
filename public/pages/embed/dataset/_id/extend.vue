<template lang="html">
  <v-container fluid style="min-height: 500px">
    <dataset-extensions />
  </v-container>
</template>

<script>
  import DatasetExtensions from '~/components/datasets/extensions.vue'

  export default {
    components: { DatasetExtensions },
  }
</script>
