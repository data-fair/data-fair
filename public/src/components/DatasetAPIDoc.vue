<template>
<div>
  <open-api v-if="api" :api="api"></open-api>
</div>
</template>

<script>
import OpenApi from 'vue-openapi'
export default {
  props: ['dataset'],
  components: {OpenApi},
  data: () => ({api: null}),
  mounted: function() {
    this.$http.get(`${window.CONFIG.publicUrl}/api/v1/datasets/${this.dataset.id}/api-docs.json`).then(response => {
      this.api = response.body
    })
  }
}
</script>
