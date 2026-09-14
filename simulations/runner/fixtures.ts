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
 * Upload every fixture and wait for indexing. Returns the owner-context client,
 * which seedSettings needs to flip the agentChat flag.
 */
export async function seedDatasets () {
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

  // Indexing is asynchronous. Asking the assistant about a dataset that is
  // still finalising produces a transcript of the product failing at something
  // it was never given the chance to do.
  const idle = await waitForWorkerIdle(120_000)
  if (!idle) throw new Error('datasets were still being processed after 120s; the simulation would query an unindexed dataset')

  return ax
}
