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
      <!-- Contact section (save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.info"
        id="info"
        :inert="infoEdit.save.loading.value"
        :svg="infoSvg"
        :title="sections.info.title"
        :subtitle="t('sections.info.subtitle')"
      >
        <template #actions>
          <confirm-menu
            v-if="infoEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="infoEdit.cancel()"
          />
          <v-btn
            v-if="infoEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!infoValid"
            :loading="infoEdit.save.loading.value"
            @click="infoEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #content>
          <div class="pa-4 narrow-section">
            <settings-info
              v-model="settings.info"
              v-model:valid="infoValid"
            />
          </div>
        </template>
      </df-section-tabs>

      <!-- Catalog section (4 tabs, save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.catalog"
        id="catalog"
        v-model="catalogTab"
        :inert="catalogEdit.save.loading.value || saveConfirm?.loading"
        :svg="qualitySvg"
        :title="sections.catalog.title"
        :subtitle="$uiConfig.disableApplications ? t('sections.catalog.subtitleNoApps') : t('sections.catalog.subtitle')"
        :tabs="sections.catalog.tabs"
      >
        <template #actions>
          <confirm-menu
            v-if="catalogEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="catalogEdit.cancel()"
          />
          <v-btn
            v-if="catalogEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!catalogValid"
            :loading="catalogEdit.save.loading.value || saveConfirm?.loading"
            @click="saveConfirm?.save(catalogEdit)"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #windows>
          <v-tabs-window-item value="topics">
            <settings-topics
              v-model="settings.topics"
              v-model:valid="topicsValid"
            />
          </v-tabs-window-item>

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

      <!-- Access & integrations section (2 tabs, API keys auto-save, webhooks save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.integrations"
        id="integrations"
        v-model="integrationsTab"
        :inert="webhooksEdit.save.loading.value"
        :svg="securitySvg"
        svg-no-margin
        :title="sections.integrations.title"
        :subtitle="t('sections.integrations.subtitle')"
        :tabs="sections.integrations.tabs"
      >
        <template #actions>
          <confirm-menu
            v-if="webhooksEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="webhooksEdit.cancel()"
          />
          <v-btn
            v-if="webhooksEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :disabled="!webhooksValid"
            :loading="webhooksEdit.save.loading.value"
            @click="webhooksEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #windows>
          <v-tabs-window-item value="apiKeys">
            <settings-api-keys
              v-model="settings.apiKeys"
              v-model:clear-keys="apiKeysSecrets"
              :edit="apiKeysEdit"
            />
          </v-tabs-window-item>

          <v-tabs-window-item value="webhooks">
            <div class="pa-4 narrow-section">
              <settings-webhooks
                v-model="settings.webhooks"
                v-model:valid="webhooksValid"
              />
            </div>
          </v-tabs-window-item>
        </template>
      </df-section-tabs>

      <!-- Publication sites section (save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.publicationSites"
        id="publicationSites"
        :inert="portalsEdit.save.loading.value"
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

      <!-- Features section: AI assistant and API compatibility (save/cancel + leave guard) -->
      <df-section-tabs
        v-if="sections.features"
        id="features"
        :inert="featuresEdit.save.loading.value"
        :svg="compatSvg"
        svg-no-margin
        :title="sections.features.title"
        :subtitle="t('sections.features.subtitle')"
      >
        <template #actions>
          <confirm-menu
            v-if="featuresEdit.hasDiff.value"
            :btn-props="{ color: 'warning', variant: 'tonal' }"
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            @confirm="featuresEdit.cancel()"
          />
          <v-btn
            v-if="featuresEdit.hasDiff.value"
            class="ml-2"
            color="accent"
            variant="flat"
            :loading="featuresEdit.save.loading.value"
            @click="featuresEdit.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </template>
        <template #content>
          <v-container>
            <template v-if="showAgentChat">
              <h3 class="text-title-medium">
                {{ t('agentChatTitle') }}
              </h3>
              <v-checkbox
                v-model="settings.agentChat"
                :label="t('agentChatToggle')"
              />
              <settings-agent-chat-audience
                v-if="settings.agentChat && settingsAccount.type === 'organization'"
                v-model="settings.agentChatAudience"
                :departments="departments.filter(d => d.id !== '__root')"
                :roles="accountDetailsFetch.data.value?.roles ?? []"
              />
            </template>
            <template v-if="showCompat">
              <h3 class="text-title-medium text-admin">
                {{ t('compatTitle') }}
              </h3>
              <p class="text-body-medium">
                {{ t('compatSubtitle') }}
              </p>
              <v-checkbox
                v-model="settings.compatODS"
                :label="t('compatODS')"
                color="admin"
              />
            </template>
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

    <!-- a save that removes values from datasets or applications asks for confirmation first -->
    <settings-save-confirm
      ref="save-confirm"
      :account="settingsAccount"
      :previous="settingsEditFetch.serverData.value"
      :current="settings"
    />
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
  agentChatTitle: Assistant IA
  agentChatToggle: Activer l'assistant IA
  compatTitle: Gestion des compatibilités
  compatSubtitle: Compatibilité des APIs avec d'autres services. Peut être utile en période de transition.
  compatODS: Activer la compatibilité ODS
  sections:
    info:
      title: Informations de contact
      subtitle: Informations de contact pour les utilisateurs de vos APIs et applications.
    catalog:
      title: Catalogue
      subtitle: Thématiques, métadonnées, licences et vocabulaire utilisés pour décrire vos jeux de données et applications.
      subtitleNoApps: Thématiques, métadonnées, licences et vocabulaire utilisés pour décrire vos jeux de données.
      tabs:
        topics: Thématiques
        datasetsMetadata: Métadonnées
        licenses: Licences
        privateVocabulary: Vocabulaire privé
    integrations:
      title: Accès & intégrations
      subtitle: "Clés d'API pour accéder à l'API Data Fair, webhooks pour notifier des services externes. Configuration technique destinée aux utilisateurs avancés."
      tabs:
        apiKeys: "Clés d'API"
        webhooks: Webhooks
    publicationSites:
      title: Portails
      subtitle: Paramètres de vos portails de publication de ressources.
    features:
      title: Fonctionnalités
      subtitle: Fonctionnalités optionnelles activées pour votre compte.
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
  agentChatTitle: AI Assistant
  agentChatToggle: Enable AI assistant
  compatTitle: Compatibility management
  compatSubtitle: API compatibility with other services. Can be useful during transition periods.
  compatODS: Enable ODS compatibility
  sections:
    info:
      title: Contact information
      subtitle: Contact information for users of your APIs and applications.
    catalog:
      title: Catalog
      subtitle: Topics, metadata, licenses and vocabulary used to describe your datasets and applications.
      subtitleNoApps: Topics, metadata, licenses and vocabulary used to describe your datasets.
      tabs:
        topics: Topics
        datasetsMetadata: Metadata
        licenses: Licenses
        privateVocabulary: Private vocabulary
    integrations:
      title: Access & integrations
      subtitle: API keys to access the Data Fair API, webhooks to notify external services. Technical configuration intended for advanced users.
      tabs:
        apiKeys: API keys
        webhooks: Webhooks
    publicationSites:
      title: Portals
      subtitle: Settings for your resource publication portals.
    features:
      title: Features
      subtitle: Optional features enabled for your account.
</i18n>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import { withSchemaDefaults } from '~/utils/schema-defaults'
import { mdiBookOpenVariant, mdiCancel, mdiCertificate, mdiFileDocumentEdit, mdiBookAlphabet, mdiTagMultiple, mdiKey, mdiWebhook } from '@mdi/js'
import { useLeaveGuard } from '@data-fair/lib-vue/leave-guard'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import ConfirmMenu from '~/components/confirm-menu.vue'
import qualitySvg from '~/assets/svg/data-arranging-two-color.svg?raw'
import securitySvg from '~/assets/svg/security-two-color.svg?raw'
import uiSvg from '~/assets/svg/user-interface-two-color.svg?raw'
import infoSvg from '~/assets/svg/creative-process-two-color.svg?raw'
import compatSvg from '~/assets/svg/settings-two-color.svg?raw'

const { t, locale } = useI18n()
const session = useSessionAuthenticated()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('settings') }] })

