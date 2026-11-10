<template>
  <!-- one fact of a card: icon (or a custom prepend) and a text truncated with an ellipsis, details on hover when given -->
  <v-menu
    :disabled="!$slots.help"
    open-on-hover
    :open-delay="150"
    location="top start"
    :close-on-content-click="false"
  >
    <template #activator="{ props: activator }">
      <span
        v-bind="activator"
        class="d-flex align-center ga-2 overflow-hidden text-body-medium"
        :class="{ 'cursor-help align-self-start': $slots.help, [`text-${color}`]: color }"
        style="max-width: 100%"
      >
        <slot name="prepend">
          <v-icon
            v-if="icon"
            :icon="icon"
            :color="iconColor ?? color"
            size="18"
          />
        </slot>
        <span class="text-truncate">
          <slot>{{ text }}</slot>
        </span>
      </span>
    </template>
    <v-card
      elevation="2"
      max-width="280"
      class="pa-3 text-body-medium"
    >
      <slot name="help" />
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
defineProps<{ icon?: string, text?: string, color?: string, iconColor?: string }>()
</script>
