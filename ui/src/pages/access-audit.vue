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
    <visitor-select
      :model-value="visitor"
      :account="{ id: account!.id, name: account!.name, department: account!.department }"
      @update:model-value="setVisitor"
    />
    <template v-if="auditReady">
      <v-alert
        type="info"
        density="compact"
        variant="tonal"
        class="mb-4"
        :text="t('hints.' + visitor!.kind, { org: account!.name })"
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
        v-if="catalog.initialized.value && !catalog.loading.value && !catalog.displayedItems.value.length"
        type="info"
        variant="text"
        :text="t('noResource')"
      />
      <v-row class="d-flex align-stretch">
        <!--
          displayedItems is cleared (see the visitor/resourceType watcher below) as soon as the
          audited identity changes, so this loading state only ever covers an empty grid — never
          the previous visitor's / previous tab's resources rendered under the new label.
        -->
        <template v-if="catalog.loading.value && !catalog.displayedItems.value.length">
          <v-col
            v-for="i in 6"
            :key="`skeleton-${i}`"
            cols="12"
            sm="6"
            md="4"
          >
            <v-skeleton-loader
              class="w-100"
              height="200"
              type="article"
            />
          </v-col>
        </template>
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
          <access-sources :sources="resource.accessSources" />
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

// the simulated visitor, persisted in the URL (deep-linkable between admins)
const visitorParam = useStringSearchParam('visitor')
const visitor = computed<AuditVisitor | null>(() => {
  if (!visitorParam.value) return null
  try {
    const parsed = JSON.parse(visitorParam.value)
    return auditVisitorKinds.includes(parsed?.kind) ? parsed : null
  } catch (err) {
    return null
  }
})
const setVisitor = (v: AuditVisitor | null) => {
  visitorParam.value = v ? JSON.stringify(v) : ''
}

const asVisitor = computed(() => authorized.value && account.value ? asVisitorDescriptor(visitor.value, account.value) : undefined)
const auditReady = computed(() => !!asVisitor.value)

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
  if (asVisitor.value) params.asVisitor = asVisitor.value
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

// useCatalogList's reset() doesn't clear displayedItems before re-fetching, so without this,
// switching the simulated visitor (or the datasets/applications tab) would keep showing the
// PREVIOUS visitor's/tab's resources — under the newly selected label — until the new request
// resolves. On a page whose whole purpose is trustworthy access auditing, that wrong-identity
// flash is a correctness bug, not just a cosmetic one: clear eagerly instead.
watch([asVisitor, resourceType], () => { catalog.displayedItems.value = [] })
</script>

<i18n lang="yaml">
fr:
  title: Audit des accès
  notAuthorized: Cette page est réservée aux administrateurs de l'organisation.
  hints:
    member: Ressources de {org} accessibles à ce membre, comme si {org} était son compte actif. Ses accès personnels en dehors de l'organisation ne sont pas inclus.
    role: Ressources de {org} accessibles à tout membre ayant ce rôle, sans compter les permissions accordées nominativement.
    partner: Ressources de {org} accessibles aux membres de cette organisation partenaire lorsqu'elle est leur compte actif.
    email: Ressources de {org} accessibles à cet utilisateur lorsqu'il n'est pas membre de {org}.
    connected: Ressources de {org} accessibles à n'importe quel utilisateur connecté.
    anonymous: Ressources de {org} accessibles sans être connecté.
  datasets: Jeux de données
  applications: Applications
  noResource: Aucune ressource accessible à ce visiteur avec ces filtres.
en:
  title: Access audit
  notAuthorized: This page is only available to the organization's administrators.
  hints:
    member: Resources of {org} accessible to this member, as if {org} were their active account. Their personal access outside the organization is not included.
    role: Resources of {org} accessible to any member with this role, not counting permissions granted to named users.
    partner: Resources of {org} accessible to the members of this partner organization when it is their active account.
    email: Resources of {org} accessible to this user when they are not a member of {org}.
    connected: Resources of {org} accessible to any authenticated user.
    anonymous: Resources of {org} accessible without being logged in.
  datasets: Datasets
  applications: Applications
  noResource: No resource accessible to this visitor with these filters.
</i18n>
