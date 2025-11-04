<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="licenses"
      :schema="settingsSchema.properties.licenses"
      :options="vjsfOptions"
      @update:model-value="valid ? emit('updated', { ...settings, licenses: $event }) : null"
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
const licenses = ref(settings.licenses)

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
