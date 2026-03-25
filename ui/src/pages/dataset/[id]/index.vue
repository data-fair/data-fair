<template>
  <v-container v-if="dataset">
    <dataset-status v-if="!dataset.isMetaOnly" />

    <v-row class="dataset">
      <v-col>
        <dataset-metadata-view />

        <template
          v-for="section in sections"
          :key="section.id"
        >
          <!-- Schema section -->
          <layout-section-tabs
            v-if="section.id === 'schema'"
            :id="section.id"
            :min-height="200"
            :title="section.title"
            :tabs="section.tabs"
            :svg="buildingSvg"
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
                          <v-card-title class="text-body-large font-weight-bold">
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
            :svg="shareSvg"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="permissions">
                  <v-container fluid>
                    <permissions
                      v-if="dataset"
                      :resource="dataset"
                      resource-type="datasets"
                      :disabled="!can('setPermissions').value"
                    />
                  </v-container>
                </v-tabs-window-item>

                <v-tabs-window-item value="publication-sites">
                  <dataset-publication-sites />
                </v-tabs-window-item>

                <!-- Catalog publications -->
                <v-tabs-window-item
                  v-if="$uiConfig.catalogsIntegration && can('admin').value"
                  value="catalog-publications"
                >
                  <v-container fluid>
                    <h3 class="text-title-small font-weight-bold mt-4">
                      {{ t('catalogPublications') }}
                    </h3>
                    <d-frame
                      :src="`${window.location.origin}/catalogs/dataset-publications?dataset-id=${dataset.id}`"
                      sync-params
                      @notif="msg => sendUiNotif({ type: msg.type || 'success', msg: msg.body })"
                    />
                  </v-container>
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
            :svg="settingsSvg"
            svg-no-margin
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
  schema: Schéma
  applications: Applications
  noApplications: Aucune application n'utilise ce jeu de données.
  share: Partage
  permissions: Permissions
  publicationSites: Portails
  catalogPublications: Publications dans les catalogues
  relatedDatasets: Voir aussi
  readApiKey: Clé d'API en lecture
  activity: Activité
  journal: Journal
en:
  datasets: Datasets
  schema: Schema
  applications: Applications
  noApplications: No application uses this dataset.
  share: Share
  permissions: Permissions
  publicationSites: Portals
  catalogPublications: Catalog publications
  relatedDatasets: See also
  readApiKey: Read API key
  activity: Activity
  journal: Journal
</i18n>

<script lang="ts" setup>
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import Permissions from '~/components/permissions/permissions.vue'
import { mdiCalendarText, mdiEyeArrowRight, mdiImageMultiple, mdiKey, mdiPresentation, mdiSecurity, mdiTableCog } from '@mdi/js'
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import setBreadcrumbs from '~/utils/breadcrumbs'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/'>()
const { sendUiNotif } = useUiNotif()

const store = provideDatasetStore(route.params.id, true)
const { dataset, journal, journalFetch, taskProgress, taskProgressFetch, applicationsFetch, can } = store

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

const sections = computedDeepDiff(() => {
  if (!dataset.value) return []
  const d = dataset.value
  const result: any[] = []

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
  if ($uiConfig.catalogsIntegration && can('admin').value) {
    shareTabs.push({ key: 'catalog-publications', title: t('catalogPublications'), icon: mdiPresentation })
  }
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
