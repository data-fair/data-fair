<template lang="html">
  <v-container
    data-iframe-height
  >
    <settings-topics
      v-if="settings"
      v-model="settings.topics"
      @update:model-value="patch.execute({topics: settings.topics})"
    />
  </v-container>
</template>

<script setup lang="ts">
const route = useRoute<'/embed/settings/[type]/[id]/topics'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
