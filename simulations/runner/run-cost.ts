/**
 * What a run cost, read from its conversation exports: tool calls, the ones that failed, the line
 * writes among them, and the tokens the model calls report. Pure: the caller says which tools write
 * (they differ per arm of the line edition experiment).
 */
import type { ParsedExport } from '@data-fair/lib-agents-sim'

export type RunCost = {
  toolCalls: number,
  failedToolCalls: number,
  writeCalls: number,
  failedWriteCalls: number,
  tokens?: { input: number, output: number }
}

type Part = { type?: string, toolName?: string, state?: string, output?: unknown, __ref?: string, data?: { parts?: Part[] } }

/** A tool name without the `<server>__` prefix the agents service may give it. */
const bareToolName = (toolName: string) => {
  const sep = toolName.lastIndexOf('__')
  return sep === -1 ? toolName : toolName.slice(sep + 2)
}

/** An HTTP status of 400 or more, in an output object or announced in an output text. */
const httpStatusOf = (output: unknown): number | undefined => {
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    const status = Number(o.status ?? o.statusCode)
    return Number.isInteger(status) ? status : undefined
  }
  if (typeof output === 'string') {
    const match = /\b(?:HTTP|status(?:Code)?)\W{0,3}([1-5]\d\d)\b/i.exec(output)
    return match ? Number(match[1]) : undefined
  }
}

const isFailed = (part: Part) => part.state === 'output-error' || (httpStatusOf(part.output) ?? 0) >= 400

/** Every tool part of an export, a lifted part read back from its blob, a code_mode script's calls included. */
function toolParts (exported: ParsedExport): Part[] {
  const collect = (stub: Part): Part[] => {
    const part = (stub.__ref ? exported.blobs.get(stub.__ref) as Part | undefined : undefined) ?? stub
    if (part.type === 'data-subagent') return (part.data?.parts ?? []).flatMap(collect)
    return part.type === 'dynamic-tool' && part.toolName ? [part] : []
  }
  return exported.messages.flatMap(message => (message.parts as Part[]).flatMap(collect))
}

/** `isWriteTool` is given the bare tool name. A tool part in error state, or whose output carries an HTTP status >= 400, failed. */
export function costOf (parsed: ParsedExport[], isWriteTool: (name: string) => boolean): RunCost {
  const cost: RunCost = { toolCalls: 0, failedToolCalls: 0, writeCalls: 0, failedWriteCalls: 0 }
  for (const exported of parsed) {
    for (const part of toolParts(exported)) {
      const failed = isFailed(part)
      const write = isWriteTool(bareToolName(part.toolName!))
      cost.toolCalls++
      if (failed) cost.failedToolCalls++
      if (write) cost.writeCalls++
      if (write && failed) cost.failedWriteCalls++
    }
    for (const call of exported.runs.flatMap(run => run.calls)) {
      if (call.inputTokens === undefined && call.outputTokens === undefined) continue
      cost.tokens ??= { input: 0, output: 0 }
      cost.tokens.input += call.inputTokens ?? 0
      cost.tokens.output += call.outputTokens ?? 0
    }
  }
  return cost
}
