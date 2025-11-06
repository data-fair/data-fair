<template lang="html">
  <v-container
    data-iframe-height
    fluid
  >
    <settings-topics
      v-if="settings"
      v-model="settings.topics"
      @update:model-value="patch.execute({topics: settings.topics})"
    />
  </v-container>
</template>

<script setup lang="ts">
useFrameContent()
const route = useRoute<'/settings/[type]/[id]/topics'>()
const { patch, settings } = useSettingsStore(route.params.type, route.params.id)

</script>
