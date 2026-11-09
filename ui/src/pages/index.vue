<template>
  <v-container
    v-if="user"
    fluid
    class="pa-6"
    style="max-width: 1600px"
  >
    <v-alert
      v-if="missingSubscription"
      type="warning"
      variant="outlined"
      class="mb-6"
    >
      <i18n-t keypath="subscriptionRequired">
        <template #subscriptionLink>
          <router-link to="/subscription">
            {{ t('subscriptionPage') }}
          </router-link>
        </template>
      </i18n-t>
    </v-alert>

    <dashboard-hero class="mb-6" />

    <v-row>
      <v-col
        cols="12"
        :md="side ? 8 : 12"
      >
        <v-row>
          <v-col
            cols="12"
            sm="6"
          >
            <dashboard-kpi
              kind="datasets"
              :limits="limits"
            />
          </v-col>
          <v-col
            v-if="!$uiConfig.disableApplications"
            cols="12"
            sm="6"
          >
            <dashboard-kpi
              kind="applications"
              :limits="limits"
            />
          </v-col>
          <v-col
            v-if="canContribDep"
            cols="12"
          >
            <dashboard-todo
              :limits="limits"
              :publication-sites="publicationSites"
              :shared-fetches="[limitsFetch, publicationSitesFetch]"
            />
          </v-col>
        </v-row>
      </v-col>
      <!-- the right column stacks its cards on its own, its height does not drive the main column -->
      <v-col
        v-if="side"
        cols="12"
        md="4"
        class="d-flex flex-column ga-6"
      >
        <dashboard-activity v-if="side.activity" />
        <dashboard-portals
          v-if="side.portals"
          :publication-sites="portalSites!"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  dashboard: Tableau de bord
  subscriptionRequired: Un abonnement est requis. Rendez-vous sur la {subscriptionLink}.
  subscriptionPage: page d'abonnement
en:
  dashboard: Dashboard
  subscriptionRequired: A subscription is required. Please visit the {subscriptionLink}.
  subscriptionPage: subscription page
</i18n>

<script setup lang="ts">
import { usePermissions } from '~/composables/use-permissions'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import type { PublicationSite } from '~/components/dashboard/dashboard-portals.vue'

const { t } = useI18n()
const { user, account } = useSession()

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('dashboard') }] })

// usePermissions uses useSession() internally, so it can be called unconditionally
const { canContrib, canContribDep, canAdmin, missingSubscription } = usePermissions()

// shared by the key figures and the "to do" card
// not /stats: a scoped session cannot read it, the limits route answers any scope
const limitsFetch = useFetch<Record<string, { consumption: number, limit: number }>>(() => canContrib.value && account.value ? `${$apiPath}/limits/${account.value.type}/${account.value.id}` : null)
const limits = computed(() => limitsFetch.data.value ?? undefined)

// shared by the publication lines of the "to do" card and the portals card
const publicationSitesFetch = useFetch<PublicationSite[]>(() => account.value ? `${$apiPath}/settings/${account.value.type}/${account.value.id}:${account.value.department ?? '*'}/publication-sites` : null)
// the API merges the organization sites in: a department only handles its own and those it contributes to
const publicationSites = computed(() => {
  const sites = publicationSitesFetch.data.value ?? undefined
  const department = account.value?.department
  return department ? sites?.filter(site => site.department === department || site.canContributeAsDepartment) : sites
})
// the url is a free text field: only a valid http(s) one can be opened
const portalSites = computed(() => publicationSites.value?.filter(site => {
  try {
    return ['http:', 'https:'].includes(new URL(site.url!).protocol)
  } catch {
    return false
  }
}))

const side = computed(() => {
  const blocks = {
    activity: canAdmin.value && $uiConfig.eventsIntegration,
    portals: !!portalSites.value?.length
  }
  return Object.values(blocks).some(Boolean) ? blocks : null
})
</script>
