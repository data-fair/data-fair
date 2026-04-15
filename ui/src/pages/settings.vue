<template>
  <v-container>
    <h2 class="text-title-large mb-4">
      {{ t('pageHeader', { type: t(settingsAccount.type === 'organization' ? 'organization' : 'user'), name: settingsAccount.name }) }}{{ settingsAccount.department ? (' / ' + (settingsAccount.departmentName ?? settingsAccount.department)) : '' }}
    </h2>
    <i18n-t
      v-if="settingsAccount.type ==='organization'"
      keypath="accountRole"
      tag="p"
    >
      <template #role>
        <strong>{{ session.accountRole.value }}</strong>
      </template>
    </i18n-t>
    <p v-if="settingsAccount.type ==='organization' && departments.length > 1">
      <v-select
        v-model="selectedDepartment"
        :items="departments"
        :label="t('department')"
        item-title="name"
        item-value="id"
        variant="outlined"
        density="comfortable"
        max-width="500"
        class="mt-4"
      />
    </p>

    <v-progress-linear
      v-if="!settings || settingsEditFetch.fetch.loading.value"
      color="primary"
      indeterminate
      rounded
    />

    <template v-else>
      <!-- Contact section (auto-save) -->
      <df-section-tabs
        v-if="sections.info"
        id="info"
        :svg="infoSvg"
        :title="sections.info.title"
        :subtitle="t('sections.info.subtitle')"
      >
        <template #content>
          <div class="pa-4 narrow-section">
            <settings-info v-model="settings.info" />
          </div>
        </template>
      </df-section-tabs>

      <!-- Topics section (save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.topics"
        id="topics"
        :svg="flagsSvg"
        svg-no-margin
        :title="sections.topics.title"
        :subtitle="$uiConfig.disableApplications ? t('sections.topics.subtitleNoApps') : t('sections.topics.subtitle')"
      >
        <template #actions>
          <confirm-menu
            v-if="topicsEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="topicsEdit.cancel()"
          />
          <v-btn
            v-if="topicsEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!topicsValid"
            :loading="topicsEdit.save.loading.value"
            @click="topicsEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #content>
          <div class="pa-4">
            <settings-topics
              v-model="settings.topics"
              v-model:valid="topicsValid"
            />
          </div>
        </template>
      </df-section-tabs>

      <!-- Quality section (3 tabs, save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.quality"
        id="quality"
        v-model="qualityTab"
        :svg="qualitySvg"
        :title="sections.quality.title"
        :tabs="sections.quality.tabs"
      >
        <template #actions>
          <confirm-menu
            v-if="qualityEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="qualityEdit.cancel()"
          />
          <v-btn
            v-if="qualityEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!qualityValid"
            :loading="qualityEdit.save.loading.value"
            @click="qualityEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #windows>
          <v-tabs-window-item value="datasetsMetadata">
            <settings-datasets-metadata
              v-model="settings.datasetsMetadata"
              v-model:valid="datasetsMetadataValid"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="licenses">
            <div class="pa-4 narrow-section">
              <settings-licenses
                v-model="settings.licenses"
                v-model:valid="licensesValid"
              />
            </div>
          </v-tabs-window-item>

          <v-tabs-window-item value="privateVocabulary">
            <div class="pa-4 narrow-section">
              <v-alert
                type="warning"
                variant="outlined"
                density="compact"
                class="mb-2"
              >
                {{ t('privateVocabWarning') }}
              </v-alert>
              <settings-private-vocabulary
                v-model="settings.privateVocabulary"
                v-model:valid="privateVocabularyValid"
              />
            </div>
          </v-tabs-window-item>
        </template>
      </df-section-tabs>

      <!-- API Keys section (auto-save) -->
      <df-section-tabs
        v-if="sections['api-keys']"
        id="api-keys"
        :svg="securitySvg"
        svg-no-margin
        :title="sections['api-keys'].title"
        :subtitle="t('sections.apiKeys.subtitle')"
      >
        <template #content>
          <v-container>
            <settings-api-keys v-model="settings.apiKeys" />
          </v-container>
        </template>
      </df-section-tabs>

      <!-- Webhooks section (auto-save) -->
      <df-section-tabs
        v-if="sections.webhooks"
        id="webhooks"
        :svg="wwwSvg"
        svg-no-margin
        :title="sections.webhooks.title"
        :subtitle="t('sections.webhooks.subtitle')"
      >
        <template #content>
          <div class="pa-4 narrow-section">
            <settings-webhooks v-model="settings.webhooks" />
          </div>
        </template>
      </df-section-tabs>

      <!-- Publication sites section (save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.publicationSites"
        id="publicationSites"
        :svg="uiSvg"
        svg-no-margin
        :title="sections.publicationSites.title"
        :subtitle="t('sections.publicationSites.subtitle')"
      >
        <template #actions>
          <confirm-menu
            v-if="portalsEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="portalsEdit.cancel()"
          />
          <v-btn
            v-if="portalsEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!portalsValid"
            :loading="portalsEdit.save.loading.value"
            @click="portalsEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #content>
          <div class="pa-4 narrow-section">
            <settings-publication-sites
              v-model="settings.publicationSites"
              v-model:valid="portalsValid"
              :datasets-metadata="settingsEditFetch.serverData.value?.datasetsMetadata"
            />
          </div>
        </template>
      </df-section-tabs>

      <!-- AI Assistant section (auto-save) -->
      <df-section-tabs
        v-if="sections.agentChat"
        id="agentChat"
        :svg="compatSvg"
        svg-no-margin
        color="admin"
        :title="sections.agentChat.title"
        :subtitle="t('sections.agentChat.subtitle')"
      >
        <template #content>
          <v-container>
            <v-checkbox
              v-model="settings.agentChat"
              :label="t('agentChatToggle')"
            />
          </v-container>
        </template>
      </df-section-tabs>

      <!-- Compatibility section (auto-save) -->
      <df-section-tabs
        v-if="sections.compat"
        id="compat"
        :svg="compatSvg"
        svg-no-margin
        color="admin"
        :title="sections.compat.title"
        :subtitle="t('sections.compat.subtitle')"
      >
        <template #content>
          <v-container>
            <v-checkbox
              v-model="settings.compatODS"
              :label="t('compatODS')"
            />
          </v-container>
        </template>
      </df-section-tabs>
    </template>

    <df-navigation-right>
      <!-- Documentation link -->
      <v-list-item
        :href="'https://data-fair.github.io/3/user-guide-backoffice/parameters'"
        target="_blank"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiBookOpenVariant"
          />
        </template>
        {{ t('docLink') }}
      </v-list-item>

      <!-- Table of contents -->
      <df-toc :sections="tocSections" />
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  pageTitle: Paramètres - Data Fair
  settings: Paramètres
  pageHeader: "Paramètres de l'{type} {name}"
  organization: organisation
  user: utilisateur
  accountRole: "Vous êtes {role} dans cette organisation."
  department: Département
  rootDepartment: "Racine de l'organisation"
  save: Enregistrer
  cancel: Annuler
  saved: Les paramètres ont été mis à jour
  confirmCancelText: Voulez-vous annuler les modifications en cours ?
  docLink: Documentation
  privateVocabWarning: Attention, si vous supprimez un concept référencé dans des jeux de données vous pouvez causer des dysfonctionnements.
  agentChatToggle: Activer l'assistant IA
  compatODS: Activer la compatibilité ODS
  sections:
    info:
      title: Informations de contact
      subtitle: Informations de contact pour les utilisateurs de vos APIs et applications.
    topics:
      title: Thématiques
      subtitle: Les thématiques permettent de catégoriser vos jeux de données et applications pour en faciliter la recherche et la navigation.
      subtitleNoApps: Les thématiques permettent de catégoriser vos jeux de données pour en faciliter la recherche et la navigation.
    quality:
      title: Qualité des jeux de données
      tabs:
        licenses: Licences
        privateVocabulary: Vocabulaire privé
        datasetsMetadata: Métadonnées
    apiKeys:
      title: "Clés d'API"
      subtitle: "Les clés d'API permettent d'accéder à l'API Data Fair de manière sécurisée. Configuration technique destinée aux utilisateurs avancés."
    webhooks:
      title: "Appels extérieurs (Webhooks)"
      subtitle: "Les webhooks permettent de notifier des services externes lorsqu'un événement survient dans Data Fair. Configuration technique destinée aux utilisateurs avancés."
    publicationSites:
      title: Portails
      subtitle: Paramètres de vos portails de publication de ressources.
    agentChat:
      title: Assistant IA
      subtitle: Paramètres d'activation de l'assistant IA.
    compat:
      title: Gestion des compatibilités
      subtitle: Compatibilité des APIs avec d'autres services. Peut être utile en période de transition.
en:
  pageTitle: Parameters - Data Fair
  settings: Settings
  pageHeader: "{type} {name} settings"
  organization: Organization
  user: User
  accountRole: "You are {role} in this organization."
  department: Department
  rootDepartment: Organization root
  save: Save
  cancel: Cancel
  saved: Settings have been updated
  confirmCancelText: Do you want to discard the current changes?
  docLink: Documentation
  privateVocabWarning: Warning, if you delete a concept referenced in datasets you may cause malfunctions.
  agentChatToggle: Enable AI assistant
  compatODS: Enable ODS compatibility
  sections:
    info:
      title: Contact information
      subtitle: Contact information for users of your APIs and applications.
    topics:
      title: Topics
      subtitle: Topics allow you to categorize your datasets and applications to make them easier to find and browse.
      subtitleNoApps: Topics allow you to categorize your datasets to make them easier to find and browse.
    quality:
      title: Data quality
      tabs:
        licenses: Licenses
        privateVocabulary: Private vocabulary
        datasetsMetadata: Metadata
    apiKeys:
      title: API keys
      subtitle: API keys provide secure access to the Data Fair API. Technical configuration intended for advanced users.
    webhooks:
      title: "External requests (Webhooks)"
      subtitle: Webhooks notify external services when an event occurs in Data Fair. Technical configuration intended for advanced users.
    publicationSites:
      title: Portals
      subtitle: Settings for your resource publication portals.
    agentChat:
      title: AI Assistant
      subtitle: AI assistant activation settings.
    compat:
      title: Compatibility management
      subtitle: API compatibility with other services. Can be useful during transition periods.
</i18n>

<script setup lang="ts">
import type { Settings } from '#api/types'
import { mdiBookOpenVariant, mdiCancel, mdiCertificate, mdiFileDocumentEdit, mdiBookAlphabet } from '@mdi/js'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import qualitySvg from '~/assets/svg/Quality Check_Monochromatic.svg?raw'
import flagsSvg from '~/assets/svg/Crossed flags_Two Color.svg?raw'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'
import wwwSvg from '~/assets/svg/World wide web_Two Color.svg?raw'
import uiSvg from '~/assets/svg/User Interface _Two Color.svg?raw'
import infoSvg from '~/assets/svg/Sending emails_Monochromatic.svg?raw'
import compatSvg from '~/assets/svg/Team building _Two Color.svg?raw'

const { t, locale } = useI18n()
const session = useSessionAuthenticated()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('settings') }] })

