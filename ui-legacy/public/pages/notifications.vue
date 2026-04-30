<template>
  <v-container>
    <h2
      v-t="'devices'"
      class="mt-8 mb-2 text-h5"
    />
    <d-frame
      :src="`${env.eventsUrl}/embed/devices`"
      resize
      @notif="emitFrameNotif"
    >
      <div slot="loader">
        <v-skeleton-loader type="paragraph" />
      </div>
    </d-frame>

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'datasetsOrgEvents', args: {name: activeAccount.name + (activeAccount.department ? ' / ' + (activeAccount.departmentName || activeAccount.department) : '')}}"
      class="mt-8 mb-2 text-h5"
    />
    <h2
      v-else
      v-t="'datasetsUserEvents'"
      class="mt-8 mb-2 text-h5"
    />
    <d-frame
      :src="datasetsSubscribeUrl"
      resize
      @notif="emitFrameNotif"
    >
      <div slot="loader">
        <v-skeleton-loader type="paragraph" />
      </div>
    </d-frame>

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'appsOrgEvents', args: {name: activeAccount.name + (activeAccount.department ? ' / ' + (activeAccount.departmentName || activeAccount.department) : '')}}"
      class="mt-8 mb-2 text-h5"
    />
    <h2
      v-else
      v-t="'appsUserEvents'"
      class="mt-8 mb-2 text-h5"
    />
    <d-frame
      :src="appsSubscribeUrl"
      resize
      @notif="emitFrameNotif"
    >
      <div slot="loader">
        <v-skeleton-loader type="paragraph" />
      </div>
    </d-frame>

    <h2
      v-t="{path: 'sites', args: {name: activeAccount.name}}"
      class="mt-8 mb-2 text-h5"
    />
    <v-select
      v-model="selectedSite"
      :items="publicationSites"
      :item-text="(site) => site.title || site.url || site.id"
      outlined
      style="max-width:500px"
      :label="$t('selectSite')"
      hide-details
      return-object
      class="mt-6 mb-3"
    />
    <template v-if="selectedSite">
      <d-frame
        :src="selectedSite.subscribeUrl"
        resize
        @notif="emitFrameNotif"
      >
        <div slot="loader">
          <v-skeleton-loader type="paragraph" />
        </div>
      </d-frame>
    </template>
    <div v-if="requestedDatasetPublicationSiteUrl">
      <d-frame
        :src="requestedDatasetPublicationSiteUrl"
        resize
      >
        <div slot="loader">
          <v-skeleton-loader type="paragraph" />
        </div>
      </d-frame>
    </div>
    <div v-if="requestedApplicationPublicationSiteUrl">
      <d-frame
        :src="requestedApplicationPublicationSiteUrl"
        resize
        @notif="emitFrameNotif"
      >
        <div slot="loader">
          <v-skeleton-loader type="paragraph" />
        </div>
      </d-frame>
    </div>
    <div v-if="userCreationPublicationSiteUrl">
      <d-frame
        :src="userCreationPublicationSiteUrl"
        resize
        @notif="emitFrameNotif"
      >
        <div slot="loader">
          <v-skeleton-loader type="paragraph" />
        </div>
      </d-frame>
    </div>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  devices: Appareils configurés pour recevoir vos notifications
  datasetsOrgEvents: "Événements des jeux de données de l'organisation {name}"
  datasetsUserEvents: Événements des jeux de données de votre compte personnel
  appsOrgEvents: "Événements des applications de l'organisation {name}"
  appsUserEvents: Événements des applications de votre compte personnel
  pubsEvents: "Événements de publication sur le portail {title}"
  datasetsPubRequested: "Demandes de publications de jeux de données"
  appsPubRequested: "Demandes de publications d'applications"
  datasetPublished: "Un jeu de données a été publié sur {title}"
  datasetPublishedTopic: "Un jeu de données a été publié dans la thématique {topic} sur {title}"
  datasetPublicationRequested: "Un contributeur demande de publier un jeu de données sur {title}"
  applicationPublicationRequested: "Un contributeur demande de publier une application sur {title}"
  userCreated: "Un utilisateur s'est enregistré sur {title}"
  sites: "Événements liés à un portail de l'organisation {name}"
  selectSite: "Sélectionnez un portail"
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import settingsSchema from '~/../../api/types/settings/schema.js'
import '@data-fair/frame/lib/d-frame.js'

const webhooksSchema = settingsSchema.properties.webhooks

