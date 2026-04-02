<template>
  <template v-if="dataset">
    <template v-if="portalUrls.length">
      <v-list-subheader class="text-uppercase">
        {{ t('navigation') }}
      </v-list-subheader>

      <v-list-item
        v-for="portalUrl in portalUrls"
        :key="portalUrl.url"
        :href="portalUrl.url"
        target="_blank"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiWeb"
          />
        </template>
        {{ t('viewOnPortal', { title: portalUrl.title }) }}
      </v-list-item>
    </template>

    <v-list-item
      v-if="dataset.isRest && user?.adminMode"
      :href="resourceUrl + '/raw'"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiProgressDownload"
          color="admin"
        />
      </template>
      {{ t('downloadRawRest') }}
      <v-list-item-subtitle>{{ t('downloadRawRestSubtitle') }}</v-list-item-subtitle>
    </v-list-item>

    <v-list-subheader
      v-if="hasActions"
      class="text-uppercase"
    >
      {{ t('actions') }}
    </v-list-subheader>

    <v-list-item
      v-if="can('readApiDoc').value && dataset.finalizedAt"
      :to="`/dataset/${dataset.id}/api-doc`"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiCloud"
          color="primary"
        />
      </template>
      {{ t('useAPI') }}
    </v-list-item>

  </template>
</template>

<i18n lang="yaml">
fr:
  navigation: Navigation
  viewOnPortal: "Voir sur {title}"
  downloadRawRest: Export brut
  downloadRawRestSubtitle: Téléchargement de l'export brut des données originales (admin)
  actions: Actions
  useAPI: Utiliser l'API
en:
  navigation: Navigation
  viewOnPortal: "View on {title}"
  downloadRawRest: Raw export
  downloadRawRestSubtitle: Download the raw export of original data (admin)
  actions: Actions
  useAPI: Use the API
</i18n>

<script setup lang="ts">
import {
  mdiCloud,
  mdiProgressDownload,
  mdiWeb
} from '@mdi/js'
import useDatasetStore from '~/composables/dataset/store'

const { t } = useI18n()
const { dataset, can, resourceUrl } = useDatasetStore()
const session = useSession()
const user = computed(() => session.state.user)

const owner = computed(() => dataset.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  let path = `${$apiPath}/settings/${owner.value.type}/${owner.value.id}`
  if (owner.value.department) path += ':' + owner.value.department
  path += '/publication-sites'
  return path
}, { immediate: true })

const portalUrls = computed(() => {
  if (!dataset.value || !publicationSitesFetch.data.value) return []
  const published = dataset.value.publicationSites ?? []
  return publicationSitesFetch.data.value
    .filter((site: any) => site.datasetUrlTemplate && published.includes(`${site.type}:${site.id}`))
    .map((site: any) => ({
      title: site.title || site.url || site.id,
      url: site.datasetUrlTemplate.replace('{id}', dataset.value!.id).replace('{slug}', dataset.value!.slug ?? dataset.value!.id)
    }))
})

const hasActions = computed(() => {
  if (!dataset.value) return false
  return can('readApiDoc').value && !!dataset.value.finalizedAt
})
</script>
