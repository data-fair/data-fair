<template>
  <div
    v-if="total !== null"
    class="text-body-small"
    style="line-height: 1;"
  >
    <template v-if="estimate">
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
        {{ t('estimateTooltip') }}
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
  estimateTooltip: "Nombre approximatif obtenu par échantillonnage — le tri des résultats reste exact. L'API permet un décompte exact avec count=exact."
en:
  lines: "No line | 1 line | {count} lines"
  files: "No file | 1 file | {count} files"
  firstLines: "{lines} first lines ({total} total)"
  estimated: "~ {total} lines"
  estimateTooltip: "Approximate count obtained by sampling — the ranking of results stays exact. The API returns an exact count with count=exact."

</i18n>

<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'

const { t, n } = useI18n()

const { total, limit, unit, estimate } = defineProps({
  total: { type: Number, required: false, default: null },
  limit: { type: Number, required: false, default: 10000 },
  unit: { type: String, required: false, default: 'lines' },
  estimate: { type: Boolean, required: false, default: false }
})
</script>

<style lang="css" scoped>
</style>
