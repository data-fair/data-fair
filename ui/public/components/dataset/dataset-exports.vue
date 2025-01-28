<template>
  <v-container fluid>
    <v-checkbox
      v-model="editExports.restToCSV.active"
      :label="$t('restToCSV.active')"
      :disabled="!can('writeExports')"
      @change="patchAndApplyRemoteChange({ exports: editExports })"
    />
    <v-alert
      v-if="dataset.exports && dataset.exports.restToCSV && dataset.exports.restToCSV.nextExport"
      :value="true"
      type="info"
      outlined
      style="display:inline-block;"
    >
      {{ $t('restToCSV.nextExport') }} {{ dataset.exports.restToCSV.nextExport | moment("from", "now") }}
    </v-alert>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  restToCSV:
    active: Activer l'export automatique d'un fichier CSV complet
    nextExport: Prochain export
en:
  restToCSV:
    active: Activate the automatic export of a full CSV file
    nextExport: Next export
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'

export default {
  data: () => ({
    editExports: null
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can'])
  },
  watch: {
    'dataset.exports': {
      immediate: true,
      handler () {
        const editExports = JSON.parse(JSON.stringify(this.dataset.exports || {}))
        editExports.restToCSV = editExports.restToCSV || {}
        editExports.restToCSV.active = editExports.restToCSV.active || false
        this.editExports = editExports
      }
    }
  },
  created () {

  },
  methods: {
    ...mapActions('dataset', ['patchAndApplyRemoteChange'])
  }
}
</script>

<style>

</style>
