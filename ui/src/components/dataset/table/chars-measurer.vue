<template>
  <div style="font-size:14px;">
    <span
      v-for="(char, i) of chars"
      :key="i"
      style="width:auto;"
      class="char"
      :data-char="i"
      v-text="char"
    />
    <br>
  </div>
</template>

<script setup lang="ts">
import { useCurrentElement } from '@vueuse/core'

const charsWidths = defineModel<Record<string, number> | null>({ default: null })
const letters = 'abcdefghijklmnopqrstuvwxyzéèàçùâêôûîïüöëœ'
const chars = [
  ...letters,
  ...letters.toUpperCase(),
  ...'0123456789 +=<>%*!/:.;,?&~@\'’"_-|#()[]{}°²–\t\\'
]
const element = useCurrentElement()

onMounted(async () => {
  const values: Record<string, number> = {}
  if (!(element.value instanceof HTMLElement)) throw new Error('element should be instance of HTMLElement')
  element.value?.querySelectorAll('.char').forEach(elem => {
    const i = elem.getAttribute('data-char')
    if (i) {
      values[chars[Number(i)]] = Math.ceil(elem.getBoundingClientRect().width * 100) / 100
    }
  })
  charsWidths.value = values
})
</script>

<style>

</style>
