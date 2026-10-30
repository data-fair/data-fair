<template>
  <v-card
    border="secondary md opacity-100"
    flat
  >
    <v-card-text>
      <!-- same header as the key figures, the text runs under the icon -->
      <div class="d-flex align-center ga-3 mb-2">
        <v-icon
          :icon="mdiRobotOutline"
          color="secondary"
        />
        <span class="text-medium-emphasis font-weight-bold">{{ t('title') }}</span>
      </div>
      <div class="text-body-medium mb-3">
        {{ canContribDep ? t('diagnoseText') : t('askText') }}
      </div>
      <df-agent-chat-action
        :action-id="canContribDep ? 'dashboard-diagnose' : 'dashboard-ask'"
        :visible-prompt="canContribDep ? t('diagnosePrompt') : t('askPrompt')"
        :hidden-context="canContribDep ? diagnoseContext : askContext"
        :title="canContribDep ? t('diagnoseBtn') : t('askBtn')"
        :btn-props="btnProps"
      />
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  title: Besoin d'aide ?
  diagnoseText: L'assistant peut passer en revue vos jeux de données en erreur et vous expliquer comment les corriger.
  askText: L'assistant peut vous aider à trouver un jeu de données ou à comprendre son contenu.
  diagnoseBtn: Lancer le diagnostic
  askBtn: Poser une question
  diagnosePrompt: Passe en revue mes jeux de données en erreur et explique-moi comment les corriger.
  askPrompt: Aide-moi à trouver un jeu de données.
en:
  title: Need help?
  diagnoseText: The assistant can review your datasets in error and explain how to fix them.
  askText: The assistant can help you find a dataset or understand its content.
  diagnoseBtn: Run the diagnosis
  askBtn: Ask a question
  diagnosePrompt: Review my datasets in error and explain how to fix them.
  askPrompt: Help me find a dataset.
</i18n>

<script setup lang="ts">
import { mdiRobotOutline, mdiCreation } from '@mdi/js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { usePermissions } from '~/composables/use-permissions'

const { t } = useI18n()
const { canContribDep } = usePermissions()

// the action is an icon button by default, its props type hides icon and size: override them to show the label
const btnProps = computed((): {} => ({ text: canContribDep.value ? t('diagnoseBtn') : t('askBtn'), prependIcon: mdiCreation, icon: false, size: 'default', density: 'default' }))

const diagnoseContext = 'The person opened the assistant from the dashboard of the back-office. List the datasets of the active account that are in error (status=error), read the error of each one and explain in plain words how to fix it, starting with the most recent. If none is in error, say so in one sentence.'
const askContext = 'The person opened the assistant from the dashboard of the back-office, with a read-only role. Ask what they are looking for, then search the datasets they can read and explain what the relevant ones contain.'
</script>
