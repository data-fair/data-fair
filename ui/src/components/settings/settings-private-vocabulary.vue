<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editPrivateVocabulary"
        :schema="settingsSchema.properties.privateVocabulary"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const privateVocabulary = defineModel<Settings['privateVocabulary']>()
const valid = defineModel<boolean>('valid', { default: true })
const editPrivateVocabulary = ref<Settings['privateVocabulary']>()
watchDeepDiff(privateVocabulary, () => {
  editPrivateVocabulary.value = privateVocabulary.value
}, { immediate: true })
watchDeepDiff(editPrivateVocabulary, () => {
  privateVocabulary.value = editPrivateVocabulary.value
}, {})
const { locale } = useI18n()

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))
</script>
