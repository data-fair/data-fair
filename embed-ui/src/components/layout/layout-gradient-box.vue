<template>
  <div
    :style="style"
    class="df-gradient-box"
  >
    <slot />
  </div>
</template>

<script lang="ts" setup>
import { useTheme } from 'vuetify/lib/composables/theme.mjs'
import microTemplate from '@data-fair/lib-utils/micro-template.js'

const {

  gradient = 'linear-gradient(180deg, {primary} 0%, {secondary} 100%',
  sides = 'trbl',
  width = 2,
  radius = 6 // default is md +2 to make is slightly rounder than child with md border
} = defineProps<{ gradient?: string, sides?: string, width?: number, radius?: number }>()

const theme = useTheme()

const style = computed(() => {
  const rules = [`background: ${microTemplate(gradient, theme.current.value.colors)}`]
  if (sides.includes('t')) rules.push(`padding-top: ${width}px`)
  if (sides.includes('r')) rules.push(`padding-right: ${width}px`)
  if (sides.includes('b')) rules.push(`padding-bottom: ${width}px`)
  if (sides.includes('l')) rules.push(`padding-left: ${width}px`)
  if (sides.includes('t') && sides.includes('l')) rules.push(`border-top-left-radius: ${radius}px;`)
  if (sides.includes('t') && sides.includes('r')) rules.push(`border-top-right-radius: ${radius}px;`)
  if (sides.includes('b') && sides.includes('r')) rules.push(`border-bottom-right-radius: ${radius}px;`)
  if (sides.includes('b') && sides.includes('l')) rules.push(`border-bottom-left-radius: ${radius}px;`)
  return rules
})

</script>
