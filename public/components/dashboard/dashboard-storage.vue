<template>
  <v-card
    :loading="!datasets || !stats"
    outlined
    tile
  >
    <v-card-title v-t="$t('storage')" />
    <v-card-text
      v-if="stats"
      style="min-height:60px"
    >
      <i18n
        v-if="stats.limits && stats.limits.store_bytes && stats.limits.store_bytes.limit && stats.limits.store_bytes.limit !== -1"
        path="storageWithLimit"
      >
        <template #bytes><b>{{ stats.limits.store_bytes.consumption | bytes($i18n.locale) }}</b></template>
        <template #bytesLimit><b>{{ stats.limits.store_bytes.limit | bytes($i18n.locale) }}</b></template>
      </i18n>
      <i18n
        v-else-if="stats.limits && stats.limits.store_bytes"
        path="storageWithoutLimit"
      >
        <template #bytes>
          {{ stats.limits.store_bytes.consumption | bytes($i18n.locale) }}
        </template>
      </i18n>
      <nuxt-link to="/storage">{{ $t('seeDetails') }}</nuxt-link>
    </v-card-text>
    <storage-treemap
      v-if="stats && datasets && datasets.results.length"
      :stats="stats"
      :datasets="datasets"
    />
  </v-card>
</template>

<i18n lang="yaml">
fr:
  storage: Stockage
  storageWithLimit: Vous utilisez {bytes} sur un total disponible de {bytesLimit}.
  storageWithoutLimit: Vous utilisez {bytes} de stockage.
  seeDetails: Voir le détail.
en:
  activity: Storage
  storageWithLimit: You use {bytes} out of {bytesLimit} of total available space.
  storageWithoutLimit: You use {bytes} of storage space.
  seeDetails: See details.
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  props: {
    stats: { type: Object, default: null }
  },
  data () {
    return {
      datasets: null,
      nbLines: 8
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    this.datasets = await this.$axios.$get('api/v1/datasets', {
      params: { size: 8, shared: false, select: 'id,title,storage', sort: 'storage.size:-1' }
    })
  }
}
</script>

<style lang="css" scoped>
</style>
