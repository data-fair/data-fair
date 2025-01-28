<template lang="html">
  <div>
    <v-btn to="/_dev/update-dataset">back</v-btn>
    <v-iframe
      src="http://localhost:5600/data-fair/embed/workflow/update-dataset"
      :query-params-extra="{
        primary: '#FF00FF'
      }"
      :sync-state="true"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'

export default {
  components: {
    VIframe
  },
  computed: {
    ...mapState(['env'])
  }
}
</script>

<style lang="css">
.open-api .v-iframe iframe {
  background-color: white;
  border: none;
}
</style>
