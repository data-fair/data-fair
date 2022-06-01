<template>
  <span
    v-if="owner && owner.department"
    class="text-caption"
    style="max-width: 100px;"
  >
    {{ owner.department }}
  </span>
</template>

<script>
export default {
  props: ['owner']
}
</script>

<style>

</style>
