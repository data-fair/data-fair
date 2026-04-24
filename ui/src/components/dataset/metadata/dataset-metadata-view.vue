<template>
  <template v-if="dataset">
    <v-btn
      v-if="can('writeDescription').value"
      color="primary"
      variant="flat"
      class="mb-4"
      :prepend-icon="mdiPencil"
      :to="`/dataset/${dataset.id}/edit-metadata`"
    >
      {{ t('editMetadata') }}
    </v-btn>
    <v-row>
      <!-- Left: summary + image + description -->
      <v-col
        cols="12"
        md="6"
      >
        <template v-if="dataset.summary">
          <h3 class="text-title-medium font-weight-bold mb-2">
            {{ t('summary') }}
          </h3>
          <p class="mb-4">
            {{ dataset.summary }}
          </p>
        </template>

        <template v-if="dataset.image">
          <h3 class="text-title-medium font-weight-bold mb-2">
            {{ t('thumbnail') }}
          </h3>
          <v-img
            :src="dataset.image"
            max-height="250"
            cover
            class="mb-4"
          />
        </template>

        <template v-if="dataset.description">
          <h3 class="text-title-medium font-weight-bold mb-2">
            {{ t('description') }}
          </h3>
          <div
            class="text-break"
            v-html="/*eslint-disable-line vue/no-v-html*/dataset.description"
          />
        </template>
      </v-col>

      <!-- Right: metadata card -->
      <v-col
        cols="12"
        md="6"
      >
        <v-card>
          <v-list density="compact">
            <v-list-item
              v-if="dataset.creator"
              :prepend-icon="mdiAccountHardHat"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('creator') }}
              </div>
              <div>{{ dataset.creator }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.license"
              :prepend-icon="mdiLicense"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('license') }}
              </div>
              <div>
                <a
                  v-if="dataset.license.href"
                  :href="dataset.license.href"
                  target="_blank"
                  rel="noopener"
                >{{ dataset.license.title || dataset.license.href }}</a>
                <span v-else>{{ dataset.license.title }}</span>
              </div>
            </v-list-item>

            <v-list-item
              v-if="dataset.origin"
              :prepend-icon="mdiLink"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('origin') }}
              </div>
              <div>{{ dataset.origin }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.temporal"
              :prepend-icon="mdiCalendarRange"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('temporal') }}
              </div>
              <div>{{ formatTemporal(dataset.temporal) }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.spatial"
              :prepend-icon="mdiMapMarker"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('spatial') }}
              </div>
              <div>{{ dataset.spatial }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.frequency"
              :prepend-icon="mdiUpdate"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('frequency') }}
              </div>
              <div>{{ t(`frequencyItems.${dataset.frequency}`) }}</div>
            </v-list-item>

            <template v-if="datasetsMetadata?.custom?.length">
              <v-list-item
                v-for="cm of datasetsMetadata.custom.filter((c: any) => dataset?.customMetadata?.[c.key])"
                :key="cm.key"
                :prepend-icon="mdiTag"
              >
                <div class="text-body-small text-medium-emphasis">
                  {{ cm.title }}
                </div>
                <div>{{ dataset?.customMetadata?.[cm.key] }}</div>
              </v-list-item>
            </template>
          </v-list>

          <template v-if="(dataset.keywords?.length) || (dataset.topics?.length)">
            <v-divider />
            <div class="d-flex flex-wrap ga-1 pa-3">
              <v-chip
                v-for="keyword in (dataset.keywords || [])"
                :key="keyword"
                size="small"
              >
                {{ keyword }}
              </v-chip>
              <v-chip
                v-for="topic in (dataset.topics || [])"
                :key="topic.id"
                size="small"
                color="primary"
                variant="outlined"
              >
                {{ topic.title }}
              </v-chip>
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>

<i18n lang="yaml">
fr:
  editMetadata: Éditer les métadonnées
  summary: Résumé
  thumbnail: Vignette
  description: Description
  creator: Personne ou organisme créateur
  license: Licence
  origin: Provenance
  temporal: Couverture temporelle
  spatial: Couverture spatiale
  frequency: Fréquence de mise à jour
  frequencyItems:
    triennial: Tous les 3 ans
    biennial: Tous les 2 ans
    annual: Tous les ans
    semiannual: 2 fois par an
    threeTimesAYear: 3 fois par an
    quarterly: Chaque trimestre
    bimonthly: Tous les 2 mois
    monthly: Tous les mois
    semimonthly: 2 fois par mois
    biweekly: Toutes les 2 semaines
    threeTimesAMonth: 3 fois par mois
    weekly: Chaque semaine
    semiweekly: 2 fois par semaine
    threeTimesAWeek: 3 fois par semaine
    daily: Tous les jours
    continuous: En continu
    irregular: Irrégulière
en:
  editMetadata: Edit metadata
  summary: Summary
  thumbnail: Thumbnail
  description: Description
  creator: Creator person or entity
  license: License
  origin: Origin
  temporal: Temporal coverage
  spatial: Spatial coverage
  frequency: Update frequency
  frequencyItems:
    triennial: Every 3 years
    biennial: Every 2 years
    annual: Every year
    semiannual: Twice a year
    threeTimesAYear: 3 times a year
    quarterly: Every quarter
    bimonthly: Every 2 months
    monthly: Every month
    semimonthly: Twice a month
    biweekly: Every 2 weeks
    threeTimesAMonth: 3 times a month
    weekly: Every week
    semiweekly: Twice a week
    threeTimesAWeek: 3 times a week
    daily: Every day
    continuous: Continuous
    irregular: Irregular
</i18n>

<script setup lang="ts">
import {
  mdiAccountHardHat,
  mdiCalendarRange,
  mdiLicense,
  mdiLink,
  mdiMapMarker,
  mdiPencil,
  mdiTag,
  mdiUpdate
} from '@mdi/js'
import useDatasetStore from '~/composables/dataset/dataset-store'
import { useDatasetsMetadata } from '~/composables/dataset/use-metadata'

const { dataset, can } = useDatasetStore()

const { t, locale } = useI18n()

const owner = computed(() => dataset.value?.owner)
const { datasetsMetadata } = useDatasetsMetadata(owner)

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const formatTemporal = (temporal: any) => {
  if (!temporal) return ''
  const parts = []
  if (temporal.start) parts.push(formatDate(temporal.start))
  if (temporal.end) parts.push(formatDate(temporal.end))
  return parts.join(' — ')
}
</script>
