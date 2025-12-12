<template lang="html">
  <v-container
    data-iframe-height
    fluid
  >
    <settings-datasets-metadata
      v-if="settings"
      v-model="settings.datasetsMetadata"
      @update:model-value="patch.execute({datasetsMetadata: settings.datasetsMetadata})"
    />
  </v-container>
</template>

<script setup lang="ts">
useFrameContent()
const route = useRoute<'/settings/[type]/[id]/datasets-metadata'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
