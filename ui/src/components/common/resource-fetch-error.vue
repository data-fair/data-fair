<template>
  <v-container>
    <v-alert
      v-if="errorMsg"
      type="error"
      variant="tonal"
      class="mt-4"
    >
      {{ errorMsg }}
      <template
        v-if="switchOrg"
        #append
      >
        <v-btn
          color="error"
          variant="flat"
          @click="doSwitch"
        >
          {{ t('switchAccount') }}
        </v-btn>
      </template>
    </v-alert>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  switchAccount: Changer le compte
en:
  switchAccount: Switch account
</i18n>

<script setup lang="ts">
import { useSession } from '@data-fair/lib-vue/session.js'
import { getErrorMsg } from '@data-fair/lib-vue/ui-notif.js'

const props = defineProps<{
  error: any
}>()

const { t } = useI18n()
const { switchOrganization, user } = useSession()

const errorMsg = computed(() => {
  if (!props.error) return null
  return getErrorMsg(props.error)
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

  // Captures the org id between parentheses: "...({orgId}) dont vous êtes membre..."
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
