<template>
  <v-container>
    <h2 class="mt-8 mb-2 text-h5">
      {{ t('devices') }}
    </h2>
    <d-frame
      :src="`${$sitePath}/events/embed/devices`"
      resize
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />

    <h2 class="mt-8 mb-2 text-h5">
      {{ account.type === 'organization'
        ? t('datasetsOrgEvents', { name: account.name + (account.department ? ' / ' + (account.departmentName || account.department) : '') })
        : t('datasetsUserEvents') }}
    </h2>
    <d-frame
      :src="datasetsSubscribeUrl"
      resize
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />

    <h2 class="mt-8 mb-2 text-h5">
      {{ account.type === 'organization'
        ? t('appsOrgEvents', { name: account.name + (account.department ? ' / ' + (account.departmentName || account.department) : '') })
        : t('appsUserEvents') }}
    </h2>
    <d-frame
      :src="appsSubscribeUrl"
      resize
      @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
    />

    <template v-if="$uiConfig.portalsIntegration">
      <h2 class="mt-8 mb-2 text-h5">
        {{ t('sites', { name: account.name }) }}
      </h2>
      <v-select
        v-model="selectedSite"
        :items="publicationSites"
        :item-title="(site: any) => site.title || site.url || site.id"
        variant="outlined"
        style="max-width:500px"
        :label="t('selectSite')"
        hide-details
        return-object
        class="mt-6 mb-3"
      />
      <template v-if="selectedSite">
        <d-frame
          :src="selectedSite.subscribeUrl"
          resize
          @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
        />
        <d-frame
          v-if="requestedDatasetPublicationSiteUrl"
          :src="requestedDatasetPublicationSiteUrl"
          resize
          @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
        />
        <d-frame
          v-if="requestedApplicationPublicationSiteUrl"
          :src="requestedApplicationPublicationSiteUrl"
          resize
          @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
        />
        <d-frame
          v-if="userCreationPublicationSiteUrl"
          :src="userCreationPublicationSiteUrl"
          resize
          @notif="(e: any) => sendUiNotif({ msg: e.detail.title || e.detail.detail, type: e.detail.type })"
        />
      </template>
    </template>
  </v-container>
</template>

<script lang="ts" setup>
import settingsSchema from '../../../api/types/settings/schema.js'

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()
const { account, accountRole } = useSessionAuthenticated()

const webhooksSchema = settingsSchema.properties.webhooks

const datasetsSubscribeUrl = computed(() => {
  const webhooks = webhooksSchema.items.properties.events.items.oneOf
    .filter((item: any) => item.const.startsWith('dataset') && item.const !== 'dataset-finalize-end')
  const keysParam = webhooks.map((w: any) => 'data-fair:' + w.const).join(',')
  const titlesParam = webhooks.map((w: any) => w.title.replace(/,/g, ' ')).join(',')
  const urlTemplate = $siteUrl + '/data-fair/dataset/{id}'
  const searchParams = new URLSearchParams({
    key: keysParam,
    title: titlesParam,
    'url-template': urlTemplate,
    register: 'false',
    header: 'no'
  }).toString()
  return `${$sitePath}/events/embed/subscribe?${searchParams}`
})

const appsSubscribeUrl = computed(() => {
  const webhooks = webhooksSchema.items.properties.events.items.oneOf
    .filter((item: any) => item.const.startsWith('application'))
  const keysParam = webhooks.map((w: any) => 'data-fair:' + w.const).join(',')
  const titlesParam = webhooks.map((w: any) => w.title.replace(/,/g, ' ')).join(',')
  const urlTemplate = $siteUrl + '/data-fair/application/{id}'
  const searchParams = new URLSearchParams({
    key: keysParam,
    title: titlesParam,
    'url-template': urlTemplate,
    register: 'false',
    header: 'no'
  }).toString()
  return `${$sitePath}/events/embed/subscribe?${searchParams}`
})

// Load publication sites and topics
const settingsPublicationSitesFetch = useFetch<any[]>(() => {
  const acc = account.value
  let url = $apiPath + '/settings/' + acc.type + '/' + acc.id
  if (acc.department) url += ':' + acc.department
  else url += ':*'
  url += '/publication-sites'
  return url
})

const topicsFetch = useFetch<any[]>(() => {
  const acc = account.value
  return $apiPath + '/settings/' + acc.type + '/' + acc.id + '/topics'
})

function siteSender (site: any, role?: string) {
  const acc = account.value
  const parts = [
    acc.type,
    acc.id,
    acc.department ?? site.department ?? ''
  ]
  if (role) parts.push(role)
  return parts.join(':')
}

