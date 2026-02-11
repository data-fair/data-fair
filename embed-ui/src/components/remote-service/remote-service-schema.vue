<template lang="html">
  <v-data-table
    :items="remoteService.actions"
    hide-default-header
    hide-default-footer
  >
    <template #item="{item}">
      <tr v-if="vocabulary">
        <td>
          <v-icon
            v-if="!item.inputCollection || !item.outputCollection"
            :title="$t('unitaryOp')"
          >
            mdi-description
          </v-icon>
          <v-icon
            v-if="item.inputCollection && item.outputCollection"
            :title="$t('bulkOp')"
          >
            mdi-view-list
          </v-icon>
        </td>
        <td>{{ item.summary }}</td>
        <td>
          <span v-if="!item.input || !Object.keys(item.input).length">{{ $t('noInput') }}</span>
          <template v-for="input in item.input">
            <v-chip
              v-if="input.concept && vocabulary[input.concept]"
              :key="input.concept"
              :title="vocabulary[input.concept].description"
              style="margin:4px 4px;"
            >
              {{ vocabulary[input.concept].title }}
            </v-chip>
          </template>
        </td>
        <td>
          <v-icon
            size="large"
            color="primary"
          >
            mdi-arrow-right
          </v-icon>
        </td>
        <td>
          <template v-for="output in item.output">
            <v-chip
              v-if="output.concept && vocabulary[output.concept]"
              :key="output.concept"
              :title="vocabulary[output.concept].description"
              style="margin:4px 4px;"
            >
              {{ vocabulary[output.concept].title }}
            </v-chip>
          </template>
          <v-chip
            v-if="nonSemOutputs(item.output)"
            style="margin:4px 4px;"
          >
            {{ t('withoutConcepts', nonSemOutputs(item.output) as number) }}
          </v-chip>
        </td>
      </tr>
    </template>
  </v-data-table>
</template>

<i18n lang="yaml">
fr:
  unitaryOp: Opération unitaire
  bulkOp: Opération de masse
  noInput: Pas de données en entrée
  withoutConcepts: "colonne sans concept | colonnes sans concept"
en:
  unitaryOp: Unitary operation
  bulkOp: Bulk operation
  noInput: No input data
  withoutConcepts: "column without concept | columns without concept"
</i18n>

<script lang="ts" setup>
import type { RemoteService } from '#api/types'

defineProps<{ remoteService: RemoteService }>()

const { t } = useI18n()
const { vocabulary } = useStore()

const nonSemOutputs = (output?: { name: string, concept?: string }[]) => {
  return output && output.filter(output => !(output.concept && vocabulary.value[output.concept]) && !output.name.startsWith('_')).length
}
</script>

<style lang="css">
</style>
