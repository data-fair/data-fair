<template>
  <v-card
    :loading="!datasets"
    outlined
    tile
  >
    <v-card-title v-t="$t('requestedPublications')" />
    <v-card-text
      v-if="datasets && !datasets.results.length"
      v-t="$t('noRequestedPublications')"
    />
    <v-list
      v-if="datasets"
      dense
      color="transparent"
      class="pb-1"
    >
      <dataset-list-item
        v-for="dataset in datasets.results"
        :key="dataset.id"
        :dataset="dataset"
        :dense="true"
        :show-topics="true"
        :no-link="true"
        :list-item-props="{to: '/dataset/' + dataset.id}"
      />
    </v-list>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Publications à valider
  noRequestedPublications: aucune
en:
  requestedPublications: Requested publications
  noRequestedPublications: none
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
      nbLines: 7
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    this.datasets = await this.$axios.$get('api/v1/datasets', {
      params: { size: this.nbLines, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner', hasRequestedPublicationSites: true }
    })
  }
}
</script>

<style lang="css" scoped>
</style>
