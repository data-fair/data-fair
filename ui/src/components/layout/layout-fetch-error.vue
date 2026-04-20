<template>
  <v-container
    class="text-center"
    max-width="800"
  >
    <df-themed-svg
      :source="svgSource"
      class="mx-auto mt-8"
      style="max-width: 400px; width: 100%;"
    />
    <p class="text-title-large font-weight-bold mt-4">
      {{ title }}
    </p>
    <p
      v-if="errorMsg"
      class="text-body-medium text-medium-emphasis mt-2"
    >
      {{ errorMsg }}
    </p>
    <div class="d-flex ga-2 justify-center mt-6">
      <v-btn
        v-if="switchOrg"
        color="accent"
        variant="flat"
        @click="doSwitch"
      >
        {{ t('switchAccount') }}
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        :to="backLink.to"
        :prepend-icon="mdiChevronLeft"
      >
        {{ backLink.label }}
      </v-btn>
    </div>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  notFound: La ressource demandée n'existe pas
  forbidden: Vous n'avez pas les droits pour accéder à cette ressource
  error: Une erreur indéterminée s'est produite
  switchAccount: Basculer le compte actif
  backToDatasets: Retour aux jeux de données
  backToApplications: Retour aux applications
  backToHome: Retour à l'accueil
en:
  notFound: The requested resource does not exist
  forbidden: You do not have permission to access this resource
  error: An unexpected error has occurred
  switchAccount: Switch active account
  backToDatasets: Back to datasets
  backToApplications: Back to applications
  backToHome: Back to home
</i18n>

<script setup lang="ts">
import DfThemedSvg from '@data-fair/lib-vuetify/themed-svg.vue'
import { useSession } from '@data-fair/lib-vue/session.js'
import { getErrorMsg } from '@data-fair/lib-vue/ui-notif.js'
import { mdiChevronLeft } from '@mdi/js'
import errorNotFoundSvg from '~/assets/svg/error-not-found.svg?raw'
import errorForbiddenSvg from '~/assets/svg/error-forbidden.svg?raw'
import errorServerSvg from '~/assets/svg/error-server.svg?raw'

const props = defineProps<{
  error: any
  resourceType?: 'dataset' | 'application'
}>()

const { t } = useI18n()
const { switchOrganization, user } = useSession()

const statusCode = computed(() => props.error?.statusCode ?? props.error?.status ?? 500)

const errorMsg = computed(() => (props.error ? getErrorMsg(props.error) : null))

const svgSource = computed(() => {
  if (statusCode.value === 404) return errorNotFoundSvg
  if (statusCode.value === 401 || statusCode.value === 403) return errorForbiddenSvg
  return errorServerSvg
})

const title = computed(() => {
  if (statusCode.value === 404) return t('notFound')
  if (statusCode.value === 401 || statusCode.value === 403) return t('forbidden')
  return t('error')
})

const backLink = computed(() => {
  if (props.resourceType === 'dataset') return { to: '/datasets', label: t('backToDatasets') }
  if (props.resourceType === 'application') return { to: '/applications', label: t('backToApplications') }
  return { to: '/', label: t('backToHome') }
})

/**
 * Extracts the target organization from the 403 error message to enable account switching.
 *
 * The API (permissions.ts middleware) returns a text/plain 403 with the format:
 *   "...l'organisation {name} ({orgId}) dont vous êtes membre..."
 *
 * The regex captures the orgId between parentheses just before "dont vous êtes membre",
 * then matches it against the user's session organizations to retrieve the full org object
 * (id, department, role) needed by switchOrganization().
 */
const switchOrg = computed(() => {
  const msg = errorMsg.value
  if (!msg || !user.value) return null

  const match = msg.match(/\(([^)]+)\) dont vous êtes membre/)
  if (!match) return null

  const orgId = match[1]
  return user.value.organizations?.find(o => o.id === orgId) ?? null
})

const doSwitch = () => {
  if (!switchOrg.value) return
  switchOrganization(switchOrg.value.id, switchOrg.value.department, switchOrg.value.role)
  window.location.reload()
}
</script>
