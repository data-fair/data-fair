<template>
<div>
  <md-toolbar class="md-whiteframe-3dp">
    <div style="flex: 1;"></div>
    <router-link to="/" tag="button" class="md-button md-primary">Entreprises Explorer</router-link>
    <md-menu md-size="6">
      <md-button md-menu-trigger>Documentation</md-button>

      <md-menu-content>
        <md-menu-item @click.native="$router.push('/schema-doc')">Description détaillée des champs</md-menu-item>
        <md-menu-item @click.native="$router.push('/key-numbers')">Chiffres clés</md-menu-item>
        <md-menu-item @click.native="$router.push('/api-doc')">Documentation d'API (développeurs)</md-menu-item>
      </md-menu-content>
    </md-menu>
  </md-toolbar>

  <md-layout md-align="center">
    <open-api v-if="api" :api="api"></open-api>
  </md-layout>
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
    this.$http.get(CONFIG.dataBaseUrl + '/api-docs.json').then(response => {
      this.api = response.body
    })
  }
}
</script>

<style lang="less">
  .md-sidenav :not(.md-active) {
    // display:none;
  }
</style>
