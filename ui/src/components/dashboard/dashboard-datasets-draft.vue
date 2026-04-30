<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { draftStatus: draftStatusFilter } } : undefined"
    :title="t('datasetsDraft', nbDatasets ?? 0)"
    :svg="draftSvg"
    :color="nbDatasets ? 'warning' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsDraft: Aucun brouillon en attente | 1 brouillon en attente | {n} brouillons en attente
en:
  datasetsDraft: No draft dataset | 1 draft dataset | {n} draft datasets
</i18n>

<script setup lang="ts">
import draftSvg from '~/assets/svg/Under Constructions _Two Color.svg?raw'
import statuses from '../../../../shared/statuses.json'

const { t } = useI18n()

const draftStatusFilter = Object.keys(statuses.dataset).filter(s => s !== 'error' && s !== 'finalized').join(',')

const datasetsFetch = useFetch<{ count: number }>(() => `${$apiPath}/datasets?size=0&shared=false&draftStatus=${draftStatusFilter}`)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)
</script>
