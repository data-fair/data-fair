<template>
  <div
    v-if="total !== null"
    class="text-body-small"
    style="line-height: 1;"
  >
    <template v-if="!limit || total <= limit">
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
en:
  lines: "No line | 1 line | {count} lines"
  files: "No file | 1 file | {count} files"
  firstLines: "{lines} first lines ({total} total)"

</i18n>

<script setup lang="ts">
const { t, n } = useI18n()

const { total, limit, unit } = defineProps({
  total: { type: Number, required: false, default: null },
  limit: { type: Number, required: false, default: 10000 },
  unit: { type: String, required: false, default: 'lines' }
})
</script>

<style lang="css" scoped>
</style>
