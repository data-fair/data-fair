<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="webhooks"
      :schema="settingsSchema.properties.webhooks"
      :options="vjsfOptions"
      @update:model-value="valid ? emit('updated', { ...settings, webhooks: $event }) : null"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const { settings } = defineProps<{
  settings: Settings
}>()

const valid = ref(true)
const webhooks = ref(settings.webhooks)

const emit = defineEmits<{
  (event: 'updated', settings: Settings): void
}>()

const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

</script>
