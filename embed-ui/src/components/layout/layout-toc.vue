<template>
  <v-list
    v-if="sections && sections.length"
    v-scroll="onScroll"
    density="compact"
    color="primary"
    class="py-0"
  >
    <v-list-subheader>{{ t('content') }}</v-list-subheader>

    <v-list-item
      v-for="(section, i) in sections"
      :key="i"
      :active="activeIndex === i"
      @click="goTo('#' + section.id, { offset: -20 })"
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
const onScroll = () => {
  clearTimeout(timeout)
  timeout = setTimeout(findActiveIndex, 17)
}
onMounted(() => onScroll())

const activeIndex = ref<number | null>(null)
const findActiveIndex = () => {
  const currentOffset = (window.pageYOffset || document.documentElement.offsetTop || 0)
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

  if (ready && currentOffset + window.innerHeight === document.documentElement.offsetHeight) {
    index = sections.length - 1
  }
  activeIndex.value = index
}

</script>

<style lang="css" scoped>
</style>
