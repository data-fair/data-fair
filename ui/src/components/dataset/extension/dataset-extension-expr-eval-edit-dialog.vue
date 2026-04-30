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
        :title="t('edit')"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        color="transparent"
      >
        <v-toolbar-title>
          {{ t('dialogTitle', { title: liveProperty?.title || liveProperty?.['x-originalName'] || t('newExprEval') }) }}
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
          :idx="idx"
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
  edit: Éditer l'expression
  dialogTitle: "Édition de la colonne calculée {title}"
  newExprEval: Nouvelle colonne calculée
en:
  edit: Edit the expression
  dialogTitle: "Editing calculated column {title}"
  newExprEval: New calculated column
</i18n>

<script setup lang="ts">
import { mdiClose, mdiPencil } from '@mdi/js'
import DatasetExtensionExprEvalPreview from './dataset-extension-expr-eval-preview.vue'

const props = defineProps<{
  extension: any
  idx: number
  dataset: any
  resourceUrl: string
}>()

const emit = defineEmits<{
  'update:expr': [value: string]
}>()

const { t } = useI18n()

const dialog = ref(false)

const liveProperty = computed(() =>
  props.dataset?.schema?.find((f: any) => f.key === props.extension.property?.key) ?? props.extension.property
)
</script>
