<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editDatasetsMetadata"
      :schema="settingsSchema.properties.datasetsMetadata"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const datasetsMetadata = defineModel<Settings['datasetsMetadata']>()
const editDatasetsMetadata = ref<Settings['datasetsMetadata']>()
watchDeepDiff(datasetsMetadata, () => {
  editDatasetsMetadata.value = datasetsMetadata.value
}, { immediate: true })
watchDeepDiff(editDatasetsMetadata, () => {
  if (valid.value) datasetsMetadata.value = editDatasetsMetadata.value
}, {})
const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

// http://localhost:5600/data-fair/embed/settings/user/superadmin/datasetsMetadata
</script>
