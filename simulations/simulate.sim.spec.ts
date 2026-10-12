/**
 * One judged scenario per case, run by lib-agents-sim's runSimulation: the test fails
 * only when the run itself is invalid. Whether the product served the person is the
 * judge's call, from the transcript.
 */
import { test } from '../tests/fixtures/login.ts'
import { clean } from '../tests/support/axios.ts'
import { CHAT_FRAME, runSimulation, selectCases, simCaseNames } from '@data-fair/lib-agents-sim'
import { cases } from './cases/index.ts'
import { seedDatasets } from './runner/fixtures.ts'
import { ROOT, seedSettings, OWNER, OWNER_USER } from './runner/settings.ts'

for (const simCase of selectCases(cases, simCaseNames())) {
  test(`simulation: ${simCase.name}`, async ({ page, goToWithAuth }) => {
    await runSimulation(page, simCase, {
      agentsUrl: `${ROOT}/agents`,
      locale: 'fr',
      setup: async ({ assistantModel, toolsModel }) => {
        await clean()
        const ownerAx = await seedDatasets()
        await seedSettings(assistantModel, toolsModel, ownerAx)
        await goToWithAuth(simCase.route, OWNER_USER, { org: OWNER.id })
      },
      // The back-office page gets more room than the chat panel: a dataset page's
      // metadata form alone fills the default budget, and the persona has the
      // conversation as text anyway.
      perceptionRoots: [{ label: 'page', root: page, cap: 6000 }, { label: 'chat panel', root: page.frameLocator(CHAT_FRAME) }]
    })
  })
}
