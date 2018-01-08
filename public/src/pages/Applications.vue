<template>
  <div class="applications">
    <applications-list ref="applicationsList"></applications-list>

    <div class="actions-buttons">
      <md-button @click="$refs.configAppDialog.open()" id="config-app-button" class="md-fab md-primary" title="Configurer une application">
        <md-icon>add</md-icon>
      </md-button>
    </div>

    <md-dialog md-open-from="#config-app-button" md-close-to="#config-app-button" id="config-app-dialog" ref="configAppDialog" @open="dialogOpened = true" @close="dialogOpened = false">
      <md-dialog-content>
        <configure-application v-if="dialogOpened" @success="$refs.configAppDialog.close();$refs.applicationsList.refresh()"></configure-application>
      </md-dialog-content>
      <md-dialog-actions>
        <md-button class="md-primary" @click="$refs.configAppDialog.close()">Annuler</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>
</template>

<script>
import ConfigureApplication from '../components/ConfigureApplication.vue'
import ApplicationsList from '../components/ApplicationsList.vue'

export default {
  name: 'applications',
  components: {
    ConfigureApplication,
    ApplicationsList
  },
  data() {
    return {dialogOpened: false}
  }
}
</script>

<style>
#config-app-dialog .md-dialog{
  min-width:50%;
}
</style>
