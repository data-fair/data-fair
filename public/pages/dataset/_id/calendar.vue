<template lang="html">
  <v-container fluid class="mt-2">
    <dataset-calendar :height-margin="60" />
  </v-container>
</template>

<script>
import DatasetCalendar from '../../../components/DatasetCalendar.vue'

export default {
  components: { DatasetCalendar }
}
</script>

<style lang="css">
</style>
