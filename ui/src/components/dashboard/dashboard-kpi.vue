<template>
  <!-- .attr: v-card has its own title prop, which would render a card title instead of the native tooltip -->
  <v-card
    :to="`/${kind}`"
    :title.attr="t(kind + '.seeAll')"
    class="h-100"
  >
    <v-card-text>
      <div class="d-flex align-center ga-3 mb-2">
        <v-icon
          :icon="kind === 'datasets' ? mdiDatabase : mdiImageMultiple"
          color="primary"
        />
        <span class="text-medium-emphasis font-weight-bold">{{ t(kind + '.title') }}</span>
      </div>
      <div class="d-flex align-baseline flex-wrap ga-2">
        <span class="dashboard-kpi-value">{{ latestFetch.data.value?.count.toLocaleString(locale) ?? '-' }}</span>
        <span
          v-if="created"
          class="text-body-small font-weight-bold text-success"
        >{{ t('created', { n: created }) }}</span>
      </div>
      <template v-if="limit">
        <v-progress-linear
          :model-value="percent"
          :color="percent >= 80 ? 'warning' : 'primary'"
          height="8"
          rounded
          class="mt-4"
        />
        <div class="text-body-small text-medium-emphasis mt-2">
          {{ t($uiConfig.subscriptionUrl ? 'limitSubscription' : 'limit', { consumption: limit.consumption.toLocaleString(locale), limit: limit.limit.toLocaleString(locale) }) }}
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  datasets:
    title: Jeux de données
    seeAll: Voir tous les jeux de données
  applications:
    title: Applications
    seeAll: Voir toutes les applications
  created: +{n} ces 30 derniers jours
  limit: '{consumption} sur les {limit} autorisés'
  limitSubscription: '{consumption} sur les {limit} autorisés par votre abonnement'
en:
  datasets:
    title: Datasets
    seeAll: See all the datasets
  applications:
    title: Applications
    seeAll: See all the applications
  created: +{n} over the last 30 days
  limit: '{consumption} of the {limit} allowed'
  limitSubscription: '{consumption} of the {limit} allowed by your subscription'
</i18n>

<script setup lang="ts">
import { mdiDatabase, mdiImageMultiple } from '@mdi/js'

const { kind, limits } = defineProps<{
  kind: 'datasets' | 'applications'
  limits?: Record<string, { consumption: number, limit: number }>
}>()

const { t, locale } = useI18n()

// ponytail: the creations are counted among the 51 latest, more than 50 shows "50+"; add a createdAt range filter to the lists if the cap matters
// raw: only createdAt in each result, no owner, links nor permissions computed per result
const latestFetch = useFetch<{ count: number, results: { createdAt: string }[] }>(`${$apiPath}/${kind}`, {
  query: { size: 51, select: 'createdAt', sort: 'createdAt:-1', shared: false, raw: true }
})
const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
const created = computed(() => {
  const res = latestFetch.data.value
  if (!res) return
  const n = res.results.filter(r => r.createdAt >= monthAgo).length
  return n > 50 ? '50+' : n
})

// -1 is unlimited; the quota counts every resource of the account, fragments included, so it states its own numbers
const limit = computed(() => {
  const l = limits?.[kind === 'datasets' ? 'nb_datasets' : 'nb_applications']
  return l && l.limit > 0 ? l : undefined
})
const percent = computed(() => limit.value ? Math.min(100, Math.round(100 * limit.value.consumption / limit.value.limit)) : 0)
</script>

<style>
.dashboard-kpi-value { font-size: 2rem; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
</style>
