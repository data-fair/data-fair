<template>
  <template v-if="dataset">
    <!-- Source files downloads for file datasets -->
    <template v-if="(isFileDataset && sourceFiles.length) || (dataset.isRest && user?.adminMode)">
      <v-list-subheader class="text-uppercase">
        {{ t('downloads') }}
      </v-list-subheader>
      <v-list-item
        v-for="file in sourceFiles"
        :key="file.key"
        :href="file.url"
        link
      >
        <template #prepend>
          <v-icon
            :icon="mdiFileDownload"
            color="primary"
          />
        </template>
        <v-list-item-title :title="file.tooltip">
          {{ file.label }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="file.size">
          {{ file.name }} · {{ formatBytes(file.size) }}
        </v-list-item-subtitle>
      </v-list-item>

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
      </v-list-item>
    </template>

    <!-- Links to portals -->
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

    <v-list-subheader
      v-if="hasActions"
      class="text-uppercase"
    >
      {{ t('actions') }}
    </v-list-subheader>

    <dataset-upload-dialog v-if="isFileDataset && can('writeData').value">
      <template #activator="{ props: activatorProps }">
        <v-list-item
          v-bind="activatorProps"
          link
        >
          <template #prepend>
            <v-icon
              :icon="mdiFileUpload"
              color="primary"
            />
          </template>
          {{ t('updateData') }}
        </v-list-item>
      </template>
    </dataset-upload-dialog>

    <v-list-item
      v-if="dataset.isRest && can('createLine').value"
      :to="`/dataset/${dataset.id}/edit-data`"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiFileUpload"
          color="primary"
        />
      </template>
      {{ t('updateData') }}
    </v-list-item>

    <v-list-item
      v-if="$uiConfig.openapiViewerIntegration && can('readApiDoc').value && dataset.finalizedAt"
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
  updateData: Mettre à jour les données
  downloads: Téléchargements
  downloadRawRest: Export brut
  actions: Actions
  useAPI: Utiliser l'API
  draftSuffix: Brouillon
  originalLabel: Fichier d'origine
  convertedLabel: Fichier converti
  fullCsvLabel: Fichier enrichi
  originalLow: le fichier d'origine
  convertedLow: le fichier converti
  fullCsvLow: le fichier enrichi
  downloadFileTooltip: "Télécharger {label} {name} ({size})"
  downloadFileTooltipNoSize: "Télécharger {label} {name}"
en:
  navigation: Navigation
  viewOnPortal: "View on {title}"
  updateData: Update data
  downloads: Downloads
  downloadRawRest: Raw export
  actions: Actions
  useAPI: Use the API
  draftSuffix: Draft
  originalLabel: Original file
  convertedLabel: Converted file
  fullCsvLabel: Enriched file
  originalLow: the original file
  convertedLow: the converted file
  fullCsvLow: the enriched file
  downloadFileTooltip: "Download {label} {name} ({size})"
  downloadFileTooltipNoSize: "Download {label} {name}"
</i18n>

<script setup lang="ts">
import {
  mdiCloud,
  mdiFileDownload,
  mdiFileUpload,
  mdiProgressDownload,
  mdiWeb
} from '@mdi/js'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import useDatasetStore from '~/composables/dataset/dataset-store'
import DatasetUploadDialog from '~/components/dataset/dataset-upload-dialog.vue'

const { t } = useI18n()
const { dataset, can, resourceUrl, dataFiles } = useDatasetStore()
const session = useSession()
const user = computed(() => session.state.user)
const isDraft = computed(() => !!dataset.value?.draftReason)

const isFileDataset = computed(() => {
  const d = dataset.value
  return d && !d.isRest && !d.isVirtual && !d.isMetaOnly && d.file
})

const labelKeys: Record<string, string> = {
  original: 'original',
  converted: 'converted',
  'full-csv': 'fullCsv'
}

const sourceFiles = computed(() => {
  if (!isFileDataset.value) return []
  return dataFiles.value.filter(f => f.key === 'original' || f.key === 'converted').map(f => {
    const baseKey = labelKeys[f.key] ?? f.key
    const label = t(`${baseKey}Label`) + (isDraft.value ? ` - ${t('draftSuffix')}` : '')
    const tooltipKey = f.size ? 'downloadFileTooltip' : 'downloadFileTooltipNoSize'
    const tooltip = t(tooltipKey, {
      label: t(`${baseKey}Low`),
      name: f.name,
      size: f.size ? formatBytes(f.size) : ''
    })
    return { ...f, label, tooltip }
  })
})

const canUpdateData = computed(() => {
  if (!dataset.value) return false
  const d = dataset.value
  if (isFileDataset.value) return can('writeData').value
  if (d.isRest) return can('createLine').value
  return false
})

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
      url: site.datasetUrlTemplate.replace('{id}', dataset.value!.id).replace('{slug}', dataset.value!.slug)
    }))
})

const hasActions = computed(() => {
  if (!dataset.value) return false
  return canUpdateData.value ||
    (isFileDataset.value && sourceFiles.value.length > 0) ||
    (can('readApiDoc').value && !!dataset.value.finalizedAt) ||
    (dataset.value.isRest && user.value?.adminMode)
})
</script>
