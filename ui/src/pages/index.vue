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
              :pages-facets="pagesFacets"
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
        <dashboard-assistant v-if="side.assistant" />
        <dashboard-activity v-if="side.activity" />
        <dashboard-portals
          v-if="side.portals"
          :publication-sites="publicationSites!"
          :pages-facets="pagesFacets"
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
import { useShowAgentChat } from '~/composables/agent/use-show-chat'
import type { PublicationSite } from '~/components/dashboard/dashboard-portals.vue'

const { t } = useI18n()
const { user, account } = useSession()

const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('dashboard') }] })

// usePermissions uses useSession() internally, so it can be called unconditionally
const { canContrib, canContribDep, canAdmin, missingSubscription } = usePermissions()
const showAgentChat = useShowAgentChat()

// shared by the key figures and the "to do" card
const statsFetch = useFetch<{ limits: Record<string, { consumption: number, limit: number }> }>(() => canContrib.value ? `${$apiPath}/stats` : null)
const limits = computed(() => statsFetch.data.value?.limits)

// shared by the publication lines of the "to do" card and the portals card
const publicationSitesFetch = useFetch<PublicationSite[]>(() => account.value ? `${$apiPath}/settings/${account.value.type}/${account.value.id}/publication-sites` : null)
const publicationSites = computed(() => publicationSitesFetch.data.value ?? undefined)

// pages to validate in the "to do" card, pages per portal in the portals card
const pagesFetch = useFetch<{ facets: { portals: Record<string, number>, requestedPortals: Record<string, number> } }>(() => $uiConfig.portalsIntegration && canContribDep.value ? `${$sitePath}/portals-manager/api/pages?size=0` : null)
const pagesFacets = computed(() => pagesFetch.data.value?.facets)

const side = computed(() => {
  const blocks = {
    assistant: showAgentChat.value,
    activity: canAdmin.value && $uiConfig.eventsIntegration,
    portals: !!publicationSites.value?.some(site => site.url)
  }
  return Object.values(blocks).some(Boolean) ? blocks : null
})
</script>
