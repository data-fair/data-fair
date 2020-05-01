<template>
  <dataset-extension-details
    :remote-service="$route.params.service"
    :action="$route.params.action"
  />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import { mapActions, mapState } from 'vuex'
  import DatasetExtensionDetails from '../../../../../../components/datasets/extension-details.vue'

  export default {
    components: { DatasetExtensionDetails },
    computed: {
      ...mapState('dataset', ['dataset']),
    },
    watch: {
      dataset: {
        handler() {
          if (this.dataset) {
            this.fetchRemoteServices()
          }
        },
        immediate: true,
      },
    },
    methods: {
      ...mapActions('dataset', ['fetchRemoteServices']),
    },
  }
</script>
