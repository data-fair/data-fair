<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editTopics"
        :schema="settingsSchema.properties.topics"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
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

const { locale } = useI18n()

const vjsfOptions = computed<VjsfOptions>(() => ({
  readOnlyPropertiesMode: 'hide',
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))

</script>
