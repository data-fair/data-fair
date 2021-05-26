<template>
  <div
    v-if="total !== undefined"
    class="text-caption"
    style="line-height: 1;"
  >
    <template v-if="total <= 10000">
      {{ total.toLocaleString() }} {{ plural ? 'lignes' : 'ligne' }}
    </template>
    <template v-else>
      {{ (10000).toLocaleString() }} {{ plural ? 'premières lignes' : 'première ligne' }} ({{ total.toLocaleString() }} au total)
    </template>
  </div>
</template>

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
