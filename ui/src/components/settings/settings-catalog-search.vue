<template>
  <div class="mt-6">
    <h3 class="text-h6 mb-2">
      {{ t('title') }}
    </h3>
    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="t('disclaimer')"
    />
    <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
      <vjsf
        v-model="editCatalogSearch"
        :schema="catalogSearchSchema"
        :options="vjsfOptions"
      />
    </v-defaults-provider>
  </div>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const catalogSearch = defineModel<Settings['catalogSearch']>()
const editCatalogSearch = ref<Settings['catalogSearch']>()
watchDeepDiff(catalogSearch, () => {
  editCatalogSearch.value = catalogSearch.value
}, { immediate: true })
watchDeepDiff(editCatalogSearch, () => {
  catalogSearch.value = editCatalogSearch.value
}, {})
const { t, locale } = useI18n()

// the title and description are rendered by this component, not by the form
const catalogSearchSchema = computed(() => {
  const { title, description, 'x-i18n-title': _t, 'x-i18n-description': _d, ...schema } = settingsSchema.properties.catalogSearch as any
  return schema
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))
</script>

<i18n lang="yaml">
fr:
  title: Recherche du catalogue
  disclaimer: "Ce que la recherche textuelle du catalogue voit en plus des métadonnées. Une correspondance peut révéler qu'une colonne ou une valeur existe à quiconque peut lister le jeu de données, même sans accès à son schéma ou à ses lignes ; les jeux de données exposés à de tels lecteurs sont automatiquement exclus."
en:
  title: Catalog search
  disclaimer: "What the catalog text search sees on top of the metadata. A match can reveal that a column or a value exists to anyone who can list the dataset, even without access to its schema or lines; datasets exposed to such readers are excluded automatically."
</i18n>
