<template>
  <div
    v-if="total !== null"
    class="text-caption"
    style="line-height: 1;"
  >
    <template v-if="!limit || total <= limit">
      {{ $tc('lines', total, {total: $n(total)}) }}
    </template>
    <template v-else>
      {{ $t('firstLines', {lines: $n(limit), total: $n(total)}) }}
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

<script>
export default {
  props: {
    total: { type: Number, required: false, default: null },
    limit: { type: Number, required: false, default: 10000 }
  },
  computed: {
    plural () {
      return this.total > 1
    }
  }
}
</script>

<style lang="css" scoped>
</style>
