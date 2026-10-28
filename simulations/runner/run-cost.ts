/**
 * What a run cost, read from its conversation exports: tool calls, the ones that failed, the line
 * writes among them, and the tokens the model calls report. Pure: the caller says which tools write
 * (they differ per arm of the line edition experiment).
 */
import type { ParsedExport } from '@data-fair/lib-agents-sim'
import { bareToolName, type ToolPart } from './autonomous-agent.ts'

export type RunCost = {
  toolCalls: number,
  failedToolCalls: number,
  writeCalls: number,
  failedWriteCalls: number,
  /** Lines the write calls put in (a bulk call counts its `nbOk`, any other write 1 when it did not fail). */
  linesWritten: number,
  /** Lines the write calls were refused (a bulk call counts its `nbErrors`, any other write 1 when it failed). */
  linesRefused: number,
  tokens?: { input: number, output: number }
}

type Part = ToolPart & { state?: string, output?: unknown, errorText?: unknown }

/**
 * A tool call failed when its part is stored in error state: the agents service turns an MCP tool's
 * `isError` result (an HTTP 4xx/5xx of the data-fair API included) into `output-error`. The output
 * of a successful call is DATA wrapped in a `<tool-result>` envelope, so its text is never read.
 */
const isFailed = (part: Part) => part.state === 'output-error'

const BULK = 'datafair_bulk_lines'

/** The text of a part's output (or error text), whatever its shape. */
const textOf = (value: unknown) => typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value)

/**
 * A json bulk call answers 200 even when lines are refused: its body (inside the `<tool-result>`
 * envelope) carries the counts. Undefined when the output has none.
 */
export function bulkCounts (output: unknown): { ok: number, refused: number } | undefined {
  const text = textOf(output)
  const refused = /"nbErrors"\s*:\s*(\d+)/.exec(text)
  if (!refused) return undefined
  return { ok: Number(/"nbOk"\s*:\s*(\d+)/.exec(text)?.[1] ?? 0), refused: Number(refused[1]) }
}

/** Every tool part of an export, a lifted part read back from its blob, a code_mode script's calls included. */
function toolParts (exported: ParsedExport): Part[] {
  const collect = (stub: Part): Part[] => {
    const part = (stub.__ref ? exported.blobs.get(stub.__ref) as Part | undefined : undefined) ?? stub
    if (part.type === 'data-subagent') return (part.data?.parts ?? []).flatMap(collect)
    return part.type === 'dynamic-tool' && part.toolName ? [part] : []
  }
  return exported.messages.flatMap(message => (message.parts as Part[]).flatMap(collect))
}

/**
 * `isWriteTool` is given the bare tool name. A tool part in error state failed. Lines are counted
 * per line, so that a bulk call of 10 rows and 10 form saves compare: a bulk call counts the lines
 * its body reports (`failedWriteCalls` counts it when any was refused), any other write is 1 line.
 */
export function costOf (parsed: ParsedExport[], isWriteTool: (name: string) => boolean): RunCost {
  const cost: RunCost = { toolCalls: 0, failedToolCalls: 0, writeCalls: 0, failedWriteCalls: 0, linesWritten: 0, linesRefused: 0 }
  for (const exported of parsed) {
    for (const part of toolParts(exported)) {
      const failed = isFailed(part)
      const write = isWriteTool(bareToolName(part.toolName!))
      cost.toolCalls++
      if (failed) cost.failedToolCalls++
      if (write) cost.writeCalls++
      if (!write) continue
      const bulk = bareToolName(part.toolName!) === BULK ? bulkCounts(failed ? part.errorText : part.output) : undefined
      if (bulk) {
        cost.linesWritten += bulk.ok
        cost.linesRefused += bulk.refused
        if (failed || bulk.refused) cost.failedWriteCalls++
      } else if (failed) {
        cost.failedWriteCalls++
        cost.linesRefused++
      } else cost.linesWritten++
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
