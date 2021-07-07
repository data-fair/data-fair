<template>
  <v-container>
    <v-row align="center" class="pt-6 pb-3">
      <v-col
        class="text-center"
        cols="12"
      >
        <h2 class="text-h3 font-weight-bold grey--text text--darken-3 mb-4">
          Data Fair
        </h2>
        <p class="text-h5 font-weight-regular grey--text text--darken-1 font-italic">
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
    <v-row justify="center" class="pb-3">
      <iframe
        :width="$vuetify.breakpoint.lgAndUp ? 800 : 560"
        :height="$vuetify.breakpoint.lgAndUp ? 450 : 315"
        sandbox="allow-same-origin allow-scripts allow-popups"
        src="https://videos.koumoul.com/videos/embed/88b39efd-2023-4f5e-84f4-748cb22c56f1?title=0&warningTitle=0&peertubeLink=0&autoplay=1"
        frameborder="0"
        allowfullscreen
      />
    </v-row>

    <v-row
      class="my-3 flex-row-reverse"
      align="center"
    >
      <v-col md="6" sm="12">
        <h3 class="text-h5 grey--text text--darken-3 mb-2">
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
        <h3 class="text-h5 grey--text text--darken-3 mb-2">
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
        <h3 class="text-h5 grey--text text--darken-3 mb-2">
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
        <h3 class="text-h5 grey--text text--darken-3 mb-2">
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

    <h3 class="text-h5 grey--text text--darken-3 mb-2 mt-6">
      Soutiens
    </h3>
    <v-row>
      <v-col
        v-for="sponsor in sponsors"
        :key="sponsor.name"
        cols="6"
        xl="4"
      >
        <v-card outlined :href="sponsor.link">
          <v-row class="ma-0 pt-2 px-3">
            <v-img
              color="blue"
              :src="sponsor.img"
              max-width="250"
              min-height="70"
              contain
            />
          </v-row>
          <v-card-text>
            <p class="text-caption">
              {{ sponsor.description }}
            </p>
            <p class="mb-0 text-body-2">
              {{ sponsor.thanks }}
            </p>
          </v-card-text>
        </v-card>
        <v-col />
      </v-col>
    </v-row>
  </v-container>
  <!-- </div> -->
</template>

<script>
  export default {
    data() {
      return {
        sponsors: [
          {
            name: 'Koumoul',
            description: 'Visualisez, exploitez et partagez vos données en quelques clics !',
            img: 'https://koumoul.com/static/logo-slogan.png',
            link: 'https://koumoul.com',
            thanks: 'Koumoul développe l\'écosystème Data Fair et l\'héberge comme service en ligne.',
          },
          {
            name: 'Dawizz',
            description: 'Outil de cartographie et de catalogage de vos données.',
            img: 'https://www.dawizz.fr/wp-content/uploads/2018/04/logo-Dawizz-all-about-your-data-home.png',
            link: 'https://dawizz.fr',
            thanks: 'Dawizz intègre Data Fair dans sa plateforme et soutient son développement.',
          },
        ],
      }
    },
  }
</script>

<style>
</style>
