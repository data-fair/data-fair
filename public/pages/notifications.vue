<template>
  <v-container>
    <h2
      v-t="'devices'"
      class="text-h5"
    />
    <v-iframe :src="`${env.notifyUrl}/embed/devices`" />

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'datasetsOrgEvents', args: {name: activeAccount.name}}"
      class="mb-4 text-h5"
    />
    <h2
      v-else
      v-t="'datasetsUserEvents'"
      class="mb-4 text-h5"
    />
    <v-iframe :src="datasetsSubscribeUrl" />

    <h2
      v-if="activeAccount.type ==='organization'"
      v-t="{path: 'appsOrgEvents', args: {name: activeAccount.name}}"
      class="mb-4 text-h5"
    />
    <h2
      v-else
      v-t="'appsUserEvents'"
      class="mb-4 text-h5"
    />
    <v-iframe :src="appsSubscribeUrl" />

    <div
      v-for="site of publicationSites"
      :key="site.id"
    >
      <h2
        v-t="{path: 'pubsEvents', args: {title: site.title || site.url || site.id}}"
        class="mb-4 text-h5"
      />
      <v-iframe :src="site.subscribeUrl" />
    </div>
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
  datasetPublished: "Un jeu de données a été publié sur {title}"
  datasetPublishedTopic: "Un jeu de données a été publié dans la thématique {topic} sur {title}"
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
        let subscribeUrl = `${this.env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keys.join(','))}&title=${encodeURIComponent(titles.join(','))}&register=false`
        if (p.datasetUrlTemplate) subscribeUrl += `&url-template=${encodeURIComponent(p.datasetUrlTemplate)}`
        return {
          ...p,
          subscribeUrl
        }
      })
    }
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
