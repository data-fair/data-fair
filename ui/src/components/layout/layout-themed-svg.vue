<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    class="df-themed-svg"
    v-html="themedSource"
  />
</template>

<script lang="ts" setup>
import { useTheme } from 'vuetify'

const { source, color = 'primary' } = defineProps<{ source: string, color?: string }>()
const theme = useTheme()

const themedSource = computed(() => {
  return source
    .replace(/#6C63FF/gi, theme.current.value.colors[color] as string) // default undraw color
    .replace(/#68E1FD/gi, theme.current.value.colors[color] as string) // default manypixels color
    .replace(/#FFD200/gi, theme.current.value.colors.secondary as string)
    .replace(/style="isolation: isolate;"/gi, 'class="isolated-svg"')
})
</script>

<style lang="css">
div.df-themed-svg {
  height: 100%;
}
div.df-themed-svg svg {
  height: inherit;
  width: inherit;
}
.isolated-svg { isolation: isolate; }
</style>