// TODO: manage authorization
// session.accountRole === 'admin'

const settingsAccount = ref({ ...session.account.value })

const selectedDepartment = ref('__root')
watch(selectedDepartment, (newVal, oldVal) => {
  // Guard: prevent department switch if there are unsaved changes
  if (anyDirty.value && !window.confirm(t('confirmCancelText'))) {
    nextTick(() => { selectedDepartment.value = oldVal })
    return
  }
  if (newVal === '__root') {
    delete settingsAccount.value.department
  } else {
    settingsAccount.value.department = newVal
  }
})
const settingsAccountId = computed(() => {
  let settingsAccountId = settingsAccount.value.id
  if (settingsAccount.value.type === 'organization' && settingsAccount.value.department) {
    settingsAccountId += encodeURIComponent(':') + settingsAccount.value.department
  }
  return settingsAccountId
})

// Main edit fetch for settings
const settingsEditFetch = useEditFetch<Settings>(
  () => `${$apiPath}/settings/${settingsAccount.value.type}/${settingsAccountId.value}`,
  { patch: true }
)
const settings = settingsEditFetch.data

// Sub-edits for sections with save/cancel
const topicsEdit = settingsEditFetch.createSubEdit(['topics'], { success: t('saved') })
const qualityEdit = settingsEditFetch.createSubEdit(
  ['licenses', 'datasetsMetadata', 'privateVocabulary'],
  { success: t('saved') }
)
const portalsEdit = settingsEditFetch.createSubEdit(['publicationSites'], { success: t('saved') })

