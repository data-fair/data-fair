/**
 * The datasets a case's person expects to find. Seeded fresh on every run after
 * clean(), so a case never inherits another run's state — and so a case that
 * writes metadata can never dirty the dev_fixtures demo data.
 */
import FormData from 'form-data'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { OWNER, OWNER_USER } from './settings.ts'

const resourcesDir = path.join(process.cwd(), 'simulations', 'resources')

/**
 * Create a file dataset with a fixed id from a CSV in simulations/resources.
 * The `body` part fixes the title so the person can recognise the dataset by
 * name, which is the whole point of the first case.
 */
async function uploadCsv (ax: any, id: string, file: string, body: Record<string, any>) {
  const form = new FormData()
  form.append('file', readFileSync(path.join(resourcesDir, file)), { filename: file, contentType: 'text/csv' })
  form.append('body', JSON.stringify(body))
  await ax.put(`/api/v1/datasets/${id}`, form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })
}

/**
 * The editable dataset the data-entry case works in: a subsidy-request register a
 * team already uses, so it has columns and a little history.
 *
 * It is REST rather than a CSV because that is the whole point — a file dataset
 * has no add-line dialog, and `open_add_line_dialog` refuses on a dataset with no
 * columns. One seeded row carries a deliberate mistake (a decimal slip: 12000
 * where the request was for 1200) so the "fix it" half of the case has something
 * real to fix, rather than asking the person to invent an error.
 */
async function seedRestRegister (ax: any) {
  await ax.post('/api/v1/datasets/sim-demandes-subvention', {
    isRest: true,
    title: 'Demandes de subvention des associations',
    description: 'Registre des demandes de subvention déposées par les associations, saisi par le service vie associative.',
    rest: { history: true },
    schema: [
      { key: 'association', type: 'string', title: 'Association', 'x-originalName': 'Association' },
      { key: 'objet', type: 'string', 'x-display': 'textarea', title: 'Objet de la demande', 'x-originalName': 'Objet de la demande' },
      { key: 'montant', type: 'number', title: 'Montant demandé (€)', 'x-originalName': 'Montant demandé (€)' },
      { key: 'contact', type: 'string', title: 'Contact', 'x-originalName': 'Contact' },
      { key: 'date_de_depot', type: 'string', format: 'date', title: 'Date de dépôt', 'x-originalName': 'Date de dépôt' }
    ]
  })

  await ax.post('/api/v1/datasets/sim-demandes-subvention/_bulk_lines', [
    {
      _id: 'dem-1',
      association: 'Harmonie municipale',
      objet: 'Achat de pupitres et de partitions pour la saison',
      montant: 800,
      contact: 'service vie associative',
      date_de_depot: '2026-02-04'
    },
    {
      // The decimal slip the person spots. Kept plausible: a judo club really
      // could ask for 1200, and 12000 is exactly the kind of error a register
      // accumulates.
      _id: 'dem-2',
      association: 'Club de judo du centre',
      objet: 'Renouvellement des tatamis de la salle municipale',
      montant: 12000,
      contact: 'service des sports',
      date_de_depot: '2026-02-18'
    }
  ])
}

/**
 * Upload every fixture and wait for indexing. Returns the owner-context client,
 * which seedSettings needs to flip the agentChat flag.
 */
export async function seedDatasets () {
  // Imported here rather than at module top level to keep this file's own
  // top-level free of a dependency it only needs inside this one function.
  // Not a hazard avoidance: tests/support/axios.ts has no authenticating
  // side effect at load, it just isn't needed until this call runs.
  const { axiosAuth, waitForWorkerIdle } = await import('../../tests/support/axios.ts')
  const ax = await axiosAuth(`${OWNER_USER}@test.com`, OWNER.id)

  await uploadCsv(ax, 'sim-equipements-sportifs', 'equipements-sportifs.csv', {
    title: 'Équipements sportifs',
    description: 'Recensement des équipements sportifs de l\'agglomération : gymnases, piscines, stades et salles.'
  })
  await uploadCsv(ax, 'sim-suivi-demandes', 'suivi-demandes.csv', {
    title: 'Suivi des demandes citoyennes',
    description: 'Demandes adressées aux services de la collectivité et leur état d\'avancement.'
  })

  await seedRestRegister(ax)

  // Indexing is asynchronous. Asking the assistant about a dataset that is
  // still finalising produces a transcript of the product failing at something
  // it was never given the chance to do.
  const idle = await waitForWorkerIdle(120_000)
  if (!idle) throw new Error('datasets were still being processed after 120s; the simulation would query an unindexed dataset')

  return ax
}
