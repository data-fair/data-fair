<template>
  <v-card
    :title="extension.property?.['x-originalName'] || t('newExprEval')"
    class="h-100"
  >
    <v-card-text>
      <v-text-field
        :model-value="extension.expr"
        disabled
        :label="t('expr')"
        hide-details
      />
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <dataset-extension-expr-eval-edit-dialog
        v-if="canWrite"
        :extension="extension"
        :idx="idx"
        :dataset="dataset"
        :resource-url="resourceUrl"
        @update:expr="(val: string) => emit('update:expr', val)"
      />
      <confirm-menu
        v-if="canWrite"
        yes-color="warning"
        :text="t('confirmDeleteText')"
        :tooltip="t('confirmDeleteTooltip')"
        @confirm="emit('remove')"
      />
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  newExprEval: Nouvelle colonne calculée
  expr: Expression
  confirmDeleteTooltip: Supprimer l'extension
  confirmDeleteText: Souhaitez-vous confirmer la suppression ?
en:
  newExprEval: New calculated column
  expr: Expression
  confirmDeleteTooltip: Delete the extension
  confirmDeleteText: Do you want to confirm the deletion?
</i18n>

<script setup lang="ts">

defineProps<{
  extension: any
  idx: number
  dataset: any
  resourceUrl: string
  canWrite: boolean
}>()

const emit = defineEmits<{ remove: [], 'update:expr': [val: string] }>()

const { t } = useI18n()
</script>
