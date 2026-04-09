<template>
  <v-dialog
    v-model="dialog"
    fullscreen
    transition="dialog-bottom-transition"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        :icon="mdiPencil"
        color="primary"
        :title="t('preview')"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        color="transparent"
      >
        <v-toolbar-title>
          {{ t('preview') + ' ' + (extension.property?.['x-originalName'] || t('newExprEval')) }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          :icon="mdiClose"
          @click="dialog = false"
        />
      </v-toolbar>
      <v-card-text>
        <dataset-extension-expr-eval-preview
          v-if="dialog"
          :extension="extension"
          :dataset="dataset"
          :resource-url="resourceUrl"
          @update:expr="val => emit('update:expr', val)"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  preview: Prévisualisation
  newExprEval: nouvelle colonne calculée
en:
  preview: Preview
  newExprEval: new calculated column
</i18n>

<script setup lang="ts">
import { mdiClose, mdiPencil } from '@mdi/js'
import DatasetExtensionExprEvalPreview from './dataset-extension-expr-eval-preview.vue'

defineProps<{
  extension: any
  dataset: any
  resourceUrl: string
}>()

const emit = defineEmits<{
  'update:expr': [value: string]
}>()

const { t } = useI18n({ useScope: 'local' })

const dialog = ref(false)
</script>
