import { agentToolError } from '../agent/utils-logic'

export function getAvailableSchema (dataset: any, extensionIndex: number) {
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

export function executeGetExpressionContext (params: { extensionIndex: number }, dataset: any) {
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
