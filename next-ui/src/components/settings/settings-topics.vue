<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="topics"
      :schema="settingsSchema.properties.topics"
      :options="vjsfOptions"
      @update:model-value="valid ? emit('updated', { ...settings, topics: $event }) : null"
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
const topics = ref(settings.topics)

const emit = defineEmits<{
  (event: 'updated', settings: Settings): void
}>()

const vjsfOptions: VjsfOptions = {
  readOnlyPropertiesMode: 'hide',
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

</script>
