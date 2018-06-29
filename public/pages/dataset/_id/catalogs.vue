<template lang="html">
  <v-container>
    <p>
      Publiez ce jeu de données sur un ou plusieurs catalogues Open Data.
      Cette publication rendra vos données plus faciles à trouver et permettra à la communauté Open Data d'échanger avec vous.
    </p>
    <v-container fluid grid-list-lg>
      <v-layout row wrap>
        <v-flex xs12>
          <v-card>
            <v-card-title primary-title>
              <div class="headline">
                data.cannes.fr
              </div>
            </v-card-title>
            <v-card-text>
              <p>Sélectionnez une entrée du catalogue pour crééer une nouvelle ressource à l'intérieur de cette entrée (jeu de données millésimé par exemple). Laissez vide pour créer une nouvelle entrée.</p>
              <v-select
                label="Choisissez une entrée du catalogue"
                hint=""
              />
            </v-card-text>
            <v-card-actions>
              <v-spacer/>
              <v-btn color="primary">Publier</v-btn>
            </v-card-actions>
          </v-card>
        </v-flex>
        <v-flex xs12>
          <v-card>
            <v-card-title primary-title>
              <div class="headline">
                data.gouv.fr
              </div>
            </v-card-title>
            <v-card-text>
              Ce jeu de données est déjà publié sur ce catalogue.
            </v-card-text>
            <v-card-actions>
              <v-spacer/>
              <v-btn flat color="primary">Voir</v-btn>
            </v-card-actions>
          </v-card>
        </v-flex>
      </v-layout>
    </v-container>
  </v-container>
</template>

<script>

export default {
  components: {}
}

</script>

<style lang="css">
</style>
