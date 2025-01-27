import eventBus from '~/event-bus'
import { mapGetters } from 'vuex'

export default {
  data () {
    return {
      addPublicationDialog: false,
      newPublicationValid: false,
      newPublication: { catalog: null, status: 'waiting' },
      newPublicationAction: 'newDataset',
      deletePublicationInd: null,
      rePublishInd: null,
      showDeleteDialog: false,
      showRepublishDialog: false,
      catalogs: []
    }
  },
  async created () {
    let owner = this.resource.owner.type + ':' + this.resource.owner.id
    if (!this.resource.owner.department) owner += ':-'
    this.catalogs = (await this.$axios.$get('api/v1/catalogs', { params: { owner } })).results
    eventBus.$on(this.journalChannel, this.onJournalEvent)
  },
  async destroyed () {
    eventBus.$off(this.journalChannel, this.onJournalEvent)
  },
  watch: {
    addPublicationDialog () {
      this.newPublication = { catalog: null, status: 'waiting' }
    }
  },
  computed: {
    ...mapGetters(['userOwnerRole']),
    ...mapGetters('session', ['activeAccount']),
    catalogsById () {
      return this.catalogs.reduce((a, c) => { a[c.id] = c; return a }, {})
    },
    authorizedCatalogs () {
      if (this.userOwnerRole(this.resource.owner) !== 'admin') return []
      if (this.resource.owner.department) {
        if (this.activeAccount.department === this.resource.owner.department) {
          return this.catalogs.filter(c => c.owner.department === this.resource.owner.department)
        } else {
          return this.catalogs.filter(c => c.owner.department === this.resource.owner.department || !c.owner.department)
        }
      }
      return this.catalogs
    }
  },
  methods: {
    onJournalEvent (event) {
      if (event.type === 'publication') this.fetchInfo()
    },
    addPublication (publication) {
      this.resource.publications.push(publication)
      this.patch({ publications: this.resource.publications })
    },
    deletePublication (publicationInd) {
      this.resource.publications[publicationInd].status = 'deleted'
      this.patch({ publications: this.resource.publications })
    },
    rePublish (publicationInd) {
      this.resource.publications[publicationInd].status = 'waiting'
      this.patch({ publications: this.resource.publications })
    },
    catalogLabel (catalog) {
      if (!catalog) return 'catalogue inconnu'
      let label = `${catalog.title} - ${catalog.url}`
      if (catalog.organization && catalog.organization.id) label += ` (${catalog.organization.name})`
      return label
    }
  }
}
