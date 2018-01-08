<template>
  <div>
    <remote-services-list ref="remoteServicesList"/>

    <div class="actions-buttons">
      <md-button @click="$refs.configServiceDialog.open()" id="config-service-button" class="md-fab md-primary" title="Configurer un service distant">
        <md-icon>add</md-icon>
      </md-button>
    </div>

    <md-dialog md-open-from="#config-service-button" md-close-to="#config-service-button" id="config-service-dialog" ref="configServiceDialog" @open="dialogOpened = true" @close="dialogOpened = false">
      <md-dialog-content>
        <import-remote-service v-if="dialogOpened" @success="$refs.configServiceDialog.close();$refs.remoteServicesList.refresh()"/>
      </md-dialog-content>
      <md-dialog-actions>
        <md-button class="md-primary" @click="$refs.configServiceDialog.close()">Annuler</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import ImportRemoteService from '../components/ImportRemoteService.vue'
import RemoteServicesList from '../components/RemoteServicesList.vue'

export default {
  name: 'RemoteServices',
  components: {
    ImportRemoteService,
    RemoteServicesList
  },
  data() {
    return {dialogOpened: false}
  }
}
</script>

<style>
#config-service-dialog .md-dialog{
  min-width:50%;
}
</style>
