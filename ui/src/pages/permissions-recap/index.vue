<template>
  <v-container>
    <permission-scope-select
      v-if="account"
      v-model="scope"
      :owner="account"
      class="mb-4"
    />

    <df-section-tabs
      id="permissions-recap"
      v-model="tab"
      :title="t('title')"
      :subtitle="t('subtitle')"
      :tabs="tabs"
      :svg="securitySvg"
    >
      <template #windows>
        <v-tabs-window-item value="datasets">
          <permission-recap-list
            resource-type="datasets"
            :scope="scope"
          />
        </v-tabs-window-item>
        <v-tabs-window-item value="applications">
          <permission-recap-list
            resource-type="applications"
            :scope="scope"
          />
        </v-tabs-window-item>
      </template>
    </df-section-tabs>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Récapitulatif des permissions
  subtitle: Choisissez une situation pour voir ce qu'elle permet d'atteindre, et pourquoi.
  datasets: Jeux de données
  applications: Applications
en:
  title: Permissions recap
  subtitle: Pick a situation to see what it reaches, and why.
  datasets: Datasets
  applications: Applications
</i18n>

<script setup lang="ts">
import PermissionScopeSelect from '~/components/permissions/permission-scope-select.vue'
import PermissionRecapList from '~/components/permissions/permission-recap-list.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { parseScopeParams, scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'
import { mdiDatabase, mdiImageMultiple } from '@mdi/js'
import securitySvg from '~/assets/svg/Security_Two Color.svg?raw'

const { t } = useI18n()
const { account } = useSession()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

const tabs = computed(() => [
  { key: 'datasets', title: t('datasets'), icon: mdiDatabase },
  { key: 'applications', title: t('applications'), icon: mdiImageMultiple }
])

const tab = useStringSearchParam('tab', 'datasets')

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
