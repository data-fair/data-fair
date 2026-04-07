<template>
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
        <h2 class="text-title-large mb-4">
          Paramètres de l'{{ settingsAccount.type ==='organization' ? ('organisation ' + settingsAccount.name): ('utilisateur ' + settingsAccount.name) }} {{ settingsAccount.department ? (' / ' + (settingsAccount.departmentName ?? settingsAccount.department)) : '' }}
        </h2>
        <p v-if="settingsAccount.type ==='organization'">
          Vous êtes <strong>{{ session.accountRole.value }}</strong> dans cette organisation.
        </p>
        <p v-if="settingsAccount.type ==='organization' && departments.length > 1">
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
          v-if="!settings || loading"
          indeterminate
        />
        <template v-else>
          <df-section-tabs
            v-if="sections.info"
            id="info"
            :svg="infoSvg"
            :title="sections.info.title"
          >
            <template #extension>
              <p>
                Permettez aux utilisateurs de vos APIs et de vos applications de vous contacter en renseignant ces informations.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.licences"
            id="licences"
            :svg="qualitySvg"
            :title="sections.licences.title"
          >
            <template #extension>
              <p>
                Définissez des licences pour clarifier les utilisations possibles des jeux de données que vous diffusez.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.topics"
            id="topics"
            :svg="flagsSvg"
            svg-no-margin
            :title="sections.topics.title"
          >
            <template #extension>
              <p v-if="$uiConfig.disableApplications">
                Les thématiques sont une manière simple d'organiser vos jeux de données.
              </p>
              <p v-else>
                Les thématiques sont une manière simple d'organiser vos jeux de données et vos applications.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.datasetsMetadata"
            id="datasetsMetadata"
            :svg="checklist2Svg"
            svg-no-margin
            :title="sections.datasetsMetadata.title"
          >
            <template #extension>
              Configurez des métadonnées additionnelles pour vos jeux de données.
            </template>
            <template #content>
              <v-container>
                <settings-datasets-metadata
                  v-model="settings.datasetsMetadata"
                  @update:model-value="patch.execute({datasetsMetadata: settings.datasetsMetadata})"
                />
              </v-container>
            </template>
          </df-section-tabs>

          <df-section-tabs
            v-if="sections['api-keys']"
            id="api-keys"
            :svg="securitySvg"
            svg-no-margin
            :title="sections['api-keys'].title"
          >
            <template #extension>
              <p>
                Les clés d'API sont un moyen d'utiliser l'API de data-fair de manière sécurisée.
                Il s'agit d'une configuration technique pour personne avertie.
              </p>
            </template>
            <template #content>
              <v-container>
                <settings-api-keys
                  v-model="settings.apiKeys"
                  @update:model-value="patch.execute({apiKeys: settings.apiKeys})"
                />
              </v-container>
            </template>
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.webhooks"
            id="webhooks"
            :svg="wwwSvg"
            svg-no-margin
            :title="sections.webhooks.title"
          >
            <template #extension>
              <p>
                Les <i>webhooks</i> sont un moyen d'avertir d'autres services Web d'événements internes à Data Fair.
                Il s'agit d'une configuration technique pour personne avertie.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.privateVocabulary"
            id="privateVocabulary"
            :svg="checklistSvg"
            svg-no-margin
            :title="sections.privateVocabulary.title"
          >
            <template #extension>
              <p>
                Le <i>vocabulaire privé</i> vous permet d'étendre la liste des concepts avec lesquels pour pouvez annoter les colonnes de vos jeux de données.
              </p>
            </template>
            <template #content>
              <v-container>
                <v-alert
                  type="warning"
                  variant="outlined"
                  density="compact"
                  class="mb-2"
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.publicationSites"
            id="publicationSites"
            :svg="uiSvg"
            svg-no-margin
            :title="sections.publicationSites.title"
          >
            <template #extension>
              <p>
                Les <i>portails</i> sont vos sites de publication de ressources.
                Cette liste est surtout gérée depuis l'onglet Portails mais certains paramètres sont édités ici.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.agentChat"
            id="agentChat"
            :svg="compatSvg"
            svg-no-margin
            color="admin"
            :title="sections.agentChat.title"
          >
            <template #extension>
              <p>
                {{ t('agentChatDesc') }}
              </p>
            </template>
            <template #content>
              <v-container>
                <v-row>
                  <v-col>
                    <v-checkbox
                      v-model="settings.agentChat"
                      :label="t('agentChatToggle')"
                      @update:model-value="patch.execute({agentChat: settings.agentChat})"
                    />
                  </v-col>
                </v-row>
              </v-container>
            </template>
          </df-section-tabs>

          <df-section-tabs
            v-if="sections.compat"
            id="compat"
            :svg="compatSvg"
            svg-no-margin
            color="admin"
            :title="sections.compat.title"
          >
            <template #extension>
              <p>
                Gérez les compatibilités de votre organisation avec d'autres services. Peut-être particulièrement utile en période de transition.
              </p>
            </template>
            <template #content>
              <v-container>
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
          </df-section-tabs>
        </template>
      </v-col>
    </v-row>

    <df-navigation-right v-if="display.lgAndUp.value">
      <df-toc :sections="tocSections" />
    </df-navigation-right>
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
  agentChat: Assistant IA
  agentChatDesc: Activez ou désactivez l'assistant IA pour cette organisation.
  agentChatToggle: Activer l'assistant IA
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
  agentChat: Agent chat
  agentChatDesc: Enable or disable the agent chat for this organization.
  agentChatToggle: Enable agent chat
  compat: Compatibility management
  compatODS: Enable ODS compatibility
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import qualitySvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import flagsSvg from '~/assets/svg/Crossed flags_Two Color.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import wwwSvg from '~/assets/svg/World wide web_Two Color.svg?raw'
import uiSvg from '~/assets/svg/User Interface _Two Color.svg?raw'
import checklistSvg from '~/assets/svg/Checklist_Two Color.svg?raw'
import checklist2Svg from '~/assets/svg/Checklist_Two Color2.svg?raw'
import infoSvg from '~/assets/svg/Sending emails_Monochromatic.svg?raw'
import compatSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import { useDisplay } from 'vuetify'

