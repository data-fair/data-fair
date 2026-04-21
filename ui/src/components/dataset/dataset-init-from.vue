<template>
  <div>
    <dataset-select
      v-model="initFromDataset"
      :label="t('initFromDataset')"
      :extra-params="{ queryable: true, select: '' }"
      master-data="standardSchema"
      class="mt-2"
    />

    <template v-if="initFromDataset && modelValue">
      <v-checkbox
        v-if="allowData"
        :model-value="modelValue.parts.includes('data')"
        hide-details
        class="pl-2"
        :label="t('initFromData')"
        @update:model-value="togglePart('data')"
      />
      <v-checkbox
        v-if="initFromDataset.extensions?.length"
        :model-value="modelValue.parts.includes('extensions')"
        hide-details
        class="pl-2"
        :label="t('initFromExtensions')"
        @update:model-value="togglePart('extensions')"
      />
      <v-checkbox
        v-if="initFromDataset.attachments?.length"
        :model-value="modelValue.parts.includes('metadataAttachments')"
        hide-details
        class="pl-2"
        :label="t('initFromAttachments')"
        @update:model-value="togglePart('metadataAttachments')"
      />
      <v-checkbox
        :model-value="modelValue.parts.includes('description')"
        hide-details
        class="pl-2"
        :label="t('initFromDescription')"
        @update:model-value="togglePart('description')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AccountKeys } from '@data-fair/lib-vue/session'

interface InitFrom {
  dataset: string
  parts: string[]
}

const props = defineProps<{
  allowData?: boolean
  owner?: AccountKeys | null
}>()

const modelValue = defineModel<InitFrom | null>({ default: null })
const sourceTitle = defineModel<string | null>('sourceTitle', { default: null })

const { t } = useI18n()

const allowData = computed(() => props.allowData ?? true)

const initFromDataset = ref<any>(null)

watch(initFromDataset, (dataset) => {
  if (dataset) {
    modelValue.value = { dataset: dataset.id, parts: ['schema'] }
    sourceTitle.value = dataset.title ?? null
  } else {
    modelValue.value = null
    sourceTitle.value = null
  }
})

const togglePart = (part: string) => {
  if (!modelValue.value) return
  const parts = [...modelValue.value.parts]
  if (parts.includes(part)) {
    modelValue.value = { ...modelValue.value, parts: parts.filter(p => p !== part) }
  } else {
    const newParts = [...parts, part]
    modelValue.value = { ...modelValue.value, parts: newParts }
  }
}
</script>

<i18n lang="yaml">
fr:
  initFromDataset: Utiliser un jeu de données existant comme modèle
  initFromData: Copier la donnée
  initFromExtensions: Copier les extensions
  initFromDescription: Copier le résumé et la description
  initFromAttachments: Copier les pièces jointes
en:
  initFromDataset: Use an existing dataset as a model ?
  initFromData: Copy data
  initFromExtensions: Copy extensions
  initFromDescription: Copy summary and description
  initFromAttachments: Copy attachments
</i18n>
