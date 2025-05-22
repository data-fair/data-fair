<template>
  <div
    v-if="total !== null"
    class="text-caption"
    style="line-height: 1;"
  >
    <template v-if="!limit || total <= limit">
      {{ t('lines', {total: n(total)}, total) }}
    </template>
    <template v-else>
      {{ t('firstLines', {lines: n(limit), total: n(total)}) }}
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  lines: "aucune ligne | 1 ligne | {total} lignes"
  firstLines: "{lines} premières lignes ({total} au total)"
en:
  lines: "no line | 1 line | {count} lines"
  firstLines: "{lines} first lines ({total} total)"

</i18n>

<script setup lang="ts">
const { t, n } = useI18n()

const { total, limit } = defineProps({
  total: { type: Number, required: false, default: null },
  limit: { type: Number, required: false, default: 10000 }
})
</script>

<style lang="css" scoped>
</style>
