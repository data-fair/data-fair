import type { Ref } from 'vue'
import { useAgentTool, useAgentSubAgent } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator, agentToolError } from '~/composables/agent/utils'
// @ts-ignore -- shared module, no types
import exprEvalFactory from '#shared/expr-eval.js'

const messages: Record<string, Record<string, string>> = {
  fr: {
    getExpressionContext: 'Obtenir le contexte de l\'expression',
    getSampleData: 'Lire des exemples de données',
    testExpression: 'Tester une expression',
    setExpression: 'Définir l\'expression',
    expressionHelper: 'Aide à l\'écriture d\'expressions',
    expressionHelperDesc: 'Aide à écrire des expressions pour les colonnes calculées. Décrivez le calcul souhaité.'
  },
  en: {
    getExpressionContext: 'Get expression context',
    getSampleData: 'Read sample data',
    testExpression: 'Test an expression',
    setExpression: 'Set the expression',
    expressionHelper: 'Expression writing helper',
    expressionHelperDesc: 'Help write expressions for calculated columns. Describe the desired computation.'
  }
}

function csvEscape (value: any): string {
  if (value == null) return ''
  const s = String(value)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv (rows: Record<string, any>[]): string {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  return [keys.map(csvEscape).join(','), ...rows.map(row => keys.map(k => csvEscape(row[k])).join(','))].join('\n')
}

function getAvailableSchema (dataset: any, extensionIndex: number) {
  const schema = dataset.schema ?? []
  const extensions = dataset.extensions ?? []

  // collect keys produced by extensions at or after the current index
  const laterExtensionKeys = new Set<string>()
  for (let i = extensionIndex; i < extensions.length; i++) {
    const ext = extensions[i]
    if (ext.type === 'exprEval' && ext.property?.key) {
      laterExtensionKeys.add(ext.property.key)
    }
  }

  return schema.filter((col: any) =>
    !['_i', '_id', '_rand'].includes(col.key) &&
    !laterExtensionKeys.has(col.key)
  )
}

export function useAgentExpressionTools (
  locale: Ref<string>,
  datasetData: Ref<any>,
  setExpression: (extensionIndex: number, expr: string) => void
) {
  const t = createAgentTranslator(messages, locale)
  const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const exprEval = exprEvalFactory(defaultTimezone)

  useAgentTool({
    name: 'get_expression_context',
    description: 'Get the dataset columns available as variables and the target calculated column definition. Always call this first.',
    annotations: { title: t('getExpressionContext'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        extensionIndex: { type: 'number' as const, description: 'Index of the extension in the extensions array' }
      },
      required: ['extensionIndex'] as const
    },
    execute: async (params) => {
      const dataset = datasetData.value
      if (!dataset) return agentToolError('Error', 'No dataset loaded')

      const ext = dataset.extensions?.[params.extensionIndex]
      if (!ext || ext.type !== 'exprEval') return agentToolError('Error', `No exprEval extension at index ${params.extensionIndex}`)

      const availableSchema = getAvailableSchema(dataset, params.extensionIndex)

      const schemaTable = availableSchema.map((col: any) => {
        const notes: string[] = []
        if (col.description) notes.push(col.description)
        if (col['x-concept']?.title) notes.push(`concept: ${col['x-concept'].title}`)
        return `| \`${col.key}\` | ${col.type}${col.format ? ' (' + col.format + ')' : ''} | ${col.title || col['x-originalName'] || ''} | ${notes.join(' — ')} |`
      })

      const sections = [
        '## Available columns (use as variables in expressions)',
        '| Key | Type | Title | Notes |',
        '|-----|------|-------|-------|',
        ...schemaTable,
        '',
        '## Target calculated column',
        `- Key: \`${ext.property?.key}\``,
        `- Name: ${ext.property?.['x-originalName'] || '(unnamed)'}`,
        `- Type: ${ext.property?.type || 'string'}${ext.property?.format ? ' (' + ext.property.format + ')' : ''}`,
        ext.expr ? `- Current expression: \`${ext.expr}\`` : '- No expression set yet'
      ]
      return sections.join('\n')
    }
  })

  useAgentTool({
    name: 'get_sample_data',
    description: 'Fetch a few sample rows from the dataset to see real values of the columns available as variables.',
    annotations: { title: t('getSampleData'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        extensionIndex: { type: 'number' as const, description: 'Index of the extension in the extensions array' }
      },
      required: ['extensionIndex'] as const
    },
    execute: async (params) => {
      const dataset = datasetData.value
      if (!dataset?.id) return agentToolError('Error', 'No dataset loaded')

      const availableSchema = getAvailableSchema(dataset, params.extensionIndex)
      const select = availableSchema.map((col: any) => col.key).join(',')

      try {
        const data = await $fetch<any>(`datasets/${encodeURIComponent(dataset.id)}/lines`, {
          query: { size: '5', select }
        })
        const rows = (data.results ?? []).map((row: any) => {
          const { _id, _i, _rand, ...clean } = row
          return clean
        })
        return [
          `**${data.total}** total rows, showing 5 samples:`,
          '',
          toCsv(rows)
        ].join('\n')
      } catch (err) {
        return agentToolError('Failed to fetch sample data', err)
      }
    }
  })

  useAgentTool({
    name: 'test_expression',
    description: 'Validate and evaluate an expression against sample data. Returns validation errors or the computed results for each sample row.',
    annotations: { title: t('testExpression'), readOnlyHint: true },
    inputSchema: {
      type: 'object' as const,
      properties: {
        extensionIndex: { type: 'number' as const, description: 'Index of the extension in the extensions array' },
        expression: { type: 'string' as const, description: 'The expr-eval expression to test' }
      },
      required: ['extensionIndex', 'expression'] as const
    },
    execute: async (params) => {
      const dataset = datasetData.value
      if (!dataset) return agentToolError('Error', 'No dataset loaded')

      const ext = dataset.extensions?.[params.extensionIndex]
      if (!ext || ext.type !== 'exprEval') return agentToolError('Error', `No exprEval extension at index ${params.extensionIndex}`)

      const availableSchema = getAvailableSchema(dataset, params.extensionIndex)
      const fullSchema = dataset.schema ?? []

      // Step 1: syntax and variable check
      const checkError = exprEval.check(params.expression, availableSchema, fullSchema)
      if (checkError) return `**Validation error:** ${checkError}`

      // Step 2: compile
      let evaluate: (data: any) => any
      try {
        evaluate = exprEval.compile(params.expression, ext.property, locale.value)
      } catch (err: any) {
        return `**Compilation error:** ${err.message}`
      }

      // Step 3: fetch sample data and evaluate
      try {
        const select = availableSchema.map((col: any) => col.key).join(',')
        const data = await $fetch<any>(`datasets/${encodeURIComponent(dataset.id)}/lines`, {
          query: { size: '5', select }
        })

        const results: string[] = ['| Row | Result |', '|-----|--------|']
        for (let i = 0; i < (data.results ?? []).length; i++) {
          const row = data.results[i]
          const { _id, _i, _rand, ...clean } = row
          try {
            const result = evaluate(clean)
            results.push(`| ${i + 1} | ${result === null || result === undefined ? '(empty)' : csvEscape(String(result))} |`)
          } catch (err: any) {
            results.push(`| ${i + 1} | **Error:** ${err.message} |`)
          }
        }

        return [
          `**Expression:** \`${params.expression}\``,
          `**Target type:** ${ext.property?.type || 'string'}`,
          '',
          ...results
        ].join('\n')
      } catch (err) {
        return agentToolError('Failed to fetch sample data for testing', err)
      }
    }
  })

  useAgentTool({
    name: 'set_expression',
    description: 'Set the expression on the calculated column. Only call this after the expression has been tested successfully.',
    annotations: { title: t('setExpression') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        extensionIndex: { type: 'number' as const, description: 'Index of the extension in the extensions array' },
        expression: { type: 'string' as const, description: 'The validated expr-eval expression to set' }
      },
      required: ['extensionIndex', 'expression'] as const
    },
    execute: async (params) => {
      try {
        setExpression(params.extensionIndex, params.expression)
        return `Expression set successfully: \`${params.expression}\``
      } catch (err) {
        return agentToolError('Failed to set expression', err)
      }
    }
  })

  useAgentSubAgent({
    name: 'expression_helper',
    title: t('expressionHelper'),
    description: t('expressionHelperDesc'),
    prompt: `You are an expression writing assistant for Data Fair, a data management platform. You help users write expr-eval expressions for calculated columns.

## Workflow
1. The extension index and the user's description of what they want are provided in the context.
2. Call get_expression_context with the extensionIndex to understand available columns and the target property type.
3. Call get_sample_data to see real data values.
4. Write an expression and call test_expression to validate it.
5. If there are errors, fix and retry.
6. Once the expression works correctly, return the validated expression and test results as your final response.

## Expression Language Reference

Variables are column keys from the dataset schema.

### Operators
- Arithmetic: +, -, *, /, %, ^
- Comparison: ==, !=, <, >, <=, >=
- Logical: and, or, not
- Ternary: condition ? trueValue : falseValue
- Membership: x in (a, b, c)

### Function definition
f(x) = x * 2; f(column_name)

### String Functions
- CONCAT(a, b, ...) or CONCATENATE(a, b, ...): join values into a string. Null values become empty strings.
- UPPER(str): convert to uppercase
- LOWER(str): convert to lowercase
- TRIM(str): trim and normalize whitespace
- TITLE(str): Title Case
- PHRASE(str): capitalize first letter, lowercase rest
- SUBSTRING(str, start, length?): extract substring (0-based)
- REPLACE(str, search, replace): replace all occurrences
- EXTRACT(str, before, after): extract text between two delimiters. Returns undefined if delimiters not found.
- SLUG(str, replacement?): URL-friendly slug (default separator: "-")
- STRPOS(str, search): position of substring, -1 if not found
- SPLIT(str, separator): split string into array
- JOIN(array, separator?): join array into string (default: ",")
- PAD_LEFT(str, length, pad): pad string on the left
- PAD_RIGHT(str, length, pad): pad string on the right

### Math Functions
- SUM(a, b, ...): sum of numeric arguments (ignores non-numbers)
- AVG(a, b, ...) or AVERAGE(a, b, ...): average of numeric arguments

### Date Functions
- TRANSFORM_DATE(value, inputFormat, outputFormat, inputTimezone?, outputTimezone?): transform date formats
  - Formats use dayjs tokens: YYYY, MM, DD, HH, mm, ss, etc.
  - Special input formats: "X" (unix seconds), "x" (unix milliseconds)
  - Empty string for inputFormat = auto-detect

### Special Functions
- MD5(str) or MD5(a, b, ...): MD5 hash
- JSON_PARSE(str): parse JSON string to object
- GET(obj, key, default?): get property from parsed JSON object
- TRUTHY(val): boolean truthiness
- DEFINED(val): true if value is not null/undefined

### Important
- Use exact column keys as variables (not titles or original names).
- The result must match the target property type (string, number, integer, boolean).
- For string results that should be arrays, use a separator defined on the property.
- Respond in the same language as the user.`,
    tools: ['get_expression_context', 'get_sample_data', 'test_expression']
  })
}
