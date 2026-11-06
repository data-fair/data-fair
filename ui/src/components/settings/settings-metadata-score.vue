<template>
  <div class="text-title-small mb-1">
    {{ t('scoreShare') }}
  </div>
  <div class="score-bar">
    <v-tooltip
      v-for="score in shares"
      :key="score.key"
      location="top"
      :text="`${score.title} : ${Math.round(score.share * 100)} %`"
    >
      <template #activator="{ props: tooltipProps }">
        <div
          v-bind="tooltipProps"
          class="score-segment"
          :style="{ flexGrow: score.share }"
        />
      </template>
    </v-tooltip>
  </div>
</template>

<i18n lang="yaml">
fr:
  scoreShare: Répartition du score
en:
  scoreShare: Score breakdown
</i18n>

<script setup lang="ts">
defineProps<{ shares: { key: string, title: string, share: number }[] }>()
const { t } = useI18n()
</script>

<style scoped>
.score-bar { display: flex; gap: 2px; height: 12px; border-radius: 999px; overflow: hidden; }
.score-segment { background: rgb(var(--v-theme-primary)); min-width: 3px; flex-basis: 0; }
</style>
