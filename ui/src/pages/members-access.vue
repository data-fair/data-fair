<template>
  <v-container
    v-if="!authorized"
    data-iframe-height
  >
    <v-alert
      type="error"
      :text="t('notAuthorized')"
    />
  </v-container>
  <v-container
    v-else
    data-iframe-height
  >
    <v-row>
      <v-col
        cols="12"
        md="6"
      >
        <member-select
          :model-value="member"
          :organization="{ id: account!.id, name: account!.name }"
          :department="account!.department"
          @update:model-value="setMember"
        />
      </v-col>
    </v-row>
    <template v-if="auditReady">
      <v-alert
        type="info"
        density="compact"
        variant="tonal"
        class="mb-4"
        :text="t('simulationHint', { name: member!.name })"
      />
      <v-tabs
        v-model="resourceType"
        color="primary"
        class="mb-4"
      >
        <v-tab value="datasets">
          {{ t('datasets') }}
        </v-tab>
        <v-tab value="applications">
          {{ t('applications') }}
        </v-tab>
      </v-tabs>
      <v-alert
        v-if="catalog.initialized.value && !catalog.displayedItems.value.length"
        type="info"
        variant="text"
        :text="t('noResource')"
      />
      <v-row class="d-flex align-stretch">
        <v-col
          v-for="resource in catalog.displayedItems.value"
          :key="resource.id"
          cols="12"
          sm="6"
          md="4"
        >
          <dataset-card
            v-if="resourceType === 'datasets'"
            :dataset="resource"
            show-capability
          />
          <application-card
            v-else
            :application="resource"
            show-capability
          />
        </v-col>
      </v-row>
      <div
        v-if="catalog.hasMore.value && !catalog.loading.value"
        v-intersect="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
      />
    </template>
    <df-navigation-right v-if="auditReady">
      <df-search-field
        v-model="searchInput"
        class="mt-4"
      />
      <capability-filter
        v-model="can"
        :resource-type="resourceTypeTyped"
        class="mt-4 mx-4"
      />
      <dataset-facets
        v-if="resourceType === 'datasets'"
        v-model:status="facetStatus"
        v-model:visibility="facetVisibility"
        v-model:topics="facetTopics"
        v-model:keywords="facetKeywords"
        v-model:publication-sites="facetPublicationSites"
        :facets="catalog.facets.value"
        :account="account"
        class="mt-4 mx-4"
      />
      <application-facets
        v-else
        v-model:base-application="facetBaseApplication"
        v-model:visibility="facetVisibility"
        v-model:topics="facetTopics"
        v-model:publication-sites="facetPublicationSites"
        :facets="catalog.facets.value"
        :account="account"
        class="mt-4 mx-4"
      />
    </df-navigation-right>
  </v-container>
</template>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import dfSearchField from '@data-fair/lib-vuetify/search-field.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

type AuditMember = { id: string, name: string, email?: string, role?: string, department?: string }

const { t } = useI18n()
const session = useSession()
const account = session.account
const breadcrumbs = useBreadcrumbs()

breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

// org admins and department admins only (a department admin audits their department's resources)
const authorized = computed(() => {
  const a = account.value
  return !!a && a.type === 'organization' && session.state.accountRole === $uiConfig.adminRole
})

// the audited member, persisted in the URL as a JSON descriptor (deep-linkable between admins)
const memberParam = useStringSearchParam('member')
const member = computed<AuditMember | null>(() => {
  if (!memberParam.value) return null
  try {
    return JSON.parse(memberParam.value)
  } catch (err) {
    return null
  }
})
const setMember = (m: AuditMember | null) => {
  memberParam.value = m ? JSON.stringify({ id: m.id, name: m.name, email: m.email, role: m.role, department: m.department }) : ''
}

// the API descriptor requires id/email/role; simple-directory's members endpoint provides them all
const asAccountMember = computed(() => {
  const m = member.value
  if (!m?.id || !m.email || !m.role) return undefined
  const descriptor: Record<string, string> = { id: m.id, email: m.email, role: m.role }
  if (m.department) descriptor.department = m.department
  return JSON.stringify(descriptor)
})
const auditReady = computed(() => !!asAccountMember.value)

const resourceType = useStringSearchParam('resourceType', 'datasets')
// capability-filter/useCatalogList's fetchUrl want the narrowed literal union; the URL param itself stays a plain string
const resourceTypeTyped = computed<'datasets' | 'applications'>(() => resourceType.value === 'applications' ? 'applications' : 'datasets')

// search with debounce (same pattern as the list pages)
const q = useStringSearchParam('q')
const searchInput = ref(q.value || '')
let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { q.value = val || '' }, 300)
})
watch(q, (val) => { if (val !== searchInput.value) searchInput.value = val || '' })

const can = useStringsArraySearchParam('can')
const facetStatus = useStringsArraySearchParam('status')
const facetVisibility = useStringsArraySearchParam('visibility')
const facetTopics = useStringsArraySearchParam('topics')
const facetKeywords = useStringsArraySearchParam('keywords')
const facetPublicationSites = useStringsArraySearchParam('publicationSites')
const facetBaseApplication = useStringsArraySearchParam('base-application')

const selectFields: Record<string, string> = {
  datasets: 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft.file,draft.originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason,integrity',
  applications: 'title,description,status,updatedAt,publicationSites,topics,visibility,owner,url'
}

const auditQuery = computed(() => {
  const params: Record<string, any> = { select: selectFields[resourceType.value] }
  if (asAccountMember.value) params.asAccountMember = asAccountMember.value
  if (q.value) params.q = q.value
  else params.sort = 'createdAt:-1'
  if (can.value?.length) params.can = can.value.join(',')
  if (facetVisibility.value?.length) params.visibility = facetVisibility.value.join(',')
  if (facetTopics.value?.length) params.topics = facetTopics.value.join(',')
  if (facetPublicationSites.value?.length) params.publicationSites = facetPublicationSites.value.join(',')
  if (resourceType.value === 'datasets') {
    if (facetStatus.value?.length) params.status = facetStatus.value.join(',')
    if (facetKeywords.value?.length) params.keywords = facetKeywords.value.join(',')
  } else {
    if (facetBaseApplication.value?.length) params['base-application'] = facetBaseApplication.value.join(',')
  }
  return params
})

// one catalog for both tabs: the fetchUrl/query switch on the tab and trigger a reset.
// facetsFields is the union of both types; the server drops the fields a type doesn't support.
const catalog = useCatalogList<any>({
  fetchUrl: computed(() => `${$apiPath}/${resourceType.value}`),
  query: auditQuery,
  facetsFields: 'status,visibility,topics,keywords,publicationSites,base-application'
})
</script>

<i18n lang="yaml">
fr:
  title: Accès des membres
  notAuthorized: Cette page est réservée aux administrateurs de l'organisation.
  simulationHint: Ressources de l'organisation accessibles à {name}, comme si l'organisation était son compte actif. Ses accès personnels en dehors de l'organisation ne sont pas inclus.
  datasets: Jeux de données
  applications: Applications
  noResource: Aucune ressource accessible à ce membre avec ces filtres.
en:
  title: Members access
  notAuthorized: This page is only available to the organization's administrators.
  simulationHint: Organization resources accessible to {name}, as if the organization were their active account. Their personal access outside the organization is not included.
  datasets: Datasets
  applications: Applications
  noResource: No resource accessible to this member with these filters.
</i18n>
