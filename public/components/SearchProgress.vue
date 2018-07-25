<template lang="html">
  <div style="height:2px;width:100%;padding:0 8px 0 8px;">
    <v-progress-linear v-if="loading" :indeterminate="true" height="2" style="margin:0;"/>
  </div>
</template>

<script>
export default {
  props: ['loading']
}
</script>

<style lang="css">
</style>
