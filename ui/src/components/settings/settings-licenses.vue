<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editLicenses"
      :schema="settingsSchema.properties.licenses"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const licenses = defineModel<Settings['licenses']>()
const editLicenses = ref<Settings['licenses']>()
watchDeepDiff(licenses, () => {
  editLicenses.value = licenses.value
}, { immediate: true })
watchDeepDiff(editLicenses, () => {
  if (valid.value) licenses.value = editLicenses.value
}, {})
const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

// http://localhost:5600/data-fair/embed/settings/user/superadmin/licenses
</script>
