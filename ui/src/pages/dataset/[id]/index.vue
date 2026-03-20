<template>
  <v-container v-if="dataset">
    <dataset-status v-if="!dataset.isMetaOnly" />

    <v-row class="dataset">
      <v-col>
        <template
          v-for="section in sections"
          :key="section.id"
        >
          <!-- Description section -->
          <layout-section-tabs
            v-if="section.id === 'description'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="description">
                  <v-container fluid>
                    <v-row>
                      <v-col
                        cols="12"
                        :md="dataset.image ? 8 : 12"
                      >
                        <div class="text-h6 mb-2">
                          {{ dataset.title }}
                        </div>
                        <p
                          v-if="dataset.description"
                          class="text-body-2"
                          v-html="dataset.description"
                        />
                      </v-col>
                      <v-col
                        v-if="dataset.image"
                        cols="12"
                        md="4"
                      >
                        <v-img
                          :src="dataset.image"
                          max-height="200"
                          cover
                        />
                      </v-col>
                    </v-row>
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Metadata section -->
          <layout-section-tabs
            v-if="section.id === 'metadata'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <v-list density="compact">
                      <v-list-item v-if="dataset.owner">
                        <template #prepend>
                          <v-icon>mdi-account</v-icon>
                        </template>
                        <v-list-item-title>{{ dataset.owner.name }}</v-list-item-title>
                      </v-list-item>
                      <v-list-item v-if="dataset.license">
                        <template #prepend>
                          <v-icon>mdi-license</v-icon>
                        </template>
                        <v-list-item-title>{{ dataset.license.title || dataset.license.href }}</v-list-item-title>
                      </v-list-item>
                      <v-list-item v-if="dataset.updatedAt">
                        <template #prepend>
                          <v-icon>mdi-pencil</v-icon>
                        </template>
                        <v-list-item-title>
                          {{ dataset.updatedBy?.name }} {{ formatDate(dataset.updatedAt) }}
                        </v-list-item-title>
                      </v-list-item>
                      <v-list-item>
                        <template #prepend>
                          <v-icon>mdi-plus-circle-outline</v-icon>
                        </template>
                        <v-list-item-title>
                          {{ dataset.createdBy?.name }} {{ formatDate(dataset.createdAt) }}
                        </v-list-item-title>
                      </v-list-item>
                      <v-list-item v-if="dataset.count != null">
                        <template #prepend>
                          <v-icon>mdi-counter</v-icon>
                        </template>
                        <v-list-item-title>{{ dataset.count.toLocaleString(locale) }} {{ t('records') }}</v-list-item-title>
                      </v-list-item>

                      <!-- REST dataset indicators -->
                      <template v-if="dataset.isRest">
                        <v-list-item>
                          <template #prepend>
                            <v-icon>{{ mdiAllInclusive }}</v-icon>
                          </template>
                          <v-list-item-title>{{ t('restDataset') }}</v-list-item-title>
                        </v-list-item>

                        <v-list-item>
                          <template #prepend>
                            <v-icon :color="dataset.rest?.history ? undefined : 'grey'">
                              {{ mdiHistory }}
                            </v-icon>
                          </template>
                          <v-list-item-title v-if="dataset.rest?.history">
                            {{ t('history') }}
                          </v-list-item-title>
                          <v-list-item-title v-else>
                            {{ t('noHistory') }}
                          </v-list-item-title>
                          <template #append>
                            <dataset-edit-history
                              v-if="can('writeDescriptionBreaking').value"
                              :history="dataset.rest?.history"
                              @change="onHistoryChange"
                            />
                          </template>
                        </v-list-item>
                      </template>
                    </v-list>
                    <div class="d-flex flex-wrap ga-1 mt-2">
                      <v-chip
                        v-for="keyword in (dataset.keywords || [])"
                        :key="keyword"
                        size="small"
                      >
                        {{ keyword }}
                      </v-chip>
                      <v-chip
                        v-for="topic in (dataset.topics || [])"
                        :key="topic.id"
                        size="small"
                        color="primary"
                        variant="outlined"
                      >
                        {{ topic.title }}
                      </v-chip>
                    </div>
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Schema section -->
          <layout-section-tabs
            v-if="section.id === 'schema'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="schema">
                  <v-container fluid>
                    <dataset-schema-view />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Applications section -->
          <layout-section-tabs
            v-if="section.id === 'applications'"
            :id="section.id"
            :min-height="140"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="applications">
                  <v-container fluid>
                    <v-row v-if="applications.length">
                      <v-col
                        v-for="app in applications"
                        :key="app.id"
                        cols="12"
                        md="6"
                        lg="4"
                      >
                        <v-card :to="`/application/${app.id}`">
                          <v-card-title class="text-body-1 font-weight-bold">
                            {{ app.title || app.id }}
                          </v-card-title>
                        </v-card>
                      </v-col>
                    </v-row>
                    <p v-else>
                      {{ t('noApplications') }}
                    </p>
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Share section -->
          <layout-section-tabs
            v-if="section.id === 'share'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="permissions">
                  <v-container fluid>
                    <private-access v-model="dataset" />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="publication-sites">
                  <dataset-publication-sites />
                </v-tabs-window-item>

                <v-tabs-window-item value="related-datasets">
                  <v-container fluid>
                    <dataset-related-datasets />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Read API key section -->
          <layout-section-tabs
            v-if="section.id === 'readApiKey'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="readApiKey">
                  <v-container fluid>
                    <dataset-read-api-key />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <!-- Activity section -->
          <layout-section-tabs
            v-if="section.id === 'activity'"
            :id="section.id"
            :min-height="550"
            :title="section.title"
            :tabs="section.tabs"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="journal">
                  <v-container
                    fluid
                    class="pa-0"
                  >
                    <journal-view
                      v-if="journal"
                      :journal="journal"
                      :task-progress="taskProgress"
                      type="dataset"
                    />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
        </template>
      </v-col>
    </v-row>

    <df-navigation-right>
      <dataset-actions />
      <layout-toc :sections="sections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  description: Description
  metadata: Métadonnées
  info: Informations
  schema: Schéma
  applications: Applications
  noApplications: Aucune application n'utilise ce jeu de données.
  share: Partage
  permissions: Permissions
  publicationSites: Portails
  relatedDatasets: Voir aussi
  restDataset: Jeu de données éditable
  history: Historisation (conserve les révisions des lignes)
  noHistory: Pas d'historisation (ne conserve pas les révisions des lignes)
  readApiKey: Clé d'API en lecture
  activity: Activité
  journal: Journal
  records: enregistrements
