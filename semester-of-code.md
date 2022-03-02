# BlueHats Semester of Code - Data Fair

## Le projet

[Data Fair](https://data-fair.github.io/3/) est un projet open source permettant de construire une plateforme Web d'exploitation, de partage et de visualisation de données.

Un usage particulièrement intéressant est la construction de portails open data (voir [data.ademe.fr](data.ademe.fr) et [data.gouv.ci](data.gouv.ci) à titre d'exemples). Mais le projet peut aussi être utilisé en interne par toutes sortes d'organisations dont les administrations publiques françaises.

Le projet dans son ensemble est constitué du module principal sur ce [répertoire de code](https://github.com/data-fair/data-fair) et de nombreux autres éléments : des services Web complémentaires, des scripts de traitements de données, des applications de data-visualisation et des librairies en Javascript (dont [vjsf](https://github.com/koumoul-dev/vuetify-jsonschema-form)).

Quelques mots clés pour donner un aperçu du socle technique : OpenApi, Node.js, Elasticsearch, MongoDB, Vue.js, Nuxt, Vuetify, MapLibre GL, Docker.

## L'équipe

[Koumoul](koumoul.com) maintient le projet et vend un accès à une version hébergée. Nous sommes une petite société et la production de logiciel open source est au coeur de notre activité. Nous sommes situés à Vannes mais travaillons en grande partie en télétravail.

## Votre mission

La mission peut prendre plusieurs formes en fonction de vos préférences, des besoins des mainteneurs et des besoins remontés par les utilisateurs. Quelques possibilités parmi d'autres :

Une partie du socle technique de Data Fair connait une évolution importante : les projets [Vue.js](https://vuejs.org/), [NuxtJS](https://nuxtjs.org/) et [Vuetify](https://vuetifyjs.com/) sont arrivés récemment ou vont arriver prochainement en version 3. Nous souhaitons étudier le sujet de la transition vers ces nouvelles versions majeures, définir un plan d'action et le mettre en oeuvre.

Data Fair utilise les iframes pour proposer des visualisations de données fortement découplées avec les sites dans lesquelles elles sont intégrées. En complément de cette approche, qui n'est pas remise en question, nous souhaitons explorer la possibilité d'utiliser la spécification [Web Components](https://developer.mozilla.org/fr/docs/Web/Web_Components) pour proposer des composants graphiques réutilisables plus légers et plus souples.

Dans tous cas vous travaillerez sur des sujets techniques en étroite collaboration avec une petite équipe de mainteneurs constituée de développeurs full-stack.