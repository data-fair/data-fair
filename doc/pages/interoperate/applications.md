---
title: Applications de visualisation
section: 2
updated: 2020-12-10
description: Applications de visualisation de données
published: true
---

N'importe qui peut développer une nouvelle application de visualisation de données compatible avec Data Fair. Ces applications sont mises à disposition sous forme de services : ce sont des applications Web disponibles en ligne. Une instance de Data Fair fait office de proxy vers les applications configurées et les réexpose en leur communiquant les informations de contexte dont elles ont besoin. Pour pouvoir être intégrée dans une instance Data Fair, une application doit exposer certaines informations.

### Exemples

  - Un plugin pour [vue-cli](https://cli.vuejs.org/) qui permet de générer une application : [vue-cli-plugin-app](https://github.com/data-fair/vue-cli-plugin-app)
  - Une application statique minimaliste en HTML/JS/CSS pur avec juste un petit peu de jQuery : [app-minimal](https://github.com/data-fair/app-minimal)
  - Une application complète développée avec des frameworks modernes : [app-charts](https://github.com/data-fair/app-charts)

### Métadonnées essentielles

Une application expose un fichier HTML, typiquement un fichier `ìndex.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balises de la section HEAD :
 * **title** : Le titre de l'application, dans une balise title.
 * **description** : La description de l'application, dans une balise meta.

### Gestion des configurations

Une application doit donner à Data Fair le moyen de créer et éditer des configurations cohérentes avec ses besoins. Les configurations sont décrites à l'aide de JSON schéma, en servant à la racine de l'application un fichier `config-schema.json`. Ce fichier peut avoir des annotations particulières qui permettent d'avoir du contrôle sur le formulaire de configuration qui sera généré.

Ce formulaire est généré à l'aide de la librairie [vuetify-jsonschema-form](https://github.com/koumoul-dev/vuetify-jsonschema-form/) (v-jsf), la documentation des différente annotations JSON schéma utilisée est [disponible ici](https://koumoul-dev.github.io/vuetify-jsonschema-form/latest/).

### Informations de contexte

#### Côté client

Par simplicité nous privilégions des applications statiques déployables sur un simple serveur Web comme nos applications exemples. Pour ces applications nous avons prévu un mécanisme simple de transmission des informations contextuelles.

Le proxy Data Fair cherche dans le contenu HTML qui transite la chaîne de caractère %APPLICATION% et la remplace par la configuration d'application complète au format JSON. Le code Javascript peut donc récupérer cet objet et l'utiliser pour effectuer un rendu adapté et consommer l'API de Data FAIR en conséquence. L'objet JSON transmis contient les champs suivants :

 * **title**: Titre de la visualisation configurée
 * **url**: URL ou est exposée l'application utilisée pour la configuration
 * **id**: Identifiant de la visualisation
 * **status**: Etat de la configuration (brouillon, publié, ...)
 * **configuration**: La structure de cet objet dépend du schéma de configuration de l'application utilisée
 * **href**: Point d'accès de l'API Data Fair permettant de lire / modifier la configuration d'application
 * **page**: Page qui présente la visualisation
 * **exposedUrl**: URL d'exposition de la visualisation, peut être utilisée dans une iFrame ou en accès direct
 * **apiUrl**: URL de l'API Data Fair
 * **captureUrl**: URL vers le service de capture, permet de réaliser des exports image ou impressions PDF
 * **wsUrl**: URL de la web socket Data Fair, utile pour les applications qui manipulent des données mise a jour en temps réel

#### Côté serveur

Il est aussi possible de développer une application avec rendu côté serveur. Dans ce cas le mode de transmission des informations contextuelles est différent.

Ces informations sont transmises à l'aide de headers HTTP que le serveur de l'application interprète. Les headers suivant sont transmis par le service :
 * **X-Exposed-Url** : URL d'exposition de la visualisation, peut être utilisée dans une iFrame ou en accès direct
 * **X-Application-Url** : URL à utiliser pour connaître le propriétaire de l'application, les droits de l'utilisateur courant (pour par exemple masquer / afficher un bouton de configuration).
 * **X-API-Url** : URL de l'API de c, ce qui permet ensuite d'accéder aux services distants et aux datasets
 * **X-Directory-Url**: URL vers le service de gestion des utilisateurs.


### Outils de développement

#### Serveur de développement Data Fair

Le projet [df-dev-server](https://github.com/data-fair/dev-server) permet de simplifier le développement des applications Data Fair.

 * Il est plus léger que Data Fair car il n'a pas besoin des différents services en local (bases de données, gestion utilisateurs, ...)
 * Il permet d'avoir déjà des données de disponible en se connectant à des sources distantes
 * Il est plus facile a faire fonctionner sous Windows, car ne nécessite pas Docker
 * Il nécessite par contre une connexion internet pour pouvoir accéder aux données