const { t } = useI18n()
const session = useSessionAuthenticated()
const display = useDisplay()

// TODO: manage authorization
// session.accountRole === 'admin'

const settingsAccount = ref({ ...session.account.value })

const selectedDepartment = ref('__root')
watch(selectedDepartment, () => {
  if (selectedDepartment.value === '__root') {
    delete settingsAccount.value.department
  } else {
    settingsAccount.value.department = selectedDepartment.value
  }
})
const settingsAccountId = computed(() => {
  let settingsAccountId = settingsAccount.value.id
  if (settingsAccount.value.type === 'organization' && settingsAccount.value.department) {
    settingsAccountId += encodeURIComponent(':') + settingsAccount.value.department
  }
  return settingsAccountId
})
const { patch, settings, loading } = useSettingsStore(settingsAccount.value.type, settingsAccountId)

const sections = computed(() => {
  const result: Record<string, { title: string }> = {}
  if (!settingsAccount.value.department) {
    result.info = { title: t('info') }
    result.licences = { title: t('licences') }
    result.topics = { title: t('topics') }
    result.datasetsMetadata = { title: t('datasetsMetadata') }
    result.privateVocabulary = { title: t('privateVocab') }
  }
  if (!$uiConfig.disablePublicationSites) {
    result.publicationSites = { title: t('publicationSites') }
  }
  result['api-keys'] = { title: t('apiKeys') }
  result.webhooks = { title: t('webhooks') }
  if ($uiConfig.agentsIntegration && session.user.value.adminMode) {
    result.agentChat = { title: t('agentChat') }
  }
  if ($uiConfig.compatODS && session.user.value.adminMode) {
    result.compat = { title: t('compat') }
  }
  return result
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))

const accountDetailsFetch = useFetch<any>(`${$sitePath}/simple-directory/api/${session.account.value.type}s/${session.account.value.id}`)
const departments = computed(() => {
  if (session.account.value.type !== 'organization' || session.account.value.department) {
    return []
  }
  const items = [{ id: '__root', name: 'racine de l\'organisation' }]
  if (accountDetailsFetch.data.value?.departments) {
    items.push(...[...accountDetailsFetch.data.value?.departments].sort((d1, d2) => d1.name.localeCompare(d2.name)))
  }
  return items
})

</script>
