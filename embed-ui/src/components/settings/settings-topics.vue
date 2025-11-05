<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editTopics"
      :schema="settingsSchema.properties.topics"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const topics = defineModel<Settings['topics']>()
const editTopics = ref<Settings['topics']>()
watchDeepDiff(topics, () => {
  editTopics.value = topics.value
}, { immediate: true })
watchDeepDiff(editTopics, () => {
  if (valid.value) topics.value = editTopics.value
}, {})

const vjsfOptions: VjsfOptions = {
  readOnlyPropertiesMode: 'hide',
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}

</script>
