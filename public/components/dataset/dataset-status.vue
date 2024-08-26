<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <v-row class="mx-0">
      <v-col class="pa-0">
        <template v-if="journal && !dataset.draftReason">
          <v-list-item
            v-if="lastProdEvent"
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
      v-if="journal && dataset.status==='error'"
      class="mx-0 px-2"
    >
      <v-alert
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
    </v-row>
    <v-row
      v-if="dataset.draftReason"
    >
      <v-col>
        <v-alert
          :type="draftError ? 'warning' : 'info'"
          style="width: 100%"
          outlined
        >
          <v-row align="center">
            <v-col
              v-if="dataset.draftReason.key === 'file-new'"
              class="grow"
            >
              <p v-t="'draftNew1'" />
              <p
                v-t="'draftNew2'"
                class="mb-0"
              />
            </v-col>
            <v-col
              v-else-if="dataset.draftReason.key === 'file-updated'"
              class="grow"
            >
              <p
                v-t="'draftUpdated1'"
                class="mb-0"
              />
              <template v-if="dataset.status === 'finalized'">
                <p
                  v-if="draftError"
                  class="mt-4 mb-0 font-weight-bold"
                  v-html="draftError.data"
                />
                <p
                  class="mt-4 mb-0"
                >
                  <span v-t="'draftUpdated2'" />
                  <span
                    v-if="can('validateDraft')"
                    v-t="'draftUpdatedCan'"
                  />
                  <span
                    v-else
                    v-t="'draftUpdatedCannot'"
                  />
                </p>
              </template>
            </v-col>
            <v-col
              v-else
              class="grow"
            >
              {{ dataset.draftReason.message }}
            </v-col>
            <v-col class="shrink text-center">
              <v-btn
                v-if="dataset.draftReason.key !== 'file-new' && (dataset.status === 'error' || dataset.status === 'finalized')"
                v-t="'cancelDraft'"
                :disabled="!can('cancelDraft')"
                :color="draftError ? 'default' : 'warning'"
                class="ma-1"
                elevation="0"
                @click="cancelDraft"
              />
              <v-btn
                v-if="dataset.status === 'finalized'"
                v-t="'validateDraft'"
                :disabled="!can('validateDraft')"
                :color="draftError ? 'warning' : 'primary'"
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
  draftNew2: Vérifiez que le fichier a bien été lu, parcourez les 100 premières lignes de la donnée, ajoutez des concepts au schéma, configurez des extensions, etc. Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftUpdated1: Le jeu de données est passé en mode brouillon suite au chargement d'un nouveau fichier.
  draftUpdated2: Vérifiez que le fichier a bien été lu et que le schéma est correct, parcourez les 100 premières lignes de la donnée, etc.
  draftUpdatedCan: Quand vous êtes satisfait, validez le brouillon et le jeu de données sera traité intégralement.
  draftUpdatedCannot: Vous n'avez pas la permission pour publier ce brouillon, peut-être devriez-vous contacter un administrateur ?
  cancelDraft: Annuler le brouillon
  validateDraft: Valider le brouillon
en:
  draftNew1: The dataset was created in draft mode. This state allow you to work on its configuration.
  draftNew2: Check that the file was property read, browse the first 100 lines, add concepts to the schema, configure extensions, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
  draftUpdated1: The dataset was switched to draft mode following the upload of a new file.
  draftUpdated2: Check that the file was property read, browse the first 100 lines, etc. When satisfied, walidate the draft and the dataset will be processed entirely.
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
      if (this.dataset.status !== 'finalized') return null
      for (const event of this.journal) {
        if (!event.draft) break
        if (event.type === 'error') return event
      }
      return null
    }
  },
  methods: {
    ...mapActions('dataset', ['patch', 'validateDraft', 'cancelDraft'])
  }
}
</script>

<style lang="css">
</style>
