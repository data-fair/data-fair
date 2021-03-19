<template>
  <v-container>
    <v-row align="center" class="py-6">
      <v-col
        class="text-center"
        cols="12"
      >
        <h2 class="display-2 font-weight-bold grey--text text--darken-3 mb-4">
          Data Fair
        </h2>
        <p class="headline font-weight-regular grey--text text--darken-1 font-italic">
          Visualisez, exploitez et partagez vos données en quelques clics !
        </p>
        <div>
          <v-btn
            href="https://github.com/sponsors/koumoul-dev"
            outlined
            rounded
            class="ml-2 pl-3"
            color="primary"
            style="text-transform: none;font-weight: bold;"
          >
            <v-icon color="pink">
              mdi-heart-outline
            </v-icon>&nbsp;&nbsp;Sponsor
          </v-btn>
          <v-btn
            href="https://github.com/koumoul-dev/data-fair"
            rounded
            class="ml-2 pl-2"
            color="primary"
            style="text-transform: none;font-weight: bold;"
          >
            <v-icon>
              mdi-github
            </v-icon>&nbsp;&nbsp;GitHub
          </v-btn>
          <v-btn
            href="https://twitter.com/data_fair"
            icon
            large
            class="ml-2"
            color="#1DA1F2"
          >
            <v-icon>
              mdi-twitter
            </v-icon>
          </v-btn>
        </div>
      </v-col>
    </v-row>

    <v-row
      class="my-3 flex-row-reverse"
      align="center"
    >
      <v-col md="6" sm="12">
        <h3 class="headline grey--text text--darken-3 mb-2">
          Gérez vos sources de données
        </h3>
        <p>Chargez directement vos fichiers avec l'interface. Une <strong>grande variété de formats</strong> est supportée (XLS,CSV,SHP,...)</p>
        <p>Configurez des collecteurs permettant les <strong>mises à jour automatiques</strong> des données et l'intégration des données issues l'IOT.</p>
        <p>Mettez en place, facilement et progressivement, une <strong>stratégie data-driven</strong> au sein de votre organisation.</p>
      </v-col>
      <v-col md="6" sm="12">
        <v-img
          :aspect-ratio="2"
          alt="Accès par API"
          src="./home/undraw_uploading_go67.svg"
          contain
        />
      </v-col>
    </v-row>

    <v-row class="my-3" align="center">
      <v-col md="6" sm="12">
        <h3 class="headline grey--text text--darken-3 mb-2">
          Enrichissez et structurez
        </h3>
        <p>Accédez aux données issues de l'opendata, enrichissez vos données pour leur donner encore plus de valeur et les rendre <strong>hautement réutilisables</strong>.</p>
        <p>Les données sont <strong>normalisées, accessibles par API</strong>, sous forme structurée ou de fonds de cartes vectoriels.</p>
      </v-col>
      <v-col md="6" sm="12">
        <v-img
          :aspect-ratio="2"
          alt="Accès par API"
          src="./home/data_process.svg"
          contain
        />
      </v-col>
    </v-row>

    <v-row
      class="my-3 flex-row-reverse"
      align="center"
    >
      <v-col md="6" sm="12">
        <h3 class="headline grey--text text--darken-3 mb-2">
          Visualisez dynamiquement
        </h3>
        <p>Configurez des visualisations de données interactives en quelques clics, <strong>sans avoir besoin de programmer</strong>.</p>
        <p>Vous pouvez <strong>explorer des données volumineuses</strong> en temps réel, avec des cartes, des graphiques, ou des visualisations textuelles.</p>
        <p>Nous réalisons au besoin des <strong>visualisations personnalisées</strong> pour correspondre au mieux à votre métier</p>
      </v-col>
      <v-col md="6" sm="12">
        <v-img
          :aspect-ratio="2"
          alt="Accès par API"
          src="./home/data_processing_.svg"
          contain
        />
      </v-col>
    </v-row>

    <v-row class="my-3" align="center">
      <v-col md="6" sm="12">
        <h3 class="headline grey--text text--darken-3 mb-2">
          Partagez en interne / opendata
        </h3>
        <p><strong>Contrôlez finement les accès</strong> aux données et aux visualisations pour les partager en interne ou les ouvrir vers l'extérieur.</p>
        <p>Vos données sont téléchargeables dans plusieurs formats et vous pouvez les présenter dans un <strong>portail de données personnalisable</strong>.</p>
        <p><strong>Intégrez</strong> vos visualisations dans votre site web.</p>
      </v-col>
      <v-col md="6" sm="12">
        <v-img
          :aspect-ratio="2"
          alt="Accès par API"
          src="./home/undraw_mobile_testing_reah.svg"
          contain
        />
      </v-col>
    </v-row>
  </v-container>
  <!-- </div> -->
</template>

<script>
  export default { }
</script>

<style>
</style>
