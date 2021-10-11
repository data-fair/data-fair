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
        <div class="mb-4">
          <client-only>
            <v-btn
              v-for="locale of $i18n.locales"
              :key="locale"
              text
              fab
              small
              :to="switchLocalePath(locale)"
              v-text="locale"
            />
          </client-only>
        </div>
        <p v-t="'subtitle'" class="text-h5 font-weight-regular grey--text text--darken-1 font-italic" />
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
            href="https://github.com/data-fair/data-fair"
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
      <client-only>
        <iframe
          :width="$vuetify.breakpoint.lgAndUp ? 800 : 560"
          :height="$vuetify.breakpoint.lgAndUp ? 450 : 315"
          sandbox="allow-same-origin allow-scripts allow-popups"
          src="https://videos.koumoul.com/videos/embed/88b39efd-2023-4f5e-84f4-748cb22c56f1?title=0&warningTitle=0&peertubeLink=0&autoplay=1&loop=1"
          frameborder="0"
          allowfullscreen
        />
      </client-only>
    </v-row>
    <v-row
      class="my-3 flex-row-reverse"
      align="center"
    >
      <v-col
        md="6"
        sm="12"
        v-html="$t('sectionDatasets')"
      />
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
      <v-col
        md="6"
        sm="12"
        v-html="$t('sectionExtend')"
      />
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
      <v-col
        md="6"
        sm="12"
        v-html="$t('sectionVisualize')"
      />
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
      <v-col
        md="6"
        sm="12"
        v-html="$t('sectionShare')"
      />
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
              {{ sponsor.description[$i18n.locale] }}
            </p>
            <p class="mb-0 text-body-2">
              {{ sponsor.thanks[$i18n.locale] }}
            </p>
          </v-card-text>
        </v-card>
        <v-col />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  subtitle: Visualisez, exploitez et partagez vos données en quelques clics !
  sectionDatasets: |
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Gérez vos sources de données
    </h3>
    <p>Chargez directement vos fichiers avec l'interface. Une <strong>grande variété de formats</strong> est supportée (XLS,CSV,SHP,...)</p>
    <p>Configurez des collecteurs permettant les <strong>mises à jour automatiques</strong> des données et l'intégration des données issues l'IOT.</p>
    <p>Mettez en place, facilement et progressivement, une <strong>stratégie data-driven</strong> au sein de votre organisation.</p>
  sectionExtend:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Enrichissez et structurez
    </h3>
    <p>Accédez aux données issues de l'opendata, enrichissez vos données pour leur donner encore plus de valeur et les rendre <strong>hautement réutilisables</strong>.</p>
    <p>Les données sont <strong>normalisées, accessibles par API</strong>, sous forme structurée ou de fonds de cartes vectoriels.</p>
  sectionVisualize:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Visualisez dynamiquement
    </h3>
    <p>Configurez des visualisations de données interactives en quelques clics, <strong>sans avoir besoin de programmer</strong>.</p>
    <p>Vous pouvez <strong>explorer des données volumineuses</strong> en temps réel, avec des cartes, des graphiques, ou des visualisations textuelles.</p>
    <p><a href="https://koumoul.com">Koumoul</a> réalise au besoin des <strong>visualisations personnalisées</strong> pour correspondre au mieux à votre métier</p>
  sectionShare:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Partagez en interne / opendata
    </h3>
    <p><strong>Contrôlez finement les accès</strong> aux données et aux visualisations pour les partager en interne ou les ouvrir vers l'extérieur.</p>
    <p>Vos données sont téléchargeables dans plusieurs formats et vous pouvez les présenter dans un <strong>portail de données personnalisable</strong>.</p>
    <p><strong>Intégrez</strong> vos visualisations dans votre site web.</p>
en:
  subtitle: Visualize, explore and share your data in a few clicks !
  sectionDatasets: |
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Manage your datasets
    </h3>
    <p>Load your files directly in the user interface. A <strong>large variety of formats</strong> is supported (XLS,CSV,SHP,...)</p>
    <p>Configure data collection tools for <strong>automatic updates</strong> of data including from IOT sources.</p>
    <p>Move with ease toward a <strong>data-driven strategy</strong> in your organization.</p>
  sectionExtend:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Extend and structure
    </h3>
    <p>Use open-data sources, extend your data to increase its value and make it <strong>highly reusable</strong>.</p>
    <p>Your data is <strong>normaized and accessible through an API</strong>, as structured textual data or vectorial geographic maps.</p>
  sectionVisualize:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Visualize dynamically
    </h3>
    <p>Configure interactive data visualizations in a few click, <strong>without programming skills</strong>.</p>
    <p>You can <strong>explore large datasets</strong> in real time, using maps, charts, or textual representations.</p>
    <p><a href="https://koumoul.com">Koumoul</a> create on-demande <strong>custom visualizations</strong> to better match your needs</p>
  sectionShare:
    <h3 class="text-h5 grey--text text--darken-3 mb-2">
      Share privately or as open-data
    </h3>
    <p><strong>Control access</strong> to the data and the visualizations to share both inside your organization and with the larger public.</p>
    <p>Your data is downloadable in multiple formats and can be presented in <strong>customizable data portal</strong>.</p>
    <p><strong>Integrate</strong> your visualizations in your web sites.</p>
</i18n>

<script>
  export default {
    data() {
      return {
        sponsors: [
          {
            name: 'Koumoul',
            description: {
              fr: 'Visualisez, exploitez et partagez vos données en quelques clics !',
              en: 'Visualize, explore and share your data in a few clicks !',
            },
            img: 'https://koumoul.com/static/logo-slogan.png',
            link: 'https://koumoul.com',
            thanks: {
              fr: 'Koumoul développe l\'écosystème Data Fair et l\'héberge comme service en ligne.',
              en: 'Koumoul develops the Data Fair ecosystem and hosts it as an online service.',
            },
          },
          {
            name: 'Dawizz',
            description: {
              fr: 'Outil de cartographie et de catalogage de vos données.',
              en: 'A tool for mapping and cataloging your data.',
            },
            img: 'https://www.dawizz.fr/wp-content/uploads/2018/04/logo-Dawizz-all-about-your-data-home.png',
            link: 'https://dawizz.fr',
            thanks: {
              fr: 'Dawizz intègre Data Fair dans sa plateforme et soutient son développement.',
              en: 'Dawizz uses Data Fair inside its platform and supports its development',
            },
          },
        ],
      }
    },
  }
</script>

<style>
</style>
