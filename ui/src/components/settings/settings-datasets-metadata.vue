<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editDatasetsMetadata"
        :schema="settingsSchema.properties.datasetsMetadata"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const datasetsMetadata = defineModel<Settings['datasetsMetadata']>()
const valid = defineModel<boolean>('valid', { default: true })
const editDatasetsMetadata = ref<Settings['datasetsMetadata']>()
watchDeepDiff(datasetsMetadata, () => {
  editDatasetsMetadata.value = datasetsMetadata.value
}, { immediate: true })
watchDeepDiff(editDatasetsMetadata, () => {
  datasetsMetadata.value = editDatasetsMetadata.value
}, {})
const { locale } = useI18n()

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))

// http://localhost:5600/data-fair/embed/settings/user/superadmin/datasetsMetadata
</script>
