<template>
  <v-form
    v-model="valid"
  >
    <vjsf
      v-model="licenses"
      :schema="vjsfSchema"
      :options="vjsfOptions"
      @update:model-value="valid ? emit('updated', { ...settings, licenses: $event }) : null"
    />
  </v-form>
</template>

<i18n lang="yaml">
fr:
  addLicense: Ajouter une licence
  href: URL
  licenses: Licences
  title: Titre
en:
  addLicense: Add a license
  href: URL
  licenses: Licenses
  title: Title
</i18n>

<script lang="ts" setup>
import type { Settings } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const { settings } = defineProps<{
  settings: Settings
}>()

const valid = ref(true)
const licenses = ref(settings.licenses)

const emit = defineEmits<{
  (event: 'updated', settings: Settings): void
}>()
const { t } = useI18n()

const vjsfSchema = {
  type: 'array',
  title: t('licenses'),
  layout: {
    messages: {
      addItem: t('addLicense')
    }
  },
  items: {
    type: 'object',
    required: ['title', 'href'],
    properties: {
      title: {
        type: 'string',
        title: t('title')
      },
      href: {
        type: 'string',
        title: t('href')
      }
    }
  }
}

const vjsfOptions: VjsfOptions = {
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable'
}

</script>
