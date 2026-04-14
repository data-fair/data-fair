<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editPublicationSites"
        :schema="schema"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<i18n lang="yaml">
fr:
  summary: Résumé
  description: Description
  license: License
  topic: Thématique
en:
  summary: Summary
  description: Description
  license: License
  topic: Topic
</i18n>

<script setup lang="ts">
import publicationSitesContract from '~/../../api/contract/publication-sites'
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const publicationSites = defineModel<Settings['publicationSites']>()
const valid = defineModel<boolean>('valid', { default: true })
const { datasetsMetadata } = defineProps<{ datasetsMetadata: Settings['datasetsMetadata'] }>()

const { t, locale } = useI18n()
const { user } = useSessionAuthenticated()
const publicationSitesSchema = publicationSitesContract(false)
const publicationSitesAdminSchema = publicationSitesContract(true)
const schema = computed(() => user.value.adminMode ? publicationSitesAdminSchema : publicationSitesSchema)
const datasetsMetadataSchema = settingsSchema.properties.datasetsMetadata

const editPublicationSites = ref<Settings['publicationSites']>()
watchDeepDiff(publicationSites, () => {
  editPublicationSites.value = publicationSites.value
}, { immediate: true })
watchDeepDiff(editPublicationSites, () => {
  publicationSites.value = editPublicationSites.value
}, {})

const context = computed(() => ({
  DatasetsMetadata: [
    { key: 'summary', title: t('summary') },
    { key: 'description', title: t('description') },
    { key: 'license', title: t('license') },
    { key: 'topics', title: t('topic') }
  ].concat(Object.keys(datasetsMetadata || {})
    .filter(metadata => datasetsMetadata![metadata as 'spatial']!.active)
    .map(metadata => ({
      key: metadata,
      title: datasetsMetadataSchema.properties[metadata].title || datasetsMetadataSchema.properties[metadata].properties.active.title
    })))
}))

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value,
  context: context.value
}))
</script>