en:
  datasets: Datasets
  description: Description
  metadata: Metadata
  info: Information
  schema: Schema
  applications: Applications
  noApplications: No application uses this dataset.
  share: Share
  permissions: Permissions
  publicationSites: Portals
  relatedDatasets: See also
  restDataset: Editable dataset
  history: History (store revisions of lines)
  noHistory: No history configured (do not store revisions of lines)
  readApiKey: Read API key
  activity: Activity
  journal: Journal
  records: records
</i18n>

<script lang="ts" setup>
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiInformation, mdiTableCog, mdiImageMultiple, mdiSecurity, mdiPresentation, mdiEyeArrowRight, mdiCalendarText, mdiKey, mdiHistory, mdiAllInclusive } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t, locale } = useI18n()
const route = useRoute<'/dataset/[id]/'>()

const store = provideDatasetStore(route.params.id, true)
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, can, patchDataset } = store

useDatasetWatch(store, ['journal', 'info', 'taskProgress'])

// Fetch additional data once dataset is loaded
watch(dataset, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id }
  ])
  if (can('readJournal').value && !journalFetch.initialized.value) journalFetch.refresh()
  if (!taskProgressFetch.initialized.value) taskProgressFetch.refresh()
  if (d.finalizedAt && !applicationsFetch.initialized.value) applicationsFetch.refresh()
}, { immediate: true })

const applications = computed(() => applicationsFetch.data.value?.results ?? [])

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

async function onHistoryChange (history: boolean) {
  await patchDataset.action({ rest: { ...dataset.value?.rest, history } })
}

const sections = computedDeepDiff(() => {
  if (!dataset.value) return []
  const d = dataset.value
  const result: any[] = []

  result.push({
    title: t('description'),
    id: 'description',
    tabs: [{ key: 'description', title: t('description'), icon: mdiInformation }]
  })

  if (d.finalizedAt || d.isMetaOnly) {
    result.push({
      title: t('metadata'),
      id: 'metadata',
      tabs: [{ key: 'info', title: t('info'), icon: mdiInformation }]
    })
  }

  if (d.finalizedAt) {
    result.push({
      title: t('schema'),
      id: 'schema',
      tabs: [{ key: 'schema', title: t('schema'), icon: mdiTableCog }]
    })
  }

  if (d.finalizedAt && !d.draftReason) {
    result.push({
      title: t('applications'),
      id: 'applications',
      tabs: [{ key: 'applications', title: t('applications'), icon: mdiImageMultiple }]
    })
  }

  const shareTabs = []
  if (can('getPermissions').value) {
    shareTabs.push({ key: 'permissions', title: t('permissions'), icon: mdiSecurity })
  }
  shareTabs.push({ key: 'publication-sites', title: t('publicationSites'), icon: mdiPresentation })
  shareTabs.push({ key: 'related-datasets', title: t('relatedDatasets'), icon: mdiEyeArrowRight })
  if (shareTabs.length) {
    result.push({ title: t('share'), id: 'share', tabs: shareTabs })
  }

  if (can('getReadApiKey').value) {
    result.push({
      title: t('readApiKey'),
      id: 'readApiKey',
      tabs: [{ key: 'readApiKey', title: t('readApiKey'), icon: mdiKey }]
    })
  }

  if (can('readJournal').value && !d.isMetaOnly) {
    result.push({
      title: t('activity'),
      id: 'activity',
      tabs: [{ key: 'journal', title: t('journal'), icon: mdiCalendarText }]
    })
  }

  return result
})
</script>

<style>
.dataset .v-tab {
  font-weight: bold;
}
</style>
