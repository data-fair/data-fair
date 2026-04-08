<!--- Keep it as backup (not used for the moment) -->
<!-- It's a version of <df-toc> that show also the tabs of sections-tabs -->
<template>
  <v-list
    v-if="sections && sections.length"
    density="compact"
    color="primary"
    class="py-0"
    bg-color="background"
  >
    <v-list-subheader>{{ t('content') }}</v-list-subheader>

    <template
      v-for="(section, i) in sections"
      :key="i"
    >
      <v-list-item
        :active="activeIndex === i"
        :min-height="32"
        @click="goTo('#' + section.id, { offset: -20, container: '.v-main__scroller' })"
      >
        <v-list-item-title class="text-body-2">
          {{ section.title }}
        </v-list-item-title>
      </v-list-item>

      <v-list-item
        v-for="tab in section.tabs"
        :key="tab.key"
        :min-height="28"
        class="ml-4"
        @click="onTabClick(section, tab.key)"
      >
        <template #prepend>
          <v-icon
            :icon="tab.icon"
            size="x-small"
            class="mr-n2"
          />
        </template>
        <v-list-item-title class="text-caption">
          {{ tab.title }}
        </v-list-item-title>
      </v-list-item>
    </template>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  content: CONTENU
en:
  content: CONTENT
</i18n>

<script lang="ts" setup>
import { type Ref, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoTo } from 'vuetify'

export interface TocTab {
  key: string
  title: string
  icon?: string
}

export interface TocSection {
  id: string
  title: string
  tabs?: TocTab[]
  tabModel?: Ref<string>
}

const { sections } = defineProps<{ sections: TocSection[] }>()

const goTo = useGoTo()
const { t } = useI18n({ useScope: 'local' })

const onTabClick = async (section: TocSection, tabKey: string) => {
  if (section.tabModel) {
    section.tabModel.value = tabKey
  }
  await nextTick()
  goTo('#' + section.id, { offset: -20, container: '.v-main__scroller' })
}

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
