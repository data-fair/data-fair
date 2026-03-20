<template>
  <v-tooltip
    :location="location"
    max-width="400"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        :size="small ? 'small' : 'default'"
        variant="text"
      >
        <v-icon :size="small ? 'small' : 'default'">
          mdi-information
        </v-icon>
      </v-btn>
    </template>
    <div class="help-tooltip-content">
      <slot />
    </div>
  </v-tooltip>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
  small?: boolean
  location?: 'top' | 'bottom' | 'start' | 'end' | 'left' | 'right'
}>(), {
  small: false,
  location: 'start'
})
</script>

<style>
.help-tooltip-content p:last-child {
  margin-bottom: 0;
}
</style>
