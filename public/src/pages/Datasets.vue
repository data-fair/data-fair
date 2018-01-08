<template>
  <div>
    <datasets-list ref="datasetsList"/>

    <div class="actions-buttons">
      <md-button @click="$refs.importFileDialog.open()" id="import-file-button" class="md-fab md-primary" title="Importer un fichier">
        <md-icon>file_upload</md-icon>
      </md-button>
    </div>

    <md-dialog md-open-from="#import-file-button" md-close-to="#import-file-button" ref="importFileDialog" id="import-file-dialog" @open="dialogOpened = true" @close="dialogOpened = false">
      <md-dialog-content>
        <import-file v-if="dialogOpened" @success="$refs.importFileDialog.close();$refs.datasetsList.refresh()"/>
      </md-dialog-content>
      <md-dialog-actions>
        <md-button class="md-primary" @click="$refs.importFileDialog.close()">Annuler</md-button>
      </md-dialog-actions>
    </md-dialog>
  </div>

  <!--<md-layout md-column md-flex="90">
    <md-layout md-row>
      <md-button class="md-raised md-primary" @click="$refs.sidenav.open()">Importer un fichier</md-button>
    </md-layout>
  </md-layout>-->
  <!--<md-sidenav class="md-right sidenav-half" ref="sidenav">
    <import-file></import-file>
  </md-sidenav>-->
</template>

<script>
import ImportFile from '../components/ImportFile.vue'
import DatasetsList from '../components/DatasetsList.vue'

export default {
  name: 'Datasets',
  components: {ImportFile, DatasetsList},
  data() {
    return {dialogOpened: false}
  }
}
</script>

<style>
#import-file-dialog .md-dialog{
  min-width:50%;
}
</style>
