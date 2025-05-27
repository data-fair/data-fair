import { internalError } from '@data-fair/lib-node/observer.js'
import axios from './axios.js'
import Debug from 'debug'

const debug = Debug('catalogs-publication-queue')

type CatalogsPublicationQueueOptions = {
  catalogsUrl: string
  catalogsSecret: string
}

type Queue = {
  update: string[]
  delete: string[]
}

export class CatalogsPublicationQueue {
  _options: CatalogsPublicationQueueOptions | undefined
  catalogsPublicationQueue: Queue = { update: [], delete: [] }
  stopped = false
  currentDrainPromise: Promise<void> | undefined

  options () {
    if (!this._options) throw new Error('catalogs queue was not initialized')
    return this._options
  }

  start = async (options: CatalogsPublicationQueueOptions) => {
    if (this._options) throw new Error('catalogs queue was already initialized')
    this._options = options
    this.loop()
  }

  stop = async () => {
    this.stopped = true
    if (this.currentDrainPromise) await this.currentDrainPromise
    await this.drain()
  }

  async loop () {
    while (!this.stopped) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.currentDrainPromise = this.drain()
      await this.currentDrainPromise
      this.currentDrainPromise = undefined
    }
  }

  async drain () {
    if (this.catalogsPublicationQueue.update.length > 0 || this.catalogsPublicationQueue.delete.length > 0) {
      const queue = { ...this.catalogsPublicationQueue }
      this.catalogsPublicationQueue = { update: [], delete: [] }
      debug('drain', queue.update.length + queue.delete.length, 'publications')
      try {
        await axios.post(this.options().catalogsUrl + '/api/datasets', queue, { headers: { 'x-secret-key': this.options().catalogsSecret } })
      } catch (err: any) {
        internalError('catalogs-publication-queue', err)
        // retry later
        if (err.status >= 500 && (queue.update.length + queue.delete.length < 100)) {
          this.catalogsPublicationQueue.update = queue.update.concat(this.catalogsPublicationQueue.update)
          this.catalogsPublicationQueue.delete = queue.delete.concat(this.catalogsPublicationQueue.delete)
        }
      }
    }
  }

  updatePublication (dataset: string) {
    if (this.stopped) throw new Error('catalogs queue has been stopped')
    this.catalogsPublicationQueue.update.push(dataset)
  }

  deletePublication (dataset: string) {
    if (this.stopped) throw new Error('catalogs queue has been stopped')
    this.catalogsPublicationQueue.delete.push(dataset)
  }
}

const catalogsPublicationQueue = new CatalogsPublicationQueue()

export default catalogsPublicationQueue
