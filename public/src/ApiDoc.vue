<template>
  <div>
    <open-api v-if="api" :api="api"/>
  </div>
</template>

<script>
import OpenApi from 'vue-openapi'
export default {
  name: 'ApiDoc',
  components: {
    OpenApi
  },
  data: () => ({
    api: null
  }),
  mounted: function() {
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/api-docs.json').then(response => {
      this.api = response.body
    })
  }
}
</script>
