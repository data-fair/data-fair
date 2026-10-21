/**
 * Point the simulation owner's agent settings at the Claude Code bridge, so the
 * assistant under test runs on a real model instead of the dev mock provider.
 */
import { seedAgentsSettings } from '@data-fair/lib-agents-sim'

export const ROOT = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`

/** An org rather than a user: it is the account shape most Data Fair users work
 *  in, and `clean()` resets anything matching /^test_/ between runs. */
export const OWNER = { type: 'organization', id: 'test_org1' } as const
/** Admin of OWNER per dev/resources/organizations.json. */
export const OWNER_USER = 'test_user1'
/** Global admin, needed to write another owner's agent settings. */
const SUPER_ADMIN = 'test_superadmin@test.com'

/**
 * Write the two settings the assistant needs: the model provider, on the agents
 * service, and the flag that makes data-fair render the chat at all.
 * `ownerAx` is the owner-context client from seedDatasets.
 */
export async function seedSettings (assistantModelId: string, toolsModelId: string, ownerAx: any) {
  const { axiosAuth } = await import('../../tests/support/axios.ts')
  const admin = await axiosAuth(SUPER_ADMIN, undefined, true, { baseURL: ROOT })
  await seedAgentsSettings(admin, `${ROOT}/agents`, OWNER, assistantModelId, toolsModelId)
  // PATCH merges, so it preserves the owner's other settings.
  await ownerAx.patch(`/api/v1/settings/${OWNER.type}/${OWNER.id}`, {
    agentChat: true,
    // an organization that scores its metadata and adds its own, with a summary bound unlike the agent's former 300
    datasetsMetadata: {
      completeness: { active: true },
      summary: { recommendedMin: 80, recommendedMax: 180 },
      custom: [
        { title: 'Service producteur', description: 'Direction ou service de la collectivité qui produit et met à jour les données.' },
        { title: 'Thème interne', enum: ['Sport', 'Culture', 'Éducation', 'Voirie'], multiple: true }
      ]
    }
  })
}
