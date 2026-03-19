<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editWebhooks"
      :schema="settingsSchema.properties.webhooks"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const webhooks = defineModel<Settings['webhooks']>()
const editWebhooks = ref<Settings['webhooks']>()
watchDeepDiff(webhooks, () => {
  editWebhooks.value = webhooks.value
}, { immediate: true })
watchDeepDiff(editWebhooks, () => {
  if (valid.value) webhooks.value = editWebhooks.value
}, {})

const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

</script>
