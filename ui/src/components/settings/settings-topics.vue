<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="model"
        :schema="settingsSchema.properties.topics"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'
import equal from 'fast-deep-equal'
import { restoreI18n } from '~/composables/dataset/metadata-i18n'

const topics = defineModel<Settings['topics']>()
const valid = defineModel<boolean>('valid', { default: true })
// MOCKUP i18n: the translations are kept through the form, an emit without a real change is ignored
const model = computed({
  get: () => topics.value,
  set: (v) => {
    const next = restoreI18n(v as any[], topics.value as any[], 'id') as Settings['topics']
    if (!equal(next, topics.value)) topics.value = next
  }
})

const { locale } = useI18n()

const vjsfOptions = computed<VjsfOptions>(() => ({
  readOnlyPropertiesMode: 'hide',
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  // a schema default is a fallback read by the code, never stored with the settings
  useDefault: false,
  xI18n: true,
  locale: locale.value
}))

</script>