export default {
  middleware: ['auth-required'],
  data: () => ({
    webhooksSchema,
    settingsPublicationSites: null,
    topics: null,
    selectedSite: null
  }),
  computed: {
    ...mapState(['env']),
    ...mapGetters('session', ['activeAccount', 'accountRole']),
    datasetsSubscribeUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const.startsWith('dataset') && item.const !== 'dataset-finalize-end')
      const keysParam = webhooks.map(w => 'data-fair:' + w.const).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      const urlTemplate = this.env.publicUrl + '/dataset/{id}'
      const searchParams = new URLSearchParams({
        key: keysParam,
        title: titlesParam,
        'url-template': urlTemplate,
        register: 'false',
        header: 'no'
      }).toString()
      return `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
    },
    appsSubscribeUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const.startsWith('application'))
      const keysParam = webhooks.map(w => 'data-fair:' + w.const).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      const urlTemplate = this.env.publicUrl + '/application/{id}'
      const searchParams = new URLSearchParams({
        key: keysParam,
        title: titlesParam,
        'url-template': urlTemplate,
        register: 'false',
        header: 'no'
      }).toString()
      return `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
    },
    publicationSites () {
      if (!this.settingsPublicationSites || !this.topics) return []
      return this.settingsPublicationSites.map(p => {
        const keys = [`data-fair:dataset-published:${p.type}:${p.id}`]
        const titles = [this.$t('datasetPublished', { title: p.title || p.url || p.id })]
        for (const topic of (this.topics || [])) {
          keys.push(`data-fair:dataset-published-topic:${p.type}:${p.id}:${topic.id}`)
          titles.push(this.$t('datasetPublishedTopic', { title: p.title || p.url || p.id, topic: topic.title }))
        }

        // we used to direct to the publication site, but it is better that a notif coming from the back-office directs to the back-office
        // and this prevents problem when subscribing before the publication of the site on a domain
        const urlTemplate = this.env.publicUrl + '/dataset/{id}'
        const searchParams = new URLSearchParams({
          key: keys.join(','),
          title: titles.join(','),
          'url-template': urlTemplate,
          register: 'false',
          header: 'no',
          sender: this.siteSender(p)
        }).toString()
        const subscribeUrl = `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
        return {
          ...p,
          subscribeUrl
        }
      })
    },
    requestedDatasetPublicationSiteUrl () {
      if (!this.selectedSite) return null
      if (this.activeAccount.department && this.activeAccount.department !== this.selectedSite.department) return
      const key = `data-fair:dataset-publication-requested:${this.selectedSite.type}:${this.selectedSite.id}`
      const title = this.$t('datasetPublicationRequested', { title: this.selectedSite.title || this.selectedSite.url || this.selectedSite.id })
      const urlTemplate = this.env.publicUrl + '/dataset/{id}'
      const searchParams = new URLSearchParams({
        key,
        title,
        'url-template': urlTemplate,
        register: 'false',
        header: 'no',
        sender: this.siteSender(this.selectedSite)
      }).toString()
      return `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
    },
    requestedApplicationPublicationSiteUrl () {
      if (!this.selectedSite) return null
      if (this.activeAccount.department && this.activeAccount.department !== this.selectedSite.department) return
      const key = `data-fair:application-publication-requested:${this.selectedSite.type}:${this.selectedSite.id}`
      const title = this.$t('applicationPublicationRequested', { title: this.selectedSite.title || this.selectedSite.url || this.selectedSite.id })
      const urlTemplate = this.env.publicUrl + '/application/{id}'
      const searchParams = new URLSearchParams({
        key,
        title,
        'url-template': urlTemplate,
        register: 'false',
        header: 'no',
        sender: this.siteSender(this.selectedSite)
      }).toString()
      return `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
    },
    userCreationPublicationSiteUrl () {
      if (!this.selectedSite) return null
      if (this.activeAccount.department && this.activeAccount.department !== this.selectedSite.department) return
      if (this.accountRole !== 'admin') return
      const key = `simple-directory:user-created:${this.selectedSite.type}:${this.selectedSite.id}`
      const title = this.$t('userCreated', { title: this.selectedSite.title || this.selectedSite.url || this.selectedSite.id })
      const searchParams = new URLSearchParams({
        key,
        title,
        register: 'false',
        header: 'no',
        sender: this.siteSender(this.selectedSite, 'admin')
      }).toString()
      return `${this.env.eventsUrl}/embed/subscribe?${searchParams}`
    }
  },
  async mounted () {
    let publicationSitesUrl = 'api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id
    if (this.activeAccount.department) publicationSitesUrl += ':' + this.activeAccount.department
    else publicationSitesUrl += ':*'
    publicationSitesUrl += '/publication-sites';
    [this.settingsPublicationSites, this.topics] = await Promise.all([
      this.$axios.$get(publicationSitesUrl),
      this.$axios.$get('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id + '/topics')
    ])
    this.selectedSite = this.publicationSites[0]
  },
  methods: {
    ...mapActions(['emitFrameNotif']),
    siteSender (site, role) {
      const parts = [
        this.activeAccount.type,
        this.activeAccount.id,
        this.activeAccount.department ?? site.department ?? ''
      ]
      if (role) parts.push(role)
      return parts.join(':')
    }
  }
}
</script>

<style lang="css" scoped>
</style>
