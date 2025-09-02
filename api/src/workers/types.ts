import { Application, Dataset } from '#types'

export type DatasetTask = {
  name: string
  worker: string
  resourceType: 'dataset'
  mongoFilter: any
  jsFilter: (dataset: Dataset) => boolean
}

export type ApplicationTask = {
  name: string
  worker: string
  resourceType: 'application'
  mongoFilter: any
  jsFilter: (application: Application) => boolean
}

export type Task = DatasetTask | ApplicationTask
