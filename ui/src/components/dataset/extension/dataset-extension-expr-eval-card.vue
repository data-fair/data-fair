<template>
  <v-card
    :title="liveProperty?.title || liveProperty?.['x-originalName'] || t('newExprEval')"
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
        :title="t('confirmDeleteTitle')"
        :text="t('confirmDeleteText')"
        :tooltip="t('confirmDeleteTooltip')"
        yes-color="warning"
        @confirm="emit('remove')"
      />
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  newExprEval: Nouvelle colonne calculée
  expr: Expression
  confirmDeleteTooltip: Supprimer la colonne calculée
  confirmDeleteTitle: Supprimer la colonne calculée
  confirmDeleteText: Êtes-vous sûr de vouloir supprimer cette colonne calculée ? Les données seront perdues.
en:
  newExprEval: New calculated column
  expr: Expression
  confirmDeleteTooltip: Delete the calculated column
  confirmDeleteTitle: Delete the calculated column
  confirmDeleteText: Are you sure you want to delete this calculated column? The data will be lost.
</i18n>

<script setup lang="ts">

const props = defineProps<{
  extension: any
  idx: number
  dataset: any
  resourceUrl: string
  canWrite: boolean
}>()

const emit = defineEmits<{ remove: [], 'update:expr': [val: string] }>()

const liveProperty = computed(() =>
  props.dataset?.schema?.find((f: any) => f.key === props.extension.property?.key) ?? props.extension.property
)

const { t } = useI18n()
</script>
