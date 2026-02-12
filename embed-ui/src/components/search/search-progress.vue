<template lang="html">
  <v-row>
    <div style="height:2px;width:100%;padding:4px 8px 4px 8px;">
      <v-progress-linear
        v-if="loading"
        :indeterminate="true"
        height="2"
        style="margin:0;"
      />
    </div>
  </v-row>
</template>

<script lang="ts" setup>

defineProps<{ loading: boolean }>()
</script>

<style lang="css">
</style>
