<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editPublicationSites"
      :schema="schema"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<i18n lang="yaml">
fr:
  summary: résumé
  description: description
  license: licence
  topic: thématique
en:
  summary: summary
  description: description
  license: license
  topic: topic
</i18n>

<script lang="ts" setup>
import publicationSitesContract from '~/../../api/contract/publication-sites'
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const publicationSites = defineModel<Settings['publicationSites']>()
const { datasetsMetadata } = defineProps<{ datasetsMetadata: Settings['datasetsMetadata'] }>()

const { t } = useI18n()
const { user } = useSessionAuthenticated()
const publicationSitesSchema = publicationSitesContract(false)
const publicationSitesAdminSchema = publicationSitesContract(true)
const schema = computed(() => user.value.adminMode ? publicationSitesAdminSchema : publicationSitesSchema)
const datasetsMetadataSchema = settingsSchema.properties.datasetsMetadata

const valid = ref(true)
const editPublicationSites = ref<Settings['publicationSites']>()
watchDeepDiff(publicationSites, () => {
  editPublicationSites.value = publicationSites.value
}, { immediate: true })
watchDeepDiff(editPublicationSites, () => {
  if (valid.value) publicationSites.value = editPublicationSites.value
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
  context: context.value
}))
</script>
