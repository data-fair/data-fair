<template>
  <div
    v-if="datasets.count"
    :style="`position:relative;width:100%;height:${height}px;`"
  >
    <template v-if="width">
      <div

        v-for="box in boxes || []"
        :key="box.data.id"
        :style="`padding:1.5px; position:absolute; top:${box.y0}px; left:${box.x0 * ratio}px; bottom:${height - box.y1}px; right:${width - (box.x1 * ratio)}px;`"
      >
        <v-card
          style="width:100%;height:100%;"
          :to="box.data.to"
          :color="box.data.color"
          dark
          flat
        >
          <v-card-title
            class="text-subtitle-1 py-0 px-2"
            :title="box.data.tooltip"
          >
            <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
              {{ box.data.tooltip }}
            </span>
          </v-card-title>
        </v-card>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>

import * as d3 from 'd3-hierarchy'
import type { Dataset } from '#api/types'
import { useCurrentElement } from '@vueuse/core'
import { useTheme } from 'vuetify'

const { datasets, stats, storageType } = defineProps<{
  datasets: { results: Dataset[], count: number },
  stats: any,
  storageType: string
}>()

const { locale } = useI18n()
const theme = useTheme()

const height = ref(300)
const boxes = ref<any[]>([])
const ratio = 1.62
const elt = useCurrentElement<HTMLElement>()
const width = computed(() => {
  console.log('elt', elt.value)
  return elt.value?.offsetWidth
})

const refresh = () => {
  const data = {
    children: datasets.results
      .filter(d => !!d.storage)
      .map(d => {
        const size = storageType === 'indexed' ? d.storage!.indexed!.size! : d.storage!.size!
        return {
          id: d.id,
          title: d.title || d.id,
          size,
          tooltip: `${d.title || d.id} - ${formatBytes(size, locale.value)} - ${{ public: 'Public', private: 'Privé', protected: 'Protégé' }[d.visibility!]}`,
          to: `/dataset/${d.id}`,
          color: visibilityColor(d.visibility!)
        }
      })
  }
  if (datasets.count > datasets.results.length) {
    const nbOthers = datasets.count - datasets.results.length
    const size = stats.limits[storageType === 'indexed' ? 'indexed_bytes' : 'store_bytes'].consumption - data.children.reduce((a, c) => a + c.size, 0)
    const title = nbOthers === 1 ? '1 autre jeu de donnée' : nbOthers.toLocaleString() + ' autres jeux de données'
    data.children.push({
      id: '_others',
      title,
      size,
      tooltip: `${title} - ${formatBytes(size, locale.value)}`,
      color: 'grey',
      to: ''
    })
  }
  // @ts-ignore
  const hierarchy = d3.hierarchy(data).sum(d => Math.sqrt(d.size))
  // @ts-ignore
  d3.treemap().size([width.value / ratio, height.value]).tile(d3.treemapSquarify.ratio(1))(hierarchy)

  boxes.value = hierarchy.leaves()
}

onMounted(() => {
  refresh()
  window.addEventListener('resize', () => refresh(), true)
})
watch(() => datasets, () => {
  refresh()
})

const visibilityColor = (visibility: string) => {
  return visibility === 'public' ? theme.current.value.colors.primary : theme.current.value.colors.accent
}
</script>

<style lang="css" scoped>
</style>
