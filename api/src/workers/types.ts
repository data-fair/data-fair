import { Application, DatasetInternal } from '#types'

export type WorkerId = 'shortProcessor' | 'batchProcessor' | 'filesManager' | 'filesProcessor'

export type DatasetTask = {
  name: string
  eventsPrefix?: string
  worker: WorkerId
  mongoFilter: () => any
  jsFilter: (dataset: DatasetInternal) => boolean | undefined
}

export type ApplicationTask = {
  name: string
  worker: WorkerId
  mongoFilter: () => any
  jsFilter: (application: Application) => boolean | undefined
}

export type CatalogTask = {
  name: string
  worker: WorkerId
  mongoFilter: () => any
  jsFilter: (catalog: any) => boolean | undefined
}

export type Task = DatasetTask | ApplicationTask | CatalogTask
