<template>
<md-layout md-align="center">
<md-layout md-column md-flex="90">
  <md-layout md-row>
    <md-button class="md-raised md-primary" @click="$refs.sidenav.open()">Configurer un service distant</md-button>
  </md-layout>
    <remote-services-list></remote-services-list>
  </md-layout>
  <md-sidenav class="md-right sidenav-half" ref="sidenav">
    <import-remote-service></import-remote-service>
  </md-sidenav>
</md-layout>
</template>

<script>
import ImportRemoteService from '../components/ImportRemoteService.vue'
import RemoteServicesList from '../components/RemoteServicesList.vue'

export default {
  name: 'remote-services',
  components: {
    ImportRemoteService,
    RemoteServicesList
  }
}
</script>

<style>
.sidenav-half .md-sidenav-content{
  width:50%;
}
</style>
