<template lang="html">
  <v-container>
    <v-row>
      <v-col>
        <!--<v-subheader>{{ t('pages.settings.description') }}</v-subheader>-->

        <tutorial-alert
          id="settings-doc"
          text="Consultez la documentation sur les paramètres"
          href="https://data-fair.github.io/3/user-guide-backoffice/parameters"
          persistent
        />
        <h2 class="mb-4">
          Paramètres de l'{{ settingsAccount.type ==='organization' ? ('organisation ' + settingsAccount.name): ('utilisateur ' + settingsAccount.name) }} {{ settingsAccount.department ? (' / ' + (settingsAccount.departmentName ?? settingsAccount.department)) : '' }}
        </h2>
        <p v-if="settingsAccount.type ==='organization'">
          Vous êtes <strong>{{ session.accountRole.value }}</strong> dans cette organisation.
        </p>
        <p v-if="settingsAccount.type ==='organization' && !settingsAccount.department && departments.length > 1">
          <v-select
            v-model="selectedDepartment"
            label="Département"
            :items="departments"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
            class="mt-4"
            style="max-width: 500px;"
          />
        </p>

        <v-progress-linear
          v-if="!settings"
          indeterminate
        />
        <template v-else>
          <div
            v-for="section of sections"
            :key="section.id"
          >
            <layout-section-tabs
              v-if="section.id === 'info'"
              :svg="infoSvg"
              :title="section.title"
            >
              <template #extension>
                <p>
                  Permettez aux utilisateurs de vos APIs et de vos applications de vous contacter en renseignant ces informations.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-info
                        v-model="settings.info"
                        @update:model-value="patch.execute({info: settings.info})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'licences'"
              :svg="qualitySvg"
              :title="section.title"
            >
              <template #extension>
                <p>
                  Définissez des licences pour clarifier les utilisations possibles des jeux de données que vous diffusez.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-licenses
                        v-model="settings.licenses"
                        @update:model-value="patch.execute({licenses: settings.licenses})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'topics'"
              :svg="flagsSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                <p v-if="$uiConfig.disableApplications">
                  Les thématiques sont une manière simple d'organiser vos jeux de données.
                </p>
                <p v-else>
                  Les thématiques sont une manière simple d'organiser vos jeux de données et vos applications.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-topics
                        v-model="settings.topics"
                        @update:model-value="patch.execute({topics: settings.topics})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'datasetsMetadata'"
              :svg="flagsSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                Configurez des métadonnées additionnelles pour vos jeux de données.
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-datasets-metadata
                        v-model="settings.datasetsMetadata"
                        @update:model-value="patch.execute({datasetsMetadata: settings.datasetsMetadata})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'api-keys'"
              :svg="securitysSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                <p>
                  Les clés d'API sont un moyen d'utiliser l'API de data-fair de manière sécurisée.
                  Il s'agit d'une configuration technique pour personne avertie.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <settings-api-keys
                    v-model="settings.apiKeys"
                    @update:model-value="patch.execute({apiKeys: settings.apiKeys})"
                  />
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'webhooks'"
              :svg="wwwSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                <p>
                  Les <i>webhooks</i> sont un moyen de lier d'autres services Web à des événements internes à ce service de diffusion de données (créations, mises à jour, etc.).
                  Il s'agit d'une configuration technique pour personne avertie.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-webhooks
                        v-model="settings.webhooks"
                        @update:model-value="patch.execute({webhooks: settings.webhooks})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'privateVocabulary'"
              :svg="checklistSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                <p>
                  Le <i>vocabulaire privé</i> vous permet d'étendre la liste des concepts avec lesquels pour pouvez annoter les colonnes de vos jeux de données.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-alert
                    type="warning"
                    variant="outlined"
                    density="compact"
                  >
                    Attention, si vous supprimez un concept référencé dans des jeux de données vous pouvez causer des dysfonctionnements.
                  </v-alert>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-private-vocabulary
                        v-model="settings.privateVocabulary"
                        @update:model-value="patch.execute({privateVocabulary: settings.privateVocabulary})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'publicationSites'"
              :svg="uiSvg"
              svg-no-margin
              :title="section.title"
            >
              <template #extension>
                <p>
                  Les <i>portails</i> sont les sites externes à Data Fair qui peuvent exposer ses ressources (jeux de données et applications).
                  Cette liste de sites est en partie gérée depuis l'onglet Portails mais certains paramètres relatifs à la publication des ressources sont édités ici.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col
                      cols="12"
                      md="6"
                    >
                      <settings-publication-sites
                        v-model="settings.publicationSites"
                        :datasets-metadata="settings.datasetsMetadata"
                        @update:model-value="patch.execute({publicationSites: settings.publicationSites})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>

            <layout-section-tabs
              v-if="section.id === 'compat'"
              svg-no-margin
              color="admin"
              :title="section.title"
            >
              <template #extension>
                <p>
                  Gérez les compatibilités de votre organisation avec d'autres services. Peut-être particulièrement utile en période de transition.
                </p>
              </template>
              <template #tabs-window>
                <v-container fluid>
                  <v-row>
                    <v-col>
                      <v-checkbox
                        v-model="settings.compatODS"
                        :label="t('compatODS')"
                        @update:model-value="patch.execute({compatODS: settings.compatODS})"
                      />
                    </v-col>
                  </v-row>
                </v-container>
              </template>
            </layout-section-tabs>
          </div>
        </template>
      </v-col>
    </v-row>

    <navigation-right>
      <layout-toc :sections="sections" />
    </navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  pageTitle: Paramètres - Data Fair
  licences: Licences
  topics: Thématiques
  datasetsMetadata: Métadonnées des jeux de données
  apiKeys: "Clés d'API"
  webhooks: "Appels extérieurs (Webhooks)"
  privateVocab: Vocabulaire privé
  publicationSites: Portails
  info: Informations de contact
  compat: Gestion des compatibilités
  compatODS: Activer la compatibilité ODS