// Sub-edits for auto-save sections (watch hasDiff to trigger save, avoids feedback loops)
const infoEdit = settingsEditFetch.createSubEdit(['info'], { success: t('saved') })
const apiKeysEdit = settingsEditFetch.createSubEdit(['apiKeys'], { success: t('saved') })
const webhooksEdit = settingsEditFetch.createSubEdit(['webhooks'], { success: t('saved') })
const agentChatEdit = settingsEditFetch.createSubEdit(['agentChat'], { success: t('saved') })
const compatEdit = settingsEditFetch.createSubEdit(['compatODS'], { success: t('saved') })

// Auto-save: trigger save when hasDiff becomes true
watch(infoEdit.hasDiff, (dirty) => { if (dirty) infoEdit.save.execute() })
watch(apiKeysEdit.hasDiff, (dirty) => { if (dirty) apiKeysEdit.save.execute() })
watch(webhooksEdit.hasDiff, (dirty) => { if (dirty) webhooksEdit.save.execute() })
watch(agentChatEdit.hasDiff, (dirty) => { if (dirty) agentChatEdit.save.execute() })
watch(compatEdit.hasDiff, (dirty) => { if (dirty) compatEdit.save.execute() })

// Leave guards for sections with save/cancel
useLeaveGuard(topicsEdit.hasDiff, { locale })
useLeaveGuard(qualityEdit.hasDiff, { locale })
useLeaveGuard(portalsEdit.hasDiff, { locale })

