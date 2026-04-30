<template>
  <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
    <v-form v-model="valid">
      <vjsf
        v-model="editInfo"
        :schema="settingsSchema.properties.info"
        :options="vjsfOptions"
      />
    </v-form>
  </v-defaults-provider>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const info = defineModel<Settings['info']>()
const valid = defineModel<boolean>('valid', { default: true })
const editInfo = ref<Settings['info']>()

watchDeepDiff(info, () => {
  editInfo.value = info.value
}, { immediate: true })

watchDeepDiff(editInfo, () => {
  info.value = editInfo.value
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
