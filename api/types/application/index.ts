import type { Application } from './.type/index.js'
export * from './.type/index.js'

export type ApplicationExt = Application & { visibility: 'public' | 'private' | 'protected', thumbnail?: string }
