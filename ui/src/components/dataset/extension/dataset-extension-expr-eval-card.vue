<template>
  <v-card
    :class="parsingError ? 'border-error border-opacity-100' : (isModified ? 'border-accent border-opacity-100' : undefined)"
    class="h-100 d-flex flex-column"
  >
    <template #title>
      <span :title="liveProperty?.title || liveProperty?.['x-originalName'] || t('newExprEval')">
        {{ liveProperty?.title || liveProperty?.['x-originalName'] || t('newExprEval') }}
      </span>
    </template>
    <v-card-text class="pb-0">
      <v-alert
        v-if="parsingError"
        :text="parsingError"
        type="error"
        class="mb-4"
      />
      <v-text-field
        :model-value="extension.expr"
        :label="t('expr')"
        hide-details
        variant="outlined"
        density="compact"
        disabled
      />
      <v-checkbox
        :model-value="extension.mandatory"
        :label="t('mandatory')"
        :hint="t('mandatoryHint')"
        persistent-hint
        :disabled="!canWrite"
        density="comfortable"
        hide-details="auto"
        class="mt-2"
        @update:model-value="val => emit('update:mandatory', val)"
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
  emptyExpr: Saisissez une expression
  confirmDeleteTooltip: Supprimer la colonne calculée
  confirmDeleteTitle: Supprimer la colonne calculée
  confirmDeleteText: Êtes-vous sûr de vouloir supprimer cette colonne calculée ? Les données seront perdues.
  mandatory: Enrichissement obligatoire
  mandatoryHint: Une ligne dont l'enrichissement échoue est traitée comme une erreur de validation.
en:
  newExprEval: New calculated column
  expr: Expression
  emptyExpr: Write an expression
  confirmDeleteTooltip: Delete the calculated column
  confirmDeleteTitle: Delete the calculated column
  confirmDeleteText: Are you sure you want to delete this calculated column? The data will be lost.
  mandatory: Mandatory enrichment
  mandatoryHint: A row whose enrichment fails is treated as a validation error.
</i18n>

<script setup lang="ts">
import useExprEvalValidation from '~/composables/dataset/expr-eval-validation'

const props = defineProps<{
  extension: any
  idx: number
  dataset: any
  resourceUrl: string
  canWrite: boolean
}>()

const emit = defineEmits<{ remove: [], 'update:expr': [val: string], 'update:mandatory': [val: boolean | null] }>()

const liveProperty = computed(() =>
  props.dataset?.schema?.find((f: any) => f.key === props.extension.property?.key) ?? props.extension.property
)

const { t } = useI18n()

const savedExpr = ref(props.extension.expr ?? '')
watch(() => props.extension, (newExt) => {
  savedExpr.value = newExt?.expr ?? ''
})
const isModified = computed(() => (props.extension.expr ?? '') !== savedExpr.value)

const { parsingError } = useExprEvalValidation(
  () => props.extension.expr,
  () => props.dataset,
  liveProperty,
  () => t('emptyExpr')
)
</script>
