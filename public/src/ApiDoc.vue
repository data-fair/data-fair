<template>
<div>
  <open-api v-if="api" :api="api"></open-api>
</div>
</template>

<script>
import OpenApi from 'vue-openapi'
export default {
  name: 'api-doc',
  components: {
    OpenApi
  },
  data: () => ({
    api: null
  }),
  mounted: function() {
    this.$http.get(window.CONFIG.baseUrl + '/api/v1/api-docs.json').then(response => {
      this.api = response.body
    })
  }
}
</script>
