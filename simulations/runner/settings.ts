/**
 * Point the simulation owner's agent settings at the Claude Code bridge, so the
 * assistant under test runs on a real model instead of the dev mock provider.
 */

import type { ConversationExport, ParsedExport } from '@data-fair/lib-agents-sim'

export const ROOT = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`

export const BRIDGE_URL = process.env.BRIDGE_URL ?? `http://localhost:${process.env.BRIDGE_PORT ?? 3194}/v1`

/** An org rather than a user: it is the account shape most Data Fair users work
 *  in, and `clean()` resets anything matching /^test_/ between runs. */
export const OWNER = { type: 'organization', id: 'test_org1' } as const
/** Admin of OWNER per dev/resources/organizations.json. */
export const OWNER_USER = 'test_user1'
/** Global admin, needed to write another owner's agent settings. */
const SUPER_ADMIN = 'test_superadmin@test.com'

export const MODEL_ROLES = ['assistant', 'tools', 'summarizer', 'evaluator', 'moderator'] as const

const provider = {
  id: 'bridge',
  type: 'openai-compatible',
  name: 'Claude Code Bridge',
  enabled: true,
  baseURL: BRIDGE_URL,
  // MANDATORY. In 'default' mode createModel targets /v1/responses, which the
  // bridge does not implement.
  compatibility: 'compatible'
}

const quotas = {
  admin: { unlimited: true, monthlyLimit: 0 },
  contrib: { unlimited: false, monthlyLimit: 0 },
  user: { unlimited: false, monthlyLimit: 0 },
  external: { unlimited: false, monthlyLimit: 0 },
  anonymous: { unlimited: false, monthlyLimit: 0 },
  untrusted: { unlimited: false, monthlyLimit: 0 }
}

/**
 * Roles a deployment puts on a small model: sub-agents, compaction, the
 * moderation guard. Running them on the assistant's model would both cost more
 * per case and flatter the product — a sub-agent prompt that only a large model
 * can follow reads as working until a real deployment runs it on the cheap tier.
 * The evaluator is a trace-review role no run exercises, so it follows the
 * assistant rather than earning a third setting.
 */
const BACKGROUND_ROLES = ['tools', 'summarizer', 'moderator'] as const

/**
 * The two bodies the agents API takes since settings were split by author:
 * `superadmin` (the provider and the model catalog, each model listing the
 * roles it may serve) and `org` (which model each role uses, quotas, traces).
 * The org body is validated against the catalog, so it is written second.
 */
export function bridgeSettings (assistantModelId: string, toolsModelId: string) {
  const bridge = { type: 'openai-compatible', id: 'bridge', name: 'Claude Code Bridge' }
  const modelFor = (role: typeof MODEL_ROLES[number]) =>
    (BACKGROUND_ROLES as readonly string[]).includes(role) ? toolsModelId : assistantModelId
  const ids = [...new Set(MODEL_ROLES.map(modelFor))]
  return {
    superadmin: {
      providers: [provider],
      models: ids.map(id => ({
        model: { id, name: id, provider: bridge },
        usage: MODEL_ROLES.filter(role => modelFor(role) === id),
        inputPricePerMillion: 0,
        outputPricePerMillion: 0
      }))
    },
    org: {
      modelMapping: Object.fromEntries(
        MODEL_ROLES.map(role => [role, { provider: bridge.id, id: modelFor(role), name: modelFor(role) }])
      ) as Record<typeof MODEL_ROLES[number], { provider: string, id: string, name: string }>,
      quotas,
      // ON: a run is read back through the conversation export, and that route sits behind the
      // review gate, which needs stored traces
      storeTraces: true
    }
  }
}

/**
 * Write the two settings the assistant needs: the model provider, on the agents
 * service, and the flag that makes data-fair render the chat at all.
 * `ownerAx` is the owner-context client from seedDatasets.
 */
export async function seedSettings (assistantModelId: string, toolsModelId: string, ownerAx: any) {
  // Imported here rather than at module top level, so the unit suite (which
  // only needs bridgeSettings from this file) never loads
  // tests/support/axios.ts. Not a hazard avoidance: that module has no
  // authenticating side effect at load, it just isn't needed there.
  const { axiosAuth } = await import('../../tests/support/axios.ts')
  const admin = await axiosAuth(SUPER_ADMIN, undefined, true, { baseURL: ROOT })
  const { superadmin, org } = bridgeSettings(assistantModelId, toolsModelId)
  await admin.put(`/agents/api/settings/${OWNER.type}/${OWNER.id}`, superadmin)
  await admin.put(`/agents/api/settings/${OWNER.type}/${OWNER.id}/org`, org)
  // The agents service caps each account's AI credits before any quota, and a
  // production-mode image defaults that cap to 0: every request is refused with
  // a 429. -1 lifts it; consumption is reset so a run never inherits the last.
  await admin.post(`/agents/api/v1/limits/${OWNER.type}/${OWNER.id}`, {
    lastUpdate: new Date().toISOString(),
    ai_credits: { limit: -1, consumption: 0 }
  })
  // PATCH merges, so it preserves the owner's other settings.
  await ownerAx.patch(`/api/v1/settings/${OWNER.type}/${OWNER.id}`, { agentChat: true })
}

/** Fail loudly and early: without the bridge every case dies as an opaque timeout. */
export async function assertBridgeUp () {
  const statusUrl = BRIDGE_URL.replace(/\/v1$/, '') + '/_bridge/status'
  try {
    const res = await fetch(statusUrl, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    throw new Error(
      `The Claude Code bridge is not answering at ${statusUrl} (${err instanceof Error ? err.message : String(err)}).\n` +
      'Ask your user to start it with: npm run dev-bridge'
    )
  }
}

/** Trace consent, answered up front: the export only covers threads the person agreed to have reviewed. */
export const CONSENT_COOKIE = 'agent-chat-trace-consent'
export const CONSENT_YES = 'yes'

/**
 * The conversation exports of everything `userId` said on `owner` during the run: the file a
 * maintainer downloads to debug a real session. Every chat loop runs on the server, so this is the
 * only record of what the model was sent and what it called — the browser no longer sees it.
 * `clean()` ran before the case, so every thread of this person on this account is this run's.
 */
export async function fetchConversationExports (owner: { type: string, id: string }, userId: string): Promise<ConversationExport[]> {
  const { axiosAuth } = await import('../../tests/support/axios.ts')
  const admin = await axiosAuth(SUPER_ADMIN, undefined, true, { baseURL: ROOT })
  const base = `/agents/api/review/${owner.type}/${owner.id}`
  const listed = (await admin.get(`${base}?size=200`)).data.results as Array<{ conversationId: string, userId?: string, agentId?: string }>
  const exports: ConversationExport[] = []
  for (const conversation of listed.filter(c => c.userId === userId)) {
    // text: the body is JSONL, which axios would otherwise try to parse as one JSON value
    const res = await admin.get(`${base}/${conversation.conversationId}/export`, { responseType: 'text', transformResponse: [(data: string) => data] })
    exports.push({ conversationId: conversation.conversationId, agentId: conversation.agentId, jsonl: res.data })
  }
  return exports
}

/**
 * Runs that failed, by their own record. A provider failure is never the product's fault, and a run
 * that hit one must not be judged as though it were.
 */
export function runErrors (exports: ParsedExport[]): string[] {
  return exports.flatMap(exported => exported.runs.filter(run => run.status === 'error').map(run => run.stopReason ?? 'run ended in error'))
}
