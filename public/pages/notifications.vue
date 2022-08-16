<template>
  <v-container>
    <h2
      v-t="'devices'"
      class="mt-8 mb-2 text-h5"
    />
    <v-iframe :src="`${env.notifyUrl}/embed/devices`" />

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'datasetsOrgEvents', args: {name: activeAccount.name + (activeAccount.department ? ' / ' + activeAccount.department : '')}}"
      class="mt-8 mb-2 text-h5"
    />
    <h2
      v-else
      v-t="'datasetsUserEvents'"
      class="mt-8 mb-2 text-h5"
    />
    <v-iframe :src="datasetsSubscribeUrl" />

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'appsOrgEvents', args: {name: activeAccount.name + (activeAccount.department ? ' / ' + activeAccount.department : '')}}"
      class="mt-8 mb-2 text-h5"
    />
    <h2
      v-else
      v-t="'appsUserEvents'"
      class="mt-8 mb-2 text-h5"
    />
    <v-iframe :src="appsSubscribeUrl" />

    <div
      v-for="site of publicationSites"
      :key="site.id"
    >
      <h2
        v-t="{path: 'pubsEvents', args: {title: site.title || site.url || site.id}}"
        class="mt-8 mb-2 text-h5"
      />
      <v-iframe :src="site.subscribeUrl" />
    </div>

    <div v-if="requestedDatasetPublicationSitesUrl">
      <h2
        v-t="'datasetsPubRequested'"
        class="mt-8 mb-2 text-h5"
      />
      <v-iframe :src="requestedDatasetPublicationSitesUrl" />
    </div>

    <!--<div v-if="requestedAppPublicationSitesUrl">
      <h2
        v-t="'appsPubRequested'"
        class="mt-8 mb-2 text-h5"
      />
      <v-iframe :src="requestedAppPublicationSitesUrl" />
    </div>-->
  </v-container>
</template>

<i18n lang="yaml">
fr:
  devices: Appareils configurés pour recevoir vos notifications
  datasetsOrgEvents: "Événements des jeux de données de l'organisation {name}"
  datasetsUserEvents: Événements des jeux de données de votre compte personnel
  appsOrgEvents: "Événements des visualisations de l'organisation {name}"
  appsUserEvents: Événements des visualisations de votre compte personnel
  pubsEvents: "Événements de publication sur le portail {title}"
  datasetsPubRequested: "Demandes de publications de jeux de données"
  appsPubRequested: "Demandes de publications de visualisations"
  datasetPublished: "Un jeu de données a été publié sur {title}"
  datasetPublishedTopic: "Un jeu de données a été publié dans la thématique {topic} sur {title}"
  datasetPublicationRequested: "Un contributeur demande de publier un jeu de données sur {title}"
  appPublicationRequested: "Un contributeur demande de publier une visualisation sur {title}"
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
const webhooksSchema = require('~/../contract/settings').properties.webhooks

export default {
  components: { VIframe },
  data: () => ({
    webhooksSchema,
    settingsPublicationSites: null,
    topics: null
  }),
  computed: {
    ...mapState(['env']),
    ...mapGetters('session', ['activeAccount']),
    datasetsSubscribeUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const.startsWith('dataset'))
      const keysParam = webhooks.map(w => 'data-fair:' + w.const).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      const urlTemplate = this.env.publicUrl + '/dataset/{id}'
      return `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&url-template=${encodeURIComponent(urlTemplate)}&register=false&header=no`
    },
    appsSubscribeUrl () {
      const webhooks = webhooksSchema.items.properties.events.items.oneOf
        .filter(item => item.const.startsWith('application'))
      const keysParam = webhooks.map(w => 'data-fair:' + w.const).join(',')
      const titlesParam = webhooks.map(w => w.title.replace(/,/g, ' ')).join(',')
      const urlTemplate = this.env.publicUrl + '/application/{id}'
      return `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&url-template=${encodeURIComponent(urlTemplate)}&register=false&header=no`
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
        let subscribeUrl = `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keys.join(','))}&title=${encodeURIComponent(titles.join(','))}&register=false&header=no`
        if (p.datasetUrlTemplate) subscribeUrl += `&url-template=${encodeURIComponent(p.datasetUrlTemplate)}`
        return {
          ...p,
          subscribeUrl
        }
      })
    },
    requestedDatasetPublicationSitesUrl () {
      if (!this.settingsPublicationSites) return null
      const keys = []
      const titles = []
      this.settingsPublicationSites.forEach(p => {
        keys.push(`data-fair:dataset-publication-requested:${p.type}:${p.id}`)
        titles.push(this.$t('datasetPublicationRequested', { title: p.title || p.url || p.id }))
      })
      const keysParam = keys.join(',')
      const titlesParam = titles.join(',')
      const urlTemplate = this.env.publicUrl + '/dataset/{id}'
      return `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&url-template=${encodeURIComponent(urlTemplate)}&register=false&header=no`
    }
    /* requestedAppPublicationSitesUrl () {
      if (!this.settingsPublicationSites) return null
      const keys = []
      const titles = []
      this.settingsPublicationSites.forEach(p => {
        keys.push(`data-fair:app-publication-requested:${p.type}:${p.id}`)
        titles.push(this.$t('appPublicationRequested', { title: p.title || p.url || p.id }))
      })
      const keysParam = keys.join(',')
      const titlesParam = titles.join(',')
      const urlTemplate = this.env.publicUrl + '/application/{id}'
      return `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keysParam)}&title=${encodeURIComponent(titlesParam)}&url-template=${encodeURIComponent(urlTemplate)}&register=false&header=no`
    } */
  },
  async mounted () {
    [this.settingsPublicationSites, this.topics] = await Promise.all([
      this.$axios.$get('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id + '/publication-sites'),
      this.$axios.$get('api/v1/settings/' + this.activeAccount.type + '/' + this.activeAccount.id + '/topics')
    ])
  }
}
</script>

<style lang="css" scoped>
</style>
