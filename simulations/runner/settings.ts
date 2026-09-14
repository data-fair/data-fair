/**
 * Point the simulation owner's agent settings at the Claude Code bridge, so the
 * assistant under test runs on a real model instead of the dev mock provider.
 */

const ROOT = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`

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

// Defined inline rather than imported from a test helper: a static import of
// those would authenticate at module load, making the unit suite do network I/O
// before any test runs.
const quotas = {
  global: { unlimited: false, monthlyLimit: 10 },
  admin: { unlimited: true, monthlyLimit: 0 },
  contrib: { unlimited: false, monthlyLimit: 0 },
  user: { unlimited: false, monthlyLimit: 0 },
  external: { unlimited: false, monthlyLimit: 0 },
  anonymous: { unlimited: false, monthlyLimit: 0 },
  untrusted: { unlimited: false, monthlyLimit: 0 }
}

export function bridgeSettings (modelId: string) {
  const model = { id: modelId, name: modelId, provider: { type: 'openai-compatible', id: 'bridge', name: 'Claude Code Bridge' } }
  const role = { model, inputPricePerMillion: 0, outputPricePerMillion: 0 }
  return {
    providers: [provider],
    models: Object.fromEntries(MODEL_ROLES.map(r => [r, role])) as Record<typeof MODEL_ROLES[number], typeof role>,
    quotas,
    storeTraces: false
  }
}

/**
 * Write the two settings the assistant needs: the model provider, on the agents
 * service, and the flag that makes data-fair render the chat at all.
 * `ownerAx` is the owner-context client from seedDatasets.
 */
export async function seedSettings (modelId: string, ownerAx: any) {
  // Imported here rather than at module top level so the unit suite can load
  // this file for bridgeSettings without authenticating.
  const { axiosAuth } = await import('../../tests/support/axios.ts')
  const admin = await axiosAuth(SUPER_ADMIN, undefined, true, { baseURL: ROOT })
  await admin.put(`/agents/api/settings/${OWNER.type}/${OWNER.id}`, bridgeSettings(modelId))
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