en:
  pageTitle: Parameters - Data Fair
  licences: Licenses
  topics: Topics
  datasetsMetadata: Datasets metadata
  apiKeys: API keys
  webhooks: "External requests (Webhooks)"
  privateVocab: Private vocabulary
  publicationSites: Portals
  info: Contact information
  compat: Compatibility management
  compatODS: Enable ODS compatibility
</i18n>

<script lang="ts" setup>
import qualitySvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import flagsSvg from '~/assets/svg/Crossed flags_Two Color.svg?raw'
import securitysSvg from '~/assets/svg/Security_Two Color.svg?raw'
import wwwSvg from '~/assets/svg/World wide web_Two Color.svg?raw'
import uiSvg from '~/assets/svg/User Interface _Two Color.svg?raw'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import infoSvg from '~/assets/svg/Sending emails_Monochromatic.svg?raw'

const { t } = useI18n()
useHead({ title: t('pageTitle') })
const session = useSessionAuthenticated()

// TODO: manage authorization
// session.accountRole === 'admin'

const selectedDepartment = useStringSearchParam('dep', '__root')
watch(selectedDepartment, () => window.location.reload())
const settingsAccount = { ...session.account.value }
let settingsAccountId = settingsAccount.id
if (selectedDepartment.value !== '__root') {
  settingsAccount.department = selectedDepartment.value
  settingsAccountId += encodeURIComponent(':') + selectedDepartment.value
}
const { patch, settings } = useSettingsStore(settingsAccount.type, settingsAccountId)

const sections = computed(() => {
  const sections = []
  if (!settingsAccount.department) {
    sections.push({
      id: 'info',
      title: t('info')
    })
    sections.push({
      id: 'licences',
      title: t('licences')
    })
    sections.push({
      id: 'topics',
      title: t('topics')
    })
    sections.push({
      id: 'datasetsMetadata',
      title: t('datasetsMetadata')
    })
    sections.push({
      id: 'privateVocabulary',
      title: t('privateVocab')
    })
  }
  if (!$uiConfig.disablePublicationSites) {
    sections.push({
      id: 'publicationSites',
      title: t('publicationSites')
    })
  }
  sections.push({
    id: 'api-keys',
    title: t('apiKeys')
  })
  sections.push({
    id: 'webhooks',
    title: t('webhooks')
  })
  if ($uiConfig.compatODS && session.user.value.adminMode) {
    sections.push({
      id: 'compat',
      title: t('compat')
    })
  }
  return sections
})

const accountDetailsFetch = useFetch<any>(`${$sitePath}/simple-directory/api/${settingsAccount.type}s/${settingsAccount.id}`)
const departments = computed(() => {
  const items = [{ id: '__root', name: 'racine de l\'organisation' }]
  if (accountDetailsFetch.data.value?.departments) {
    items.push(...[...accountDetailsFetch.data.value?.departments].sort((d1, d2) => d1.name.localeCompare(d2.name)))
  }
  return items
})

</script>
