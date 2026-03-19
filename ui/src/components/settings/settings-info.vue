<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="editInfo"
      :schema="settingsSchema.properties.info"
      :options="vjsfOptions"
    />
  </v-form>
</template>

<script lang="ts" setup>
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const valid = ref(true)
const info = defineModel<Settings['info']>()
const editInfo = ref<Settings['info']>()
watchDeepDiff(info, () => {
  editInfo.value = info.value
}, { immediate: true })
watchDeepDiff(editInfo, () => {
  if (valid.value) info.value = editInfo.value
}, {})
const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true
}
</script>