const publicationSites = computed(() => {
  const sites = settingsPublicationSitesFetch.data.value
  const topics = topicsFetch.data.value
  if (!sites || !topics) return []
  return sites.map((p: any) => {
    const keys = [`data-fair:dataset-published:${p.type}:${p.id}`]
    const titles = [t('datasetPublished', { title: p.title || p.url || p.id })]
    for (const topic of topics) {
      keys.push(`data-fair:dataset-published-topic:${p.type}:${p.id}:${topic.id}`)
      titles.push(t('datasetPublishedTopic', { title: p.title || p.url || p.id, topic: topic.title }))
    }
    const urlTemplate = $siteUrl + '/data-fair/dataset/{id}'
    const searchParams = new URLSearchParams({
      key: keys.join(','),
      title: titles.join(','),
      'url-template': urlTemplate,
      register: 'false',
      header: 'no',
      sender: siteSender(p)
    }).toString()
    const subscribeUrl = `${$sitePath}/events/embed/subscribe?${searchParams}`
    return { ...p, subscribeUrl }
  })
})

const selectedSite = ref<any>(null)

watch(publicationSites, (sites) => {
  if (sites.length && !selectedSite.value) {
    selectedSite.value = sites[0]
  }
}, { immediate: true })

const requestedDatasetPublicationSiteUrl = computed(() => {
  const site = selectedSite.value
  const acc = account.value
  if (!site) return null
  if (acc.department && acc.department !== site.department) return null
  const key = `data-fair:dataset-publication-requested:${site.type}:${site.id}`
  const title = t('datasetPublicationRequested', { title: site.title || site.url || site.id })
  const urlTemplate = $siteUrl + '/data-fair/dataset/{id}'
  const searchParams = new URLSearchParams({
    key,
    title,
    'url-template': urlTemplate,
    register: 'false',
    header: 'no',
    sender: siteSender(site)
  }).toString()
  return `${$sitePath}/events/embed/subscribe?${searchParams}`
})

const requestedApplicationPublicationSiteUrl = computed(() => {
  const site = selectedSite.value
  const acc = account.value
  if (!site) return null
  if (acc.department && acc.department !== site.department) return null
  const key = `data-fair:application-publication-requested:${site.type}:${site.id}`
  const title = t('applicationPublicationRequested', { title: site.title || site.url || site.id })
  const urlTemplate = $siteUrl + '/data-fair/application/{id}'
  const searchParams = new URLSearchParams({
    key,
    title,
    'url-template': urlTemplate,
    register: 'false',
    header: 'no',
    sender: siteSender(site)
  }).toString()
  return `${$sitePath}/events/embed/subscribe?${searchParams}`
})

const userCreationPublicationSiteUrl = computed(() => {
  const site = selectedSite.value
  const acc = account.value
  if (!site) return null
  if (acc.department && acc.department !== site.department) return null
  if (accountRole.value !== 'admin') return null
  const key = `simple-directory:user-created:${site.type}:${site.id}`
  const title = t('userCreated', { title: site.title || site.url || site.id })
  const searchParams = new URLSearchParams({
    key,
    title,
    register: 'false',
    header: 'no',
    sender: siteSender(site, 'admin')
  }).toString()
  return `${$sitePath}/events/embed/subscribe?${searchParams}`
})
</script>

<i18n lang="yaml">
fr:
  devices: Appareils configurés pour recevoir vos notifications
  datasetsOrgEvents: "Événements des jeux de données de l'organisation {name}"
  datasetsUserEvents: Événements des jeux de données de votre compte personnel
  appsOrgEvents: "Événements des applications de l'organisation {name}"
  appsUserEvents: Événements des applications de votre compte personnel
  datasetPublished: "Un jeu de données a été publié sur {title}"
  datasetPublishedTopic: "Un jeu de données a été publié dans la thématique {topic} sur {title}"
  datasetPublicationRequested: "Un contributeur demande de publier un jeu de données sur {title}"
  applicationPublicationRequested: "Un contributeur demande de publier une application sur {title}"
  userCreated: "Un utilisateur s'est enregistré sur {title}"
  sites: "Événements liés à un portail de l'organisation {name}"
  selectSite: "Sélectionnez un portail"
en:
  devices: Devices configured to receive your notifications
  datasetsOrgEvents: "Dataset events for organization {name}"
  datasetsUserEvents: Dataset events for your personal account
  appsOrgEvents: "Application events for organization {name}"
  appsUserEvents: Application events for your personal account
  datasetPublished: "A dataset was published on {title}"
  datasetPublishedTopic: "A dataset was published in topic {topic} on {title}"
  datasetPublicationRequested: "A contributor requests to publish a dataset on {title}"
  applicationPublicationRequested: "A contributor requests to publish an application on {title}"
  userCreated: "A user registered on {title}"
  sites: "Events related to a portal of organization {name}"
  selectSite: "Select a portal"
</i18n>
