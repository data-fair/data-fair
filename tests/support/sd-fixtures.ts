/**
 * The accounts of data-fair's test sub-space in simple-directory: every user, organization and member id
 * (and every email) starts with the prefix, so this suite seeds and cleans them without touching the
 * accounts of other sub-spaces (e.g. the demo world test_demo_ of dev/resources/demo-world.json) nor the unprefixed ones.
 *
 * Seeded by tests/state-setup.ts through simple-directory's test API (POST /api/test-env/seed), after
 * a cleanup of the prefix (DELETE /api/test-env?prefix=). All the users with a password use 'passwd'.
 */
export const prefix = 'test_datafair_'

export const sdFixtures = (env: Record<string, string | undefined> = process.env) => {
  const users = [
    {
      id: 'test_datafair_user1',
      firstName: 'Test',
      lastName: 'User1',
      email: 'test_datafair_user1@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user2',
      firstName: 'Test',
      lastName: 'User2',
      email: 'test_datafair_user2@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user3',
      firstName: 'Test',
      lastName: 'User3',
      email: 'test_datafair_user3@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user4',
      firstName: 'Test',
      lastName: 'User4',
      email: 'test_datafair_user4@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user5',
      firstName: 'Test',
      lastName: 'User5',
      email: 'test_datafair_user5@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user6',
      firstName: 'Test',
      lastName: 'User6',
      email: 'test_datafair_user6@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user7',
      firstName: 'Test',
      lastName: 'User7',
      email: 'test_datafair_user7@test.com'
    },
    {
      id: 'test_datafair_user8',
      firstName: 'Test',
      lastName: 'User8',
      email: 'test_datafair_user8@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user9',
      firstName: 'Test',
      lastName: 'User9',
      email: 'test_datafair_user9@test.com'
    },
    {
      id: 'test_datafair_user10',
      firstName: 'Test',
      lastName: 'User10',
      email: 'test_datafair_user10@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_alone',
      firstName: 'Test',
      lastName: 'Alone',
      email: 'test_datafair_alone@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_user',
      firstName: 'Test',
      lastName: 'User',
      email: 'test_datafair_user@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_contrib',
      firstName: 'Test',
      lastName: 'Contrib',
      email: 'test_datafair_contrib@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_superadmin',
      firstName: 'Test',
      lastName: 'Superadmin',
      email: 'test_datafair_superadmin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_admin',
      firstName: 'Depts',
      lastName: 'Admin',
      email: 'test_datafair_depts_admin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_user',
      firstName: 'Depts',
      lastName: 'User',
      email: 'test_datafair_depts_user@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_data_admin',
      firstName: 'Depts Data',
      lastName: 'Admin',
      email: 'test_datafair_depts_data_admin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_data_contrib',
      firstName: 'Depts Data',
      lastName: 'Contrib',
      email: 'test_datafair_depts_data_contrib@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_data_user',
      firstName: 'Depts Data',
      lastName: 'User',
      email: 'test_datafair_depts_data_user@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_support_admin',
      firstName: 'Depts Support',
      lastName: 'Admin',
      email: 'test_datafair_depts_support_admin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_support_contrib',
      firstName: 'Depts Support',
      lastName: 'Contrib',
      email: 'test_datafair_depts_support_contrib@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_marketing_admin',
      firstName: 'Depts Marketing',
      lastName: 'Admin',
      email: 'test_datafair_depts_marketing_admin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_marketing_contrib',
      firstName: 'Depts Marketing',
      lastName: 'Contrib',
      email: 'test_datafair_depts_marketing_contrib@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_depts_multi_admin',
      firstName: 'Depts Multi',
      lastName: 'Admin',
      email: 'test_datafair_depts_multi_admin@test.com',
      password: { clear: 'passwd' }
    },
    {
      id: 'test_datafair_org1_agent_nhi',
      firstName: 'Agent',
      lastName: 'MCP',
      email: 'test_datafair_org1_agent_nhi@test.com',
      nhi: {
        provider: { issuer: `http://${env.DEV_HOST}:${env.NGINX_PORT}/agents/api/nhi` },
        subject: 'autonomous-agent:sim-mcp',
        scopes: ['all:read']
      }
    },
    {
      id: 'test_datafair_org1_lines_nhi',
      firstName: 'Agent',
      lastName: 'Lines',
      email: 'test_datafair_org1_lines_nhi@test.com',
      nhi: {
        provider: { issuer: `http://${env.DEV_HOST}:${env.NGINX_PORT}/agents/api/nhi` },
        subject: 'autonomous-agent:sim-lines',
        scopes: ['all:read', 'datasets:write']
      }
    },
    {
      id: 'test_datafair_org1_scope_nhi',
      firstName: 'Agent',
      lastName: 'Scope',
      email: 'test_datafair_org1_scope_nhi@test.com',
      nhi: {
        provider: {
          issuer: 'https://data-fair-tests.example.com',
          jwks: {
            keys: [
              {
                kty: 'RSA',
                n: 'qbPR4ZEmitVF8AlY4um3x_k0ZkLlQ0ZEgiuEAlqT1g0lZejC9Z6EBVU8gwSQhOmbZMr9-hauBeEMqxJZiDwfvjHxM-bRNr2db0PUpD9PlhVbLXTCd9S1L0Kta51bgrVMfxJDajf4XI5Alo176HBQ904zkBA-lO4WhuR3JZFt4EN2MNK6RB7PlBy75v0WtCMzPxdzAxUym4djJA8tRxJAuJYPZmXPsY9eQ3BWmfXm20ESviT6Bku8LJkSsQoJNZBQ8CzgV6MR0k1zYtS6vZW-FqiQ7tV2qLW6yKsaCSuj1WC06djhtAtmIEq5G6yItCq5SKyQPj2khcmy3B0USqtBCQ',
                e: 'AQAB',
                kid: 'test-nhi-key',
                alg: 'RS256',
                use: 'sig'
              }
            ]
          }
        },
        subject: 'scope-tests'
      }
    }
  ]

  const organizations = [
    {
      id: 'test_datafair_org1',
      name: 'Test Org 1',
      departments: [{ id: 'dep1', name: 'department 1' }, { id: 'dep2', name: 'department 2' }],
      partners: [{ id: 'test_datafair_org2', name: 'Test Org 2' }, { id: 'test_datafair_org3', name: 'Test Org 3' }],
      members: [
        { id: 'test_datafair_user1', role: 'admin' },
        { id: 'test_datafair_user5', role: 'contrib' },
        { id: 'test_datafair_user8', role: 'user' },
        { id: 'test_datafair_user10', role: 'contrib', department: 'dep2' },
        { id: 'test_datafair_user6', role: 'contrib', department: 'dep1' },
        { id: 'test_datafair_user4', role: 'admin', department: 'dep1' },
        { id: 'test_datafair_user4', role: 'admin', department: 'dep2' },
        { id: 'test_datafair_org1_agent_nhi', role: 'contrib' },
        { id: 'test_datafair_org1_lines_nhi', role: 'admin' },
        { id: 'test_datafair_org1_scope_nhi', role: 'admin' }
      ]
    },
    {
      id: 'test_datafair_org2',
      name: 'Test Org 2',
      members: [
        { id: 'test_datafair_user5', role: 'admin' },
        { id: 'test_datafair_user10', role: 'user' },
        { id: 'test_datafair_user6', role: 'user' }
      ]
    },
    {
      id: 'test_datafair_org3',
      name: 'Test Org 3',
      members: [
        { id: 'test_datafair_user3', role: 'admin' },
        { id: 'test_datafair_user2', role: 'admin' },
        { id: 'test_datafair_user10', role: 'user' },
        { id: 'test_datafair_user4', role: 'user' },
        { id: 'test_datafair_user1', role: 'user' }
      ]
    },
    {
      id: 'test_datafair_org4',
      name: 'Test Org 4',
      members: [{ id: 'test_datafair_user3', role: 'admin' }, { id: 'test_datafair_user7', role: 'user' }]
    },
    {
      id: 'test_datafair_org5',
      name: 'Test Org 5',
      members: [{ id: 'test_datafair_user10', role: 'admin' }]
    },
    {
      id: 'test_datafair_org6',
      name: 'Test Org 6',
      members: [
        { id: 'test_datafair_user7', role: 'admin' },
        { id: 'test_datafair_user5', role: 'admin' },
        { id: 'test_datafair_user3', role: 'user' },
        { id: 'test_datafair_user8', role: 'user' },
        { id: 'test_datafair_user9', role: 'user' },
        { id: 'test_datafair_superadmin', role: 'admin' }
      ]
    },
    {
      id: 'test_datafair_org_depts',
      name: 'Test Org Depts',
      departments: [
        { id: 'data', name: 'Data' },
        { id: 'support', name: 'Support' },
        { id: 'marketing', name: 'Marketing' }
      ],
      members: [
        { id: 'test_datafair_superadmin', role: 'admin' },
        { id: 'test_datafair_user9', role: 'user' },
        { id: 'test_datafair_user', role: 'user' },
        { id: 'test_datafair_contrib', role: 'contrib' },
        { id: 'test_datafair_depts_admin', role: 'admin' },
        { id: 'test_datafair_depts_user', role: 'user' },
        { id: 'test_datafair_depts_data_admin', role: 'admin', department: 'data' },
        { id: 'test_datafair_depts_data_contrib', role: 'contrib', department: 'data' },
        { id: 'test_datafair_depts_data_user', role: 'user', department: 'data' },
        { id: 'test_datafair_depts_support_admin', role: 'admin', department: 'support' },
        { id: 'test_datafair_depts_support_contrib', role: 'contrib', department: 'support' },
        { id: 'test_datafair_depts_marketing_admin', role: 'admin', department: 'marketing' },
        { id: 'test_datafair_depts_marketing_contrib', role: 'contrib', department: 'marketing' },
        { id: 'test_datafair_depts_multi_admin', role: 'admin', department: 'data' },
        { id: 'test_datafair_depts_multi_admin', role: 'admin', department: 'support' }
      ],
      partners: [{ id: 'test_datafair_org1', name: 'Test Org 1' }, { id: 'test_datafair_org6', name: 'Test Org 6' }]
    }
  ]

  return { prefix, users, organizations }
}

/** simple-directory's test API, reached directly (not through nginx) */
export const sdTestEnvUrl = (env: Record<string, string | undefined> = process.env) => `http://localhost:${env.SD_PORT}/api/test-env`

/** Clean the sub-space in simple-directory, then seed its accounts. Idempotent. */
export const seedSdFixtures = async (env: Record<string, string | undefined> = process.env) => {
  const url = sdTestEnvUrl(env)
  const cleanRes = await fetch(`${url}?prefix=${prefix}`, { method: 'DELETE' })
  if (cleanRes.status !== 204) throw new Error(`simple-directory refused the cleanup of ${prefix}: HTTP ${cleanRes.status} ${await cleanRes.text()}`)
  const seedRes = await fetch(`${url}/seed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sdFixtures(env))
  })
  if (seedRes.status !== 200) throw new Error(`simple-directory refused the seed of ${prefix}: HTTP ${seedRes.status} ${await seedRes.text()}`)
  return await seedRes.json() as { users: number, organizations: number }
}
