<template>
  <dataset-extension-details :remote-service="$route.params.service" :action="$route.params.action" />
</template>

<script>
import { mapActions, mapState } from 'vuex'
import DatasetExtensionDetails from '../../../../../../components/DatasetExtensionDetails.vue'

export default {
  components: { DatasetExtensionDetails },
  computed: {
    ...mapState('dataset', ['dataset'])
  },
  watch: {
    dataset: {
      handler() {
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
