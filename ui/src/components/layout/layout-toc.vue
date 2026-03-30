<template>
  <v-list
    v-if="sections && sections.length"
    density="compact"
    color="primary"
    class="py-0"
    bg-color="background"
  >
    <v-list-subheader>{{ t('content') }}</v-list-subheader>

    <v-list-item
      v-for="(section, i) in sections"
      :key="i"
      :active="activeIndex === i"
      @click="goTo('#' + section.id, { offset: -20, container: '.v-main__scroller' })"
    >
      <v-list-item-title>
        <slot
          name="title"
          :section="section"
        >
          {{ section.title }}
        </slot>
      </v-list-item-title>
      <slot
        name="bottom"
        :section="section"
      />
    </v-list-item>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  content: CONTENU
en:
  content: CONTENT
</i18n>

<script lang="ts" setup>
import { useGoTo } from 'vuetify'
const { sections } = defineProps<{ sections: { id: string, title: string }[] }>()

const goTo = useGoTo()
const { t } = useI18n()

let timeout: NodeJS.Timeout | undefined
let scrollEl: Element | null = null

const onScroll = () => {
  clearTimeout(timeout)
  timeout = setTimeout(findActiveIndex, 17)
}

onMounted(() => {
  scrollEl = document.querySelector('.v-main__scroller')
  if (scrollEl) {
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
  }
})

onUnmounted(() => {
  if (scrollEl) {
    scrollEl.removeEventListener('scroll', onScroll)
  }
})

const activeIndex = ref<number | null>(null)
const findActiveIndex = () => {
  if (!scrollEl) return
  const currentOffset = scrollEl.scrollTop
  let index = 0
  let ready = false
  for (let i = sections.length - 1; i >= 0; i--) {
    const e = document.getElementById(sections[i].id)
    if (!e?.offsetTop) continue
    ready = true
    if (e.offsetTop - 40 < currentOffset) {
      index = i
      break
    }
  }

  if (ready && currentOffset + scrollEl.clientHeight >= scrollEl.scrollHeight - 1) {
    index = sections.length - 1
  }
  activeIndex.value = index
}

</script>

<style lang="css" scoped>
</style>
