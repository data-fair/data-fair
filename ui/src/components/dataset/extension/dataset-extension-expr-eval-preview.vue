<template>
  <div
    ref="previewRoot"
    class="extension-expr-eval-preview"
  >
    <df-tutorial-alert
      id="expr-eval-extension"
      persistent
    >
      <div class="expr-eval-help-scroll">
        <p
          class="mb-2"
          v-html="/*eslint-disable-line vue/no-v-html*/t('exprEvalIntro')"
        />
        <p class="mb-2">
          {{ t('exprEvalFunctions') }}
        </p>
        <dataset-expr-eval-doc />
      </div>
    </df-tutorial-alert>

    <div class="d-flex align-start ga-1 my-2">
      <v-text-field
        v-model="localExpr"
        :label="t('expr')"
        :error-messages="parsingError ?? undefined"
        color="primary"
        density="compact"
        variant="outlined"
        hide-details="auto"
        class="flex-grow-1"
      />
      <df-agent-chat-action
        :action-id="'help-expression-' + idx"
        :visible-prompt="t('helpExpression')"
        :hidden-context="expressionContext"
        :title="t('helpExpression')"
      />
    </div>

    <div
      ref="tableSentinel"
      class="expr-table-sentinel"
    />
    <dataset-table
      :height="tableHeight"
      :cols="inputFieldKeys"
      :synthetic-columns="syntheticCols"
      no-interaction
      search-only
      header-keys
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  results: Résultats
  expr: Expression
  emptyExpr: Saisissez une expression
  helpExpression: Aide-moi à écrire l'expression
  exprEvalIntro: "Une expression (ou formule) est utilisée pour calculer le contenu d'une colonne en fonction des valeurs des autres colonnes.
    Elle doit suivre la syntaxe du module <a href=\"https://github.com/silentmatt/expr-eval\" target=\"_blank\" rel=\"noopener\">expr-eval</a>.
    Les valeurs des autres colonnes sont passées en paramètre avec leurs clés comme nom du paramètre."
  exprEvalFunctions: "Quelques fonctions sont disponibles rappelant des fonctionnalités habituelles de tableurs :"
en:
  results: Results
  expr: Expression
  emptyExpr: Write an expression
  helpExpression: Help write the expression
  exprEvalIntro: "An expression (or formula) is used to calculate the content of a column based on the values of other columns.
    It must follow the syntax of the <a href=\"https://github.com/silentmatt/expr-eval\" target=\"_blank\" rel=\"noopener\">expr-eval</a> module.
    The values of other columns are passed as parameters with their keys as parameter names."
  exprEvalFunctions: "Some functions are available, similar to usual spreadsheet features:"
</i18n>

<script setup lang="ts">
import { useWindowSize, useResizeObserver } from '@vueuse/core'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import DatasetExprEvalDoc from './dataset-expr-eval-doc.vue'
import DatasetTable from '~/components/dataset/table/dataset-table.vue'
import type { SyntheticColumn } from '~/components/dataset/table/use-headers'
import type { ExtendedResult } from '~/composables/dataset/lines'
import useExprEvalValidation from '~/composables/dataset/expr-eval-validation'
// @ts-ignore -- shared module
import { getExtensionKey } from '#shared/utils/extensions.js'

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

const localExpr = ref(props.extension.expr ?? '')

const expressionContext = computed(() => {
  const name = props.extension.property?.['x-originalName'] || props.extension.property?.key || 'calculated column'
  return `The user wants help writing an expr-eval expression for calculated column "${name}" (type: ${props.extension.property?.type || 'string'}, extension index: ${props.idx}). ` +
    (localExpr.value ? `The current expression is: ${localExpr.value}. ` : '') +
    'Start by asking the user what they want to compute or achieve with this column. Do NOT call the expression_helper subagent until you understand the user\'s intent. ' +
    'Once you receive the expression from the subagent, present it and the test results to the user. If approved, use the set_expression tool to apply it. If the user wants changes, adjust accordingly.'
})

watch(localExpr, (val) => emit('update:expr', val))
watch(() => props.extension.expr, (val) => {
  if (val !== localExpr.value) localExpr.value = val ?? ''
})

const liveProperty = computed(() =>
  props.dataset?.schema?.find((p: any) => p.key === props.extension.property?.key) ?? props.extension.property
)

const { parsingError, parsedExpression } = useExprEvalValidation(
  localExpr,
  () => props.dataset,
  liveProperty,
  () => t('emptyExpr')
)

const inputFieldKeys = computed<string[]>(() =>
  props.dataset.schema
    .filter((f: any) => f['x-extension'] !== props.extension.property?.key)
    .map((f: any) => f.key)
)

// WARNING: the body of this function mirrors logic in server/utils/extensions.ts
function buildRowData (row: ExtendedResult): any {
  const raw = row.raw
  const rowData: any = {}
  for (const key of Object.keys(raw)) {
    const parts = key.split('.')
    let target = rowData
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in target)) target[parts[i]] = {}
      target = target[parts[i]]
    }
    target[parts[parts.length - 1]] = raw[key]
  }
  for (const prop of props.dataset.schema) {
    const ext = props.dataset.extensions?.find((e: any) => prop.key.startsWith(getExtensionKey(e) + '.'))
    if (ext) {
      const extKey = getExtensionKey(ext)
      rowData[extKey] = rowData[extKey] ? { ...rowData[extKey] } : {}
      const shortKey = prop.key.replace(extKey + '.', '')
      rowData[extKey][shortKey] = rowData[extKey][shortKey] ?? null
    } else {
      rowData[prop.key] = rowData[prop.key] ?? null
    }
  }
  return rowData
}

function truncateText (value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length > 50) return str.substring(0, 50) + '...'
  return str
}

const syntheticCols = computed<SyntheticColumn[]>(() => [{
  key: '_exprResult',
  title: t('results'),
  position: 'first',
  sticky: true,
  render: (row) => {
    if (!parsedExpression.value) return { text: '' }
    try {
      const result = parsedExpression.value(buildRowData(row))
      return {
        text: truncateText(result),
        title: String(result ?? ''),
        class: 'text-primary font-weight-bold'
      }
    } catch (err: any) {
      return {
        text: truncateText(err.message),
        title: err.message,
        class: 'text-error font-weight-bold'
      }
    }
  }
}])

const { height: windowHeight } = useWindowSize()
const previewRoot = ref<HTMLElement>()
const tableSentinel = ref<HTMLElement>()
const sentinelTop = ref(200)
const measureSentinel = () => {
  if (tableSentinel.value) sentinelTop.value = tableSentinel.value.getBoundingClientRect().top
}
onMounted(() => {
  nextTick(measureSentinel)
  // dialog-bottom-transition: re-measure after the animation settles
  setTimeout(measureSentinel, 500)
})
watch(windowHeight, () => nextTick(measureSentinel))
useResizeObserver(previewRoot, () => nextTick(measureSentinel))
const tableHeight = computed(() => Math.max(300, windowHeight.value - sentinelTop.value - 96))
</script>

<style scoped>
.extension-expr-eval-preview {
  max-height: calc(100vh - 48px - 40px);
  overflow: hidden;
}
.expr-eval-help-scroll {
  max-height: calc(50vh - 32px);
  overflow-y: auto;
  padding-right: 8px;
}
</style>