// Track if any section with save/cancel has unsaved changes
const anyDirty = computed(() =>
  topicsEdit.hasDiff.value || qualityEdit.hasDiff.value || portalsEdit.hasDiff.value
)

const qualityTab = ref('datasetsMetadata')

// Validation state from child components
const topicsValid = ref(true)
const licensesValid = ref(true)
const datasetsMetadataValid = ref(true)
const privateVocabularyValid = ref(true)
const portalsValid = ref(true)
const qualityValid = computed(() => licensesValid.value && datasetsMetadataValid.value && privateVocabularyValid.value)

// Tab color helper: red if invalid, accent if valid with diff, undefined otherwise
function tabColor (hasDiff: boolean, valid: boolean): string | undefined {
  if (!valid) return 'error'
  if (hasDiff) return 'accent'
  return undefined
}

const sections = computed(() => {
  const result: Record<string, { title: string, tabs?: { key: string, title: string, icon: string, color?: string }[] }> = {}
  if (!settingsAccount.value.department) {
    result.info = { title: t('sections.info.title') }
    result.topics = { title: t('sections.topics.title') }
    result.quality = {
      title: t('sections.quality.title'),
      tabs: [
        { key: 'datasetsMetadata', title: t('sections.quality.tabs.datasetsMetadata'), icon: mdiFileDocumentEdit, color: tabColor(qualityEdit.keyHasDiff('datasetsMetadata').value, datasetsMetadataValid.value) },
        { key: 'licenses', title: t('sections.quality.tabs.licenses'), icon: mdiCertificate, color: tabColor(qualityEdit.keyHasDiff('licenses').value, licensesValid.value) },
        { key: 'privateVocabulary', title: t('sections.quality.tabs.privateVocabulary'), icon: mdiBookAlphabet, color: tabColor(qualityEdit.keyHasDiff('privateVocabulary').value, privateVocabularyValid.value) }
      ]
    }
  }
  result['api-keys'] = { title: t('sections.apiKeys.title') }
  result.webhooks = { title: t('sections.webhooks.title') }
  if (!$uiConfig.disablePublicationSites) {
    result.publicationSites = { title: t('sections.publicationSites.title') }
  }
  if ($uiConfig.agentsIntegration && session.user.value.adminMode) {
    result.agentChat = { title: t('sections.agentChat.title') }
  }
  if ($uiConfig.compatODS && session.user.value.adminMode) {
    result.compat = { title: t('sections.compat.title') }
  }
  return result
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))

const accountDetailsFetch = useFetch<any>(`${$sitePath}/simple-directory/api/${session.account.value.type}s/${session.account.value.id}`)
const departments = computed(() => {
  if (session.account.value.type !== 'organization' || session.account.value.department) {
    return []
  }
  const items = [{ id: '__root', name: t('rootDepartment') }]
  if (accountDetailsFetch.data.value?.departments) {
    items.push(...[...accountDetailsFetch.data.value?.departments].sort((d1, d2) => d1.name.localeCompare(d2.name)))
  }
  return items
})

</script>

<style scoped>
.narrow-section { max-width: max(50%, 500px); }
</style>
