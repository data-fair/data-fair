<template>
  <dataset-extension-details
    :remote-service="$route.params.service"
    :action="$route.params.action"
    data-iframe-height
  />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import { mapActions, mapState } from 'vuex'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  computed: {
    ...mapState('dataset', ['dataset'])
  },
  watch: {
    dataset: {
      handler () {
        if (this.dataset) {
          this.fetchRemoteServices()
        }
      },
      immediate: true
    }
  },
  methods: {
    ...mapActions('dataset', ['fetchRemoteServices'])
  }
}
</script>
