<template lang="html">
  <search-files :init-rows-per-page="4" :hide-rows-per-page="true" />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import SearchFiles from '../../../../components/SearchFiles.vue'
export default {
  components: { SearchFiles }
}
</script>

<style lang="css">
</style>
