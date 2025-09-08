export type WorkerId = 'shortProcessor' | 'batchProcessor' | 'filesManager' | 'filesProcessor'

export type DatasetTask = {
  name: string
  eventsPrefix?: string
  worker: WorkerId
  mongoFilter: () => any
}

export type ApplicationTask = {
  name: string
  eventsPrefix?: string
  worker: WorkerId
  mongoFilter: () => any
}

export type CatalogTask = {
  name: string
  eventsPrefix?: string
  worker: WorkerId
  mongoFilter: () => any
}

export type Task = DatasetTask | ApplicationTask | CatalogTask
