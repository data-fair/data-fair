<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <v-row class="mx-0">
      <v-col class="pa-0">
        <template v-if="journal && !dataset.draftReason">
          <v-alert
            v-if="dataset.status === 'error'"
            type="error"
            style="width: 100%"
            outlined
          >
            <p
              class="mb-0"
              v-html="lastProdEvent.data"
            />
            <template #append>
              <v-btn
                icon
                title="Relancer"
                color="primary"
                @click="patch({})"
              >
                <v-icon>mdi-play</v-icon>
              </v-btn>
            </template>
          </v-alert>
          <v-list-item
            v-else-if="lastProdEvent"
            :class="`pa-2 event-${lastProdEvent.type}`"
          >
            <v-list-item-avatar
              v-if="['finalize-end', 'publication', 'error', 'draft-cancelled'].includes(lastProdEvent.type)"
              class="ml-0 my-0"
            >
              <v-icon :color="events[lastProdEvent.type].color || 'primary'">
                {{ events[lastProdEvent.type].icon }}
              </v-icon>
            </v-list-item-avatar>
            <v-list-item-avatar v-else>
              <v-progress-circular
                :size="20"
                :width="3"
                small
                indeterminate
                color="primary"
              />
            </v-list-item-avatar>
            <span :class="events[lastProdEvent.type].color ? `${events[lastProdEvent.type].color}--text` : ''">
              {{ events[lastProdEvent.type] && (events[lastProdEvent.type].text[$i18n.locale] || events[lastProdEvent.type].text[$i18n.defaultLocale]) }}
            </span>
          </v-list-item>
        </template>
      </v-col>
    </v-row>
    <v-row
      v-if="dataset.draftReason"
    >
      <v-col>
        <v-alert
          :type="(draftError || draftValidationError) ? 'warning' : 'info'"
          style="width: 100%"
          outlined
        >
          <v-row align="center">
            <v-col
              class="grow"
            >
              <p
                v-if="dataset.draftReason.key === 'file-new'"
                v-t="'draftNew1'"
              />

              <p
                v-else-if="dataset.draftReason.key === 'file-updated'"
                v-t="'draftUpdated1'"
                class="mb-0"
              />
              <p
                v-else
                class="mb-0"
              >
                {{ draftReason.message }}
              </p>

              <template v-if="dataset.status === 'finalized'">
                <p
                  v-if="draftError"
                  class="mt-4 mb-0 font-weight-bold"
                  v-html="draftError.data"
                />
                <p
                  v-if="draftValidationError"
                  class="mt-4 mb-0 font-weight-bold"
                  v-html="draftValidationError.data"
                />
                <p
                  class="mt-4 mb-0"
                >
                  <span
                    v-if="dataset.draftReason.key === 'file-new'"
                    v-t="'draftNew2'"
                  />
                  <span
                    v-if="dataset.draftReason.key === 'file-updated'"
                    v-t="'draftUpdated2'"
                  />
                  <span
                    v-if="can('validateDraft')"
                    v-t="'draftValidateCan'"
                  />
                  <span
                    v-else
                    v-t="'draftValidateCannot'"
                  />
                </p>
              </template>
            </v-col>
            <v-col class="shrink text-center">
              <v-btn
                v-if="dataset.draftReason.key !== 'file-new' && (dataset.status === 'error' || dataset.status === 'finalized')"
                v-t="'cancelDraft'"
                :disabled="!can('cancelDraft')"
                :color="(draftError || draftValidationError) ? 'default' : 'warning'"
                class="ma-1"
                elevation="0"
                @click="cancelDraft"
              />
              <v-btn
                v-if="dataset.status === 'finalized'"
                v-t="'validateDraft'"
                :disabled="!can('validateDraft')"
                :color="(draftError || draftValidationError) ? 'warning' : 'primary'"
                class="ma-1"
                @click="validateDraft"
              />
            </v-col>
            <v-col class="shrink" />
          </v-row>
        </v-alert>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  draftNew1: Le jeu de données a été créé en mode brouillon. Cet état vous permet de travailler son paramétrage.
  draftNew2: Vérifiez que le fichier a bien été lu, parcourez les 100 premières lignes de la donnée, ajoutez des concepts au schéma, configurez des extensions, etc..
  draftUpdated1: Le jeu de données est passé en mode brouillon suite au chargement d'un nouveau fichier.
  draftUpdated2: Vérifiez que le fichier a bien été lu et que le schéma est correct, parcourez les 100 premières lignes de la donnée, etc.
  draftValidateCan: Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftValidateCannot: Vous n'avez pas la permission pour publier ce brouillon, peut-être devriez-vous contacter un administrateur ?
  cancelDraft: Annuler le brouillon
  validateDraft: Valider le brouillon
en:
  draftNew1: The dataset was created in draft mode. This state allow you to work on its configuration.
  draftNew2: Check that the file was property read, browse the first 100 lines, add concepts to the schema, configure extensions, etc.
  draftUpdated1: The dataset was switched to draft mode following the upload of a new file.
  draftUpdated2: Check that the file was property read, browse the first 100 lines, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  draftValidationCan:  When satisfied, validate the draft and the dataset will be processed entirely.
  draftValidationCannot: You lack the permission to validate this draft, you should contact an admin.
  cancelDraft: Cancel the draft
  validateDraft: Validate the draft
</i18n>

<script>
const events = require('~/../shared/events.json').dataset
const { mapState, mapGetters, mapActions } = require('vuex')

export default {
  data () {
    return {
      events
    }
  },
  computed: {
    ...mapState('dataset', ['dataset', 'journal']),
    ...mapGetters('dataset', ['can']),
    lastProdEvent () {
      for (const event of this.journal) {
        if (!event.draft) return event
      }
      return null
    },
    draftError () {
      return this.getLastDraftEvent('error')
    },
    draftValidationError () {
      return this.getLastDraftEvent('validation-error')
    }
  },
  methods: {
    ...mapActions('dataset', ['patch', 'validateDraft', 'cancelDraft']),
    getLastDraftEvent (eventType) {
      if (this.dataset.status !== 'finalized') return null
      let inCurrentDraft = false
      for (const event of this.journal) {
        if (inCurrentDraft && !event.draft) break
        if (inCurrentDraft && event.type === 'finalize-end') break
        if (event.type === 'finalize-end') inCurrentDraft = true
        if (inCurrentDraft && event.type === eventType) return event
      }
      return null
    }
  }
}
</script>

<style lang="css">
</style>
