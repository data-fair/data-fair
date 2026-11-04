<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editDatasetsMetadata"
        :schema="metadataFormSchema"
        :options="vjsfOptions"
      >
        <template #metadata-info="{ node }">
          <div class="text-body-small">
            {{ standardMetadataByKey[node.data.key]?.info }}
          </div>
        </template>
      </vjsf>
    </v-form>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  notOffered: Non proposée
  customHelp: Infobulle personnalisée
  category: "Catégorie : {title}"
  informations: Informations générales
  coverage: Informations complémentaires
en:
  notOffered: Not offered
  customHelp: Custom help
  category: "Category: {title}"
  informations: General information
  coverage: Additional information
</i18n>

<script setup lang="ts">
import { type Settings } from '#api/types'
import equal from 'fast-deep-equal'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import { fieldGroup } from '~/utils/metadata-groups'
import { fromMetadataForm, metadataFormSchema, standardMetadata, standardMetadataByKey, standardMetadataItems, toMetadataForm } from '~/utils/settings-metadata-form'

const datasetsMetadata = defineModel<Settings['datasetsMetadata']>()
const valid = defineModel<boolean>('valid', { default: true })
const editDatasetsMetadata = ref<Record<string, any>>()
watchDeepDiff(datasetsMetadata, () => {
  // a new model resets vjsf and closes the edit dialog: its own changes are not sent back
  if (editDatasetsMetadata.value && equal(fromMetadataForm(editDatasetsMetadata.value), datasetsMetadata.value)) return
  editDatasetsMetadata.value = toMetadataForm(datasetsMetadata.value)
}, { immediate: true })
watchDeepDiff(editDatasetsMetadata, () => {
  // a new category gets its key at once, so a metadata can pick it before the settings are saved
  const groups = editDatasetsMetadata.value?.groups
  if (groups?.some(g => !g.key)) {
    editDatasetsMetadata.value = { ...editDatasetsMetadata.value, groups: groups.map(g => g.key ? g : { ...g, key: Math.random().toString(36).slice(2, 10) }) }
    return
  }
  datasetsMetadata.value = fromMetadataForm(editDatasetsMetadata.value!) as Settings['datasetsMetadata']
}, {})
const { t, locale } = useI18n()

const metadataSubtitles = computed(() => {
  const metadata = (datasetsMetadata.value ?? {}) as Record<string, any>
  const tabTitle = (key: string) => {
    if (key === 'informations') return metadata.informationsTitle || t('informations')
    if (key === 'coverage') return metadata.coverageTitle || t('coverage')
    return metadata.groups?.find((g: any) => g.key === key)?.title
  }
  return Object.fromEntries(standardMetadata.map(m => {
    const active = metadata[m.key]?.active ?? m.defaultActive
    if (!active) return [m.key, t('notOffered')]
    return [m.key, [
      m.hasGroup && t('category', { title: tabTitle(fieldGroup(metadata, m.key)) }),
      metadata[m.key]?.description && t('customHelp')
    ].filter(Boolean).join(' · ')]
  }))
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value,
  context: { metadata: standardMetadataByKey, metadataItems: standardMetadataItems, metadataSubtitles: metadataSubtitles.value }
}))

// http://localhost:5600/data-fair/embed/settings/user/superadmin/datasetsMetadata
</script>
