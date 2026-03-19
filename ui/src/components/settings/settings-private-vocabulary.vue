<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editPrivateVocabulary"
      :schema="settingsSchema.properties.privateVocabulary"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const privateVocabulary = defineModel<Settings['privateVocabulary']>()
const editPrivateVocabulary = ref<Settings['privateVocabulary']>()
watchDeepDiff(privateVocabulary, () => {
  editPrivateVocabulary.value = privateVocabulary.value
}, { immediate: true })
watchDeepDiff(editPrivateVocabulary, () => {
  if (valid.value) privateVocabulary.value = editPrivateVocabulary.value
}, {})
const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}
</script>
