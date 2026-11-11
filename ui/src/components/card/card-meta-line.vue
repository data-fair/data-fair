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
      <!-- with details: a text button for its native hover effect, as a span since a button cannot sit in the card link;
           px-1 on every line, the body adds the other 4px of the card padding -->
      <component
        :is="$slots.help ? VBtn : 'span'"
        v-bind="$slots.help ? { ...activator, ...button } : {}"
        class="px-1 overflow-hidden text-body-medium"
        :class="$slots.help ? 'df-card-shrink flex-shrink-1 align-self-start text-none font-weight-regular cursor-help' : color && `text-${color}`"
        style="max-width: 100%"
      >
        <span class="d-flex align-center ga-2 overflow-hidden">
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
      </component>
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
import { computed } from 'vue'
import { VBtn } from 'vuetify/components'

const props = defineProps<{ icon?: string, text?: string, color?: string, iconColor?: string }>()
const button = computed(() => ({ tag: 'span', variant: 'text', color: props.color, height: 'auto', minWidth: 0, ripple: false }))
</script>