// TODO: manage authorization
// session.accountRole === 'admin'

const settingsAccount = ref({ ...session.account.value })

const selectedDepartment = ref('__root')
watch(selectedDepartment, (newVal, oldVal) => {
  // restoring the department after a refused confirm
  if (newVal === (settingsAccount.value.department ?? '__root')) return
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

// the API compares the API keys it gets back with the stored ones: a default added here would read as an edit
const { apiKeys: _apiKeys, ...normalizedProperties } = settingsSchema.properties
const normalizedSchema = { ...settingsSchema, properties: normalizedProperties }

// vjsf fills schema defaults on mount and when a list line opens, both sides get them to prevent false diffs
function normalizeSettings (s: any) {
  if (!s) return
  s.info = s.info || {}
  Object.assign(s, withSchemaDefaults(s, normalizedSchema))
}
watch(settingsEditFetch.serverData, (s) => {
  if (s) {
    normalizeSettings(s)
    normalizeSettings(settingsEditFetch.data.value)
  }
})

// Sub-edits, each section has its own save/cancel
const infoEdit = settingsEditFetch.createSubEdit(['info'], { success: t('saved') })
const catalogEdit = settingsEditFetch.createSubEdit(
  ['topics', 'licenses', 'datasetsMetadata', 'privateVocabulary'],
  { success: t('saved') }
)
const portalsEdit = settingsEditFetch.createSubEdit(['publicationSites'], { success: t('saved') })
const featuresEdit = settingsEditFetch.createSubEdit(['agentChat', 'agentChatAudience', 'compatODS'], { success: t('saved') })

const webhooksEdit = settingsEditFetch.createSubEdit(['webhooks'], { success: t('saved') })

const apiKeysEdit = settingsEditFetch.createSubEdit(['apiKeys'], { success: t('saved') })
// here and not in the component: the secrets of new keys survive a department switch
const apiKeysSecrets = ref<Record<string, string>>({})

const edits = [infoEdit, catalogEdit, webhooksEdit, portalsEdit, featuresEdit]
const anyDirty = computed(() => edits.some(edit => edit.hasDiff.value))
useLeaveGuard(anyDirty, { locale })

const catalogTab = ref('topics')
const integrationsTab = ref('apiKeys')
const saveConfirm = useTemplateRef('save-confirm')

// Validation state from child components
const infoValid = ref(true)
const webhooksValid = ref(true)
const topicsValid = ref(true)
const licensesValid = ref(true)
const datasetsMetadataValid = ref(true)
const privateVocabularyValid = ref(true)
const portalsValid = ref(true)
// only a modified tab counts: an unmounted form keeps reporting its last state
const catalogTabs = { topics: topicsValid, datasetsMetadata: datasetsMetadataValid, licenses: licensesValid, privateVocabulary: privateVocabularyValid }
const catalogValid = computed(() => Object.entries(catalogTabs).every(([key, valid]) => valid.value || !catalogEdit.keyHasDiff(key as keyof Settings).value))

// Tab color helper: for a modified tab, red if invalid and accent otherwise
function tabColor (hasDiff: boolean, valid: boolean): string | undefined {
  if (!hasDiff) return undefined
  return valid ? 'accent' : 'error'
}

// agentChat and compatODS are activated at the organization level only, departments inherit them
const showAgentChat = computed(() => !settingsAccount.value.department && !!$uiConfig.agentsIntegration)
const showCompat = computed(() => !settingsAccount.value.department && !!$uiConfig.compatODS && !!session.user.value.adminMode)

const sections = computed(() => {
  const result: Record<string, { title: string, tabs?: { key: string, title: string, icon: string, color?: string }[] }> = {}
  if (!settingsAccount.value.department) {
    result.info = { title: t('sections.info.title') }
    result.catalog = {
      title: t('sections.catalog.title'),
      tabs: [
        { key: 'topics', title: t('sections.catalog.tabs.topics'), icon: mdiTagMultiple, color: tabColor(catalogEdit.keyHasDiff('topics').value, topicsValid.value) },
        { key: 'datasetsMetadata', title: t('sections.catalog.tabs.datasetsMetadata'), icon: mdiFileDocumentEdit, color: tabColor(catalogEdit.keyHasDiff('datasetsMetadata').value, datasetsMetadataValid.value) },
        { key: 'licenses', title: t('sections.catalog.tabs.licenses'), icon: mdiCertificate, color: tabColor(catalogEdit.keyHasDiff('licenses').value, licensesValid.value) },
        { key: 'privateVocabulary', title: t('sections.catalog.tabs.privateVocabulary'), icon: mdiBookAlphabet, color: tabColor(catalogEdit.keyHasDiff('privateVocabulary').value, privateVocabularyValid.value) }
      ]
    }
  }
  result.integrations = {
    title: t('sections.integrations.title'),
    tabs: [
      { key: 'apiKeys', title: t('sections.integrations.tabs.apiKeys'), icon: mdiKey },
      { key: 'webhooks', title: t('sections.integrations.tabs.webhooks'), icon: mdiWebhook, color: tabColor(webhooksEdit.hasDiff.value, webhooksValid.value) }
    ]
  }
  if (!$uiConfig.disablePublicationSites) {
    result.publicationSites = { title: t('sections.publicationSites.title') }
  }
  if (showAgentChat.value || showCompat.value) {
    result.features = { title: t('sections.features.title') }
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
