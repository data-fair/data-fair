<template>
  <div
    v-if="total !== null"
    class="text-body-small"
    style="line-height: 1;"
  >
    <template v-if="marginPct !== undefined">
      <v-tooltip location="bottom">
        <template #activator="{props: tooltipProps}">
          <span v-bind="tooltipProps">
            {{ t('estimated', {total: n(total)}) }}
            <v-icon
              size="x-small"
              :icon="mdiInformationOutline"
            />
          </span>
        </template>
        {{ t('estimateTooltip', {pct: marginPct}) }}
        <template v-if="ignoredWords?.length">
          <br>
          {{ t('ignoredWordsTooltip', {words: ignoredWords.join(', ')}) }}
        </template>
      </v-tooltip>
    </template>
    <template v-else-if="!limit || total <= limit">
      {{ t(unit, {total: n(total)}, total) }}
    </template>
    <template v-else>
      {{ t('firstLines', {lines: n(limit), total: n(total)}) }}
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  lines: "Aucune ligne | 1 ligne | {total} lignes"
  files: "Aucun fichier | 1 fichier | {total} fichiers"
  firstLines: "{lines} premières lignes ({total} au total)"
  estimated: "~ {total} lignes"
  estimateTooltip: "Nombre approximatif (± {pct} %) obtenu par échantillonnage — le tri des résultats reste exact. L'API permet un décompte exact avec count=exact."
  ignoredWordsTooltip: "Mots très fréquents ignorés pour le filtrage : {words} (ils comptent toujours pour le classement)."
en:
  lines: "No line | 1 line | {count} lines"
  files: "No file | 1 file | {count} files"
  firstLines: "{lines} first lines ({total} total)"
  estimated: "~ {total} lines"
  estimateTooltip: "Approximate count (± {pct} %) obtained by sampling — the ranking of results stays exact. The API returns an exact count with count=exact."
  ignoredWordsTooltip: "Very frequent words ignored for filtering: {words} (they still count for ranking)."

</i18n>

<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'

const { t, n } = useI18n()

const { total, limit, unit, marginPct, ignoredWords } = defineProps({
  total: { type: Number, required: false, default: null },
  limit: { type: Number, required: false, default: 10000 },
  unit: { type: String, required: false, default: 'lines' },
  marginPct: { type: Number, required: false, default: undefined },
  ignoredWords: { type: Array<string>, required: false, default: undefined }
})
</script>

<style lang="css" scoped>
</style>
