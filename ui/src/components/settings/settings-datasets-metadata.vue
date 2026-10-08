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
  // a new category gets its key at once, so a metadata can pick it before the settings are saved
  const groups = editDatasetsMetadata.value?.groups
  if (groups?.some(g => !g.key)) {
    editDatasetsMetadata.value = { ...editDatasetsMetadata.value, groups: groups.map(g => g.key ? g : { ...g, key: Math.random().toString(36).slice(2, 10) }) }
    return
  }
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
