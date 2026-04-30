<template>
  <dashboard-svg-link
    :to="nbDatasets ? { path: '/datasets', query: { status: 'error' } } : undefined"
    :title="t('datasetsError', nbDatasets ?? 0)"
    :svg="errorSvg"
    :color="nbDatasets ? 'error' : 'grey'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsError: Aucun jeu de données en erreur | 1 jeu de données en erreur | {n} jeux de données en erreur
en:
  datasetsError: No dataset in error | 1 dataset in error | {n} datasets in error
</i18n>

<script setup lang="ts">
import errorSvg from '~/assets/svg/Under Constructions_Two Color.svg?raw'

const { t } = useI18n()

const datasetsFetch = useFetch<{ count: number }>(() => `${$apiPath}/datasets?size=0&shared=false&status=error`)

const nbDatasets = computed(() => datasetsFetch.data.value?.count ?? null)
</script>
