<template>
  <!-- publication sites, then the pending publication requests: same favicons and hover list, only the line text differs -->
  <template
    v-for="group of groups"
    :key="group.key"
  >
    <card-meta-line
      v-if="group.sites.length"
      :color="group.color"
    >
      <template #prepend>
        <!-- 1px side margin: a 16px favicon centred in the 18px column of the line icons -->
        <span
          class="d-inline-flex flex-shrink-0"
          style="gap: 3px; margin: 0 1px"
        >
          <template
            v-for="s of group.sites.slice(0, 3)"
            :key="s.url"
          >
            <img
              v-if="!failed[s.url]"
              v-bind="favicon(s.url)"
            >
            <v-icon
              v-else
              v-bind="globe"
            />
          </template>
        </span>
      </template>
      {{ group.text }}
      <template #help>
        <div class="font-weight-bold mb-1">
          {{ group.title }}
        </div>
        <div
          v-for="s of group.sites"
          :key="s.url"
          class="d-flex align-start ga-2 mt-1"
        >
          <img
            v-if="!failed[s.url]"
            v-bind="favicon(s.url)"
            style="margin-top: 2px"
          >
          <v-icon
            v-else
            v-bind="globe"
            style="margin-top: 2px"
          />
          <span>{{ siteName(s) }} <span>· {{ host(s.url) }}</span></span>
        </div>
      </template>
    </card-meta-line>
  </template>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { mdiWeb } from '@mdi/js'
import cardMetaLine from './card-meta-line.vue'

type Site = { title?: string, url: string }
const props = withDefaults(defineProps<{ sites?: Site[], requested?: Site[] }>(), { sites: () => [], requested: () => [] })
const { t } = useI18n()

const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
const siteName = (site: Site) => site.title || host(site.url)

const groups = computed(() => [
  {
    key: 'published',
    sites: props.sites,
    title: t('publishedOn'),
    text: props.sites.length ? siteName(props.sites[0]) + (props.sites.length > 1 ? ` +${props.sites.length - 1}` : '') : ''
  },
  { key: 'requested', sites: props.requested, title: t('requested'), text: t('requested'), color: 'warning' }
])

// the site's own favicon at 16px, a globe when it has none
const failed = reactive<Record<string, boolean>>({})
const favicon = (url: string) => ({
  src: `${url.replace(/\/$/, '')}/favicon.ico`,
  alt: '',
  width: 16,
  height: 16,
  class: 'flex-shrink-0',
  style: 'object-fit: contain',
  onError: () => { failed[url] = true }
})
const globe = { icon: mdiWeb, size: 16 }
</script>

<i18n lang="yaml">
fr:
  publishedOn: Publié sur
  requested: Publication demandée
en:
  publishedOn: Published on
  requested: Publication requested
</i18n>
