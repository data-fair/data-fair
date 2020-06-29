<template>
  <v-dialog v-model="dialog" :fullscreen="true">
    <template v-slot:activator="{ on }">
      <v-tooltip top>
        <template v-slot:activator="{ on: onTooltip }">
          <v-btn
            color="primary"
            icon
            :disabled="disabled"
            v-on="{...onTooltip, ...on}"
          >
            <v-icon>mdi-text-box-outline</v-icon>
          </v-btn>
        </template>
        <span>Rapport d'enrichissement</span>
      </v-tooltip>
    </template>

    <v-card>
      <v-toolbar dense flat>
        {{ remoteServicesMap[extension.remoteService] && remoteServicesMap[extension.remoteService].actions[extension.action].summary }}
        <v-spacer />
        <v-btn icon @click.native="dialog = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text>
        <dataset-extension-details :remote-service="extension.remoteService" :action="extension.action" />
      </v-card-text>
      <v-divider />
    </v-card>
  </v-dialog>
</template>

<script>
  import { mapGetters } from 'vuex'
  import DatasetExtensionDetails from '~/components/datasets/extension-details.vue'

  export default {
    components: { DatasetExtensionDetails },
    props: ['extension', 'disabled'],
    data() {
      return {
        dialog: false,
      }
    },
    computed: {
      ...mapGetters('dataset', ['remoteServicesMap']),

    },
  }
</script>

<style lang="css" scoped>
</style>
