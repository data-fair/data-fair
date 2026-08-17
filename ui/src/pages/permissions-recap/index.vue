<template>
  <v-container>
    <permission-scope-select
      v-if="account"
      v-model="scope"
      :owner="account"
      class="mb-4"
    />

    <v-tabs
      v-model="tab"
      class="mb-4"
    >
      <v-tab value="datasets">
        {{ t('datasets') }}
      </v-tab>
      <v-tab value="applications">
        {{ t('applications') }}
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="datasets">
        <permission-recap-list
          v-model:actions="datasetsActions"
          resource-type="datasets"
          :scope="scope"
        />
      </v-tabs-window-item>
      <v-tabs-window-item value="applications">
        <permission-recap-list
          v-model:actions="applicationsActions"
          resource-type="applications"
          :scope="scope"
        />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Récapitulatif des permissions
  datasets: Jeux de données
  applications: Applications
en:
  title: Permissions recap
  datasets: Datasets
  applications: Applications
</i18n>

<script setup lang="ts">
import PermissionScopeSelect from '~/components/permissions/permission-scope-select.vue'
import PermissionRecapList from '~/components/permissions/permission-recap-list.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { parseScopeParams, scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const { t } = useI18n()
const { account } = useSession()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

const tab = useStringSearchParam('tab', 'datasets')
const datasetsActions = useStringsArraySearchParam('datasetsActions')
const applicationsActions = useStringsArraySearchParam('applicationsActions')

// the five common scope parameters live in the URL individually, so the whole page state
// is shareable and can later be forwarded to an embedded portals iframe as-is
const scopeType = useStringSearchParam('scopeType')
const scopeId = useStringSearchParam('scopeId')
const scopeEmail = useStringSearchParam('scopeEmail')
const scopeDepartment = useStringSearchParam('scopeDepartment')
const scopeRoles = useStringSearchParam('scopeRoles')

const scope = computed<PermissionScope | null>({
  get: () => parseScopeParams({
    scopeType: scopeType.value,
    scopeId: scopeId.value,
    scopeEmail: scopeEmail.value,
    scopeDepartment: scopeDepartment.value,
    scopeRoles: scopeRoles.value
  }),
  set: (v) => {
    const params = scopeToParams(v)
    scopeType.value = params.scopeType ?? ''
    scopeId.value = params.scopeId ?? ''
    scopeEmail.value = params.scopeEmail ?? ''
    scopeDepartment.value = params.scopeDepartment ?? ''
    scopeRoles.value = params.scopeRoles ?? ''
  }
})
</script>
