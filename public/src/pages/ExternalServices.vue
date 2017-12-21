<template>
<md-layout md-align="center">
<md-layout md-column md-flex="90">
  <md-layout md-row>
    <md-button class="md-raised md-primary" @click="$refs.sidenav.open()">Configurer un service externe</md-button>
  </md-layout>
    <external-apis></external-apis>
  </md-layout>
  <md-sidenav class="md-right sidenav-half" ref="sidenav">
    <import-api></import-api>
  </md-sidenav>
</md-layout>
</template>

<script>
import ImportApi from '../components/ImportApi.vue'
import ExternalApis from '../components/ExternalApis.vue'

export default {
  name: 'external-services',
  components: {
    ImportApi,
    ExternalApis
  }
}
</script>

<style>
.sidenav-half .md-sidenav-content{
  width:50%;
}
</style>
