<template lang="html">
  <v-row>
    <v-col cols="12">
      <p>{{ $t('message') }}</p>
      <v-slider
        v-model="remoteService.virtualDatasets.storageRatio"
        type="number"
        :step="0.01"
        :min="0"
        :max="1"
        :label="$t('storageRatio', {percent: Math.round(remoteService.virtualDatasets.storageRatio * 100)})"
        style="max-width:700px;"
        vertical
        @change="patch({virtualDatasets: remoteService.virtualDatasets})"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
  fr:
    message: Ce service est proposé comme données de référence pour la création de jeux virtuels.
    storageRatio: 'Ratio à appliquer pour le calcul du stockage consommé : {percent}%'
</i18n>

<script>
const { mapState, mapActions } = require('vuex')

export default {
  computed: {
    ...mapState('remoteService', ['remoteService'])
  },
  methods: {
    ...mapActions('remoteService', ['patch'])
  }
}
</script>

<style lang="css">
</style>
