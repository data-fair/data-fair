<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90">
    <md-layout md-row>
      <md-button class="md-raised md-primary" @click="$refs.sidenav.open()">Configurer une application</md-button>
    </md-layout>
    <applications-list></applications-list>
  </md-layout>
  <md-sidenav class="md-right sidenav-half" ref="sidenav">
    <configure-application></configure-application>
  </md-sidenav>
</md-layout>
</template>

<script>
import ConfigureApplication from '../components/ConfigureApplication.vue'
import ApplicationsList from '../components/ApplicationsList.vue'

export default {
  name: 'applications',
  components: {
    ConfigureApplication,
    ApplicationsList
  }
}
</script>

<style>
.sidenav-half .md-sidenav-content{
  width:50%;
}
</style>
