<template>
  <div class="d-flex flex-column align-center justify-center mt-4">
    <template v-if="hasSearch">
      <div class="text-title-medium">
        {{ noResultText || t('noResult') }}
      </div>
    </template>
    <template v-else>
      <v-icon
        size="64"
        color="grey"
        class="mb-4"
        :icon="icon || mdiAlertCircleOutline"
      />
      <div class="text-title-medium">
        {{ noDataText || t('noData') }}
      </div>
      <v-btn
        v-if="canContribDep && btnTo"
        color="primary"
        :prepend-icon="mdiPlus"
        :to="btnTo"
        class="mt-4"
      >
        {{ btnText || t('create') }}
      </v-btn>
    </template>
  </div>
</template>

<script setup lang="ts">
import { mdiAlertCircleOutline, mdiPlus } from '@mdi/js'

const { t } = useI18n()
const { canContribDep } = usePermissions()

defineProps<{
  hasSearch?: boolean
  icon?: string
  noDataText?: string
  noResultText?: string
  btnText?: string
  btnTo?: string
}>()

</script>

<i18n lang="yaml">
fr:
  create: Créer
  noData: Aucun résultat trouvé.
  noResult: Aucun résultat ne correspond à la recherche.
en:
  create: Create
  noData: No result found.
  noResult: No result matches the search.
</i18n>
