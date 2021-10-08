<template>
  <div
    v-if="total !== undefined"
    class="text-caption"
    style="line-height: 1;"
  >
    <template v-if="total <= 10000" v-text="$tc('lines', total)" />
    <template v-else v-t="{path: 'firstLines', args: {lines: 10000, total}}" />
  </div>
</template>

<i18n lang="yaml">
fr:
  lines: "aucune ligne | 1 ligne | {count} lignes"
  firstLines: "{lines} premières lignes ({total} au total)"
en:
  lines: "no line | 1 line | {count} lines"
  firstLines: "{lines} first lines ({total} total)"

</i18n>

<script>
  export default {
    props: ['total'],
    computed: {
      plural() {
        return this.total > 1
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
