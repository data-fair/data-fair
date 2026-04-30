import type { MaybeRefOrGetter } from 'vue'
// @ts-ignore -- shared module
import exprEvalFactory from '#shared/expr-eval.js'

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const exprEval = exprEvalFactory(timezone)

export type ExprValidationResult = {
  parsingError: string | null
  parsedExpression: ((row: any) => any) | null
}

/**
 * Pure (non-reactive) validation of an expr-eval expression.
 * Returns the compiled expression and/or the parsing error.
 */
export const validateExprEval = (
  expr: string | undefined,
  dataset: any,
  property: any,
  emptyMessage?: string
): ExprValidationResult => {
  if (!expr || !expr.trim()) {
    return { parsingError: emptyMessage ?? null, parsedExpression: null }
  }
  try {
    const liveProperty = dataset?.schema?.find((p: any) => p.key === property?.key) ?? property
    return { parsingError: null, parsedExpression: exprEval.compile(expr, liveProperty) }
  } catch (err: any) {
    return { parsingError: err.message, parsedExpression: null }
  }
}

/**
 * True when any `exprEval` extension in the dataset has an invalid expression.
 */
export const hasInvalidExprEvalExtension = (dataset: any): boolean => {
  const extensions = dataset?.extensions ?? []
  return extensions.some((ext: any) => {
    if (ext.type !== 'exprEval') return false
    // Empty is considered invalid for the purpose of blocking save.
    if (!ext.expr || !ext.expr.trim()) return true
    return validateExprEval(ext.expr, dataset, ext.property).parsingError !== null
  })
}

export const useExprEvalValidation = (
  expr: MaybeRefOrGetter<string | undefined>,
  dataset: MaybeRefOrGetter<any>,
  property: MaybeRefOrGetter<any>,
  emptyMessage?: MaybeRefOrGetter<string | undefined>
) => {
  const parsingError = ref<string | null>(null)
  const parsedExpression = ref<((row: any) => any) | null>(null)

  watch(
    () => [toValue(expr), toValue(dataset), toValue(property), toValue(emptyMessage)] as const,
    ([exprVal, datasetVal, propertyVal, emptyMsg]) => {
      const result = validateExprEval(exprVal, datasetVal, propertyVal, emptyMsg)
      parsingError.value = result.parsingError
      parsedExpression.value = result.parsedExpression
    },
    { immediate: true }
  )

  return { parsingError, parsedExpression }
}

export default useExprEvalValidation
