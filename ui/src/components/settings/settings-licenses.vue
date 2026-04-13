<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editLicenses"
        :schema="settingsSchema.properties.licenses"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const licenses = defineModel<Settings['licenses']>()
const valid = defineModel<boolean>('valid', { default: true })
const editLicenses = ref<Settings['licenses']>()
watchDeepDiff(licenses, () => {
  editLicenses.value = licenses.value
}, { immediate: true })
watchDeepDiff(editLicenses, () => {
  licenses.value = editLicenses.value
}, {})
const { locale } = useI18n()

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))

// http://localhost:5600/data-fair/embed/settings/user/superadmin/licenses
</script>
