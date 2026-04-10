<template>
  <v-container
    class="pa-0"
    fluid
  >
    <workflow-update-dataset
      v-model:updated="updated"
      :dataset-params="datasetParams"
    />
  </v-container>
</template>

<script setup lang="ts">
const route = useRoute<'/update-dataset'>()
const { t } = useI18n()
const { account } = useSessionAuthenticated()
const breadcrumbs = useBreadcrumbs()

breadcrumbs.receive({ breadcrumbs: [{ text: t('home'), to: '/' }, { text: t('updateDataset') }] })

const updated = ref<string | undefined>()
const ownerFilter = computed(() => {
  let ownerFilter = `${account.value.type}:${account.value.id}`
  if (account.value.department) ownerFilter += ':' + account.value.department
  return ownerFilter
})

const datasetParams = computed(() => ({
  publicationSites: route.query.publicationSite as string | undefined,
  owner: ownerFilter.value
}))
</script>

<i18n lang="yaml">
fr:
  home: Accueil
  updateDataset: Mettre à jour un jeu de données
en:
  home: Home
  updateDataset: Update a dataset
</i18n>
