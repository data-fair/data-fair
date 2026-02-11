<template lang="html">
  <v-row v-if="remoteService?.virtualDatasets">
    <v-col cols="12">
      <p>{{ $t('message') }}</p>
      <v-slider
        v-model="remoteService.virtualDatasets.storageRatio"
        type="number"
        :step="0.01"
        :min="0"
        :max="1"
        :label="t('storageRatio', {percent: Math.round((remoteService.virtualDatasets.storageRatio ?? 0) * 100)})"
        style="max-width:700px;"
        direction="vertical"
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
  fr:
    message: Ce service est proposé comme données de référence pour la création de jeux virtuels.
    storageRatio: 'Ratio à appliquer pour le calcul du stockage consommé : {percent}%'
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'

const remoteService = defineModel<RemoteService>()

const { t } = useI18n()

</script>

<style lang="css">
</style>
