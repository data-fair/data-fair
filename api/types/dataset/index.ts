import type { Dataset } from './.type/index.js'
export * from './.type/index.js'

export type RestDataset = Omit<Dataset, 'isRest' | 'rest' | 'schema'> & { isRest: true } & Required<Pick<Dataset, 'rest' | 'schema'>>
