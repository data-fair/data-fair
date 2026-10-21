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

<script setup lang="ts">
import publicationSitesContract from '~/../../api/contract/publication-sites'
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const publicationSites = defineModel<Settings['publicationSites']>()
const valid = defineModel<boolean>('valid', { default: true })
const { datasetsMetadata } = defineProps<{ datasetsMetadata: Settings['datasetsMetadata'] }>()

const { locale } = useI18n()
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

// every metadata shown on datasets can be required
const context = computed(() => ({
  DatasetsMetadata: Object.entries(datasetsMetadataSchema.properties as Record<string, any>)
    .filter(([key, prop]) => prop.properties?.weight && (prop.properties.active.readOnly || ((datasetsMetadata as any)?.[key]?.active ?? prop.properties.active.default)))
    .map(([key, prop]) => ({ key, title: prop.properties.active.title }))
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
