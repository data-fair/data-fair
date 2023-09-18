---
title: Applications de visualisation
section: 2
updated: 2020-12-10
description: Applications de visualisation de données
published: true
---

N'importe qui peut développer une nouvelle application de visualisation de données compatible avec Data&nbsp;Fair. Ces applications sont mises à disposition sous forme de services&nbsp;: ce sont des applications web disponibles en ligne. Une instance de Data&nbsp;Fair fait office de proxy vers les applications configurées et les réexpose en leur communiquant les informations de contexte dont elles ont besoin. Pour pouvoir être intégrée dans une instance Data&nbsp;Fair, une application doit exposer certaines informations.

## Exemples

  - Un plugin pour [vue-cli](https://cli.vuejs.org/) qui permet de générer une application&nbsp;: [vue-cli-plugin-app](https://github.com/data-fair/vue-cli-plugin-app)&nbsp;;
  - Une application statique minimaliste en HTML/JS/CSS pur avec juste un petit peu de jQuery&nbsp;: [app-minimal](https://github.com/data-fair/app-minimal)&nbsp;;
  - Une application complète développée avec des frameworks modernes&nbsp;: [app-charts](https://github.com/data-fair/app-charts).

## Métadonnées essentielles

Une application expose un fichier HTML, typiquement un fichier `index.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balises de la section HEAD&nbsp;:
 * **title**&nbsp;: titre de l'application, dans une balise *title*&nbsp;;
 * **description**&nbsp;: description de l'application, dans une balise *meta*.

## Gestion des configurations

Une application doit donner à Data&nbsp;Fair le moyen de créer et éditer des configurations cohérentes avec ses besoins. Les configurations sont décrites à l'aide de JSON schéma, en servant à la racine de l'application un fichier `config-schema.json`. Ce fichier peut avoir des annotations particulières permettant d'avoir du contrôle sur le formulaire de configuration qui sera généré.

Ce formulaire est généré à l'aide de la librairie [vuetify-jsonschema-form](https://github.com/koumoul-dev/vuetify-jsonschema-form/) (VJSF), la documentation des différentes annotations JSON schéma utilisées est [disponible ici](https://koumoul-dev.github.io/vuetify-jsonschema-form/latest/).

## Informations de contexte

### Côté client

Par simplicité, nous privilégions des applications statiques déployables sur un simple serveur web, comme nos applications exemples. Pour ces applications, nous avons prévu un mécanisme simple de transmission des informations contextuelles.

Le proxy Data&nbsp;Fair cherche, dans le contenu HTML qui transite, la chaîne de caractère %APPLICATION% et la remplace par la configuration d'application complète au format JSON. Le code JavaScript peut donc récupérer cet objet et l'utiliser pour effectuer un rendu adapté et consommer l'API de Data&nbsp;Fair en conséquence. L'objet JSON transmis contient les champs suivants&nbsp;:

 * **title**&nbsp;: titre de la visualisation configurée&nbsp;;
 * **url**&nbsp;: URL où est exposée l'application utilisée pour la configuration&nbsp;;
 * **id**&nbsp;: identifiant de la visualisation&nbsp;;
 * **status**&nbsp;: état de la configuration (brouillon, publié...)&nbsp;;
 * **configuration**&nbsp;: la structure de cet objet dépend du schéma de configuration de l'application utilisée&nbsp;;
 * **href**&nbsp;: point d'accès de l'API Data&nbsp;Fair permettant de lire / modifier la configuration d'application&nbsp;;
 * **page**&nbsp;: page qui présente la visualisation&nbsp;;
 * **exposedUrl**&nbsp;: URL d'exposition de la visualisation, peut être utilisée dans une iframe ou en accès direct&nbsp;;
 * **apiUrl**&nbsp;: URL de l'API Data&nbsp;Fair&nbsp;;
 * **captureUrl**&nbsp;: URL vers le service de capture, permet de réaliser des exports image ou impressions PDF&nbsp;;
 * **wsUrl**&nbsp;: URL de la *web socket* Data&nbsp;Fair, utile pour les applications qui manipulent des données mises à jour en temps réel.

### Côté serveur

Il est aussi possible de développer une application avec rendu côté serveur. Dans ce cas, le mode de transmission des informations contextuelles est différent.

Ces informations sont transmises à l'aide de headers HTTP que le serveur de l'application interprète. Les headers suivants sont transmis par le service&nbsp;:
 * **X-Exposed-Url**&nbsp;: URL d'exposition de la visualisation, peut être utilisée dans une iframe ou en accès direct&nbsp;;
 * **X-Application-Url**&nbsp;: URL à utiliser pour connaître le propriétaire de l'application, les droits de l'utilisateur courant (pour par exemple masquer / afficher un bouton de configuration)&nbsp;;
 * **X-API-Url**&nbsp;: URL de l'API de Data&nbsp;Fair, ce qui permet ensuite d'accéder aux services distants et aux datasets&nbsp;;
 * **X-Directory-Url**&nbsp;: URL vers le service de gestion des utilisateurs.


## Outils de développement

### Serveur de développement Data&nbsp;Fair

Le projet [df-dev-server](https://github.com/data-fair/dev-server) permet de simplifier le développement des applications Data&nbsp;Fair.

 * Il est plus léger que Data&nbsp;Fair, car il n'a pas besoin des différents services en local (bases de données, gestion utilisateurs...)&nbsp;;
 * Il permet d'avoir déjà des données disponibles en se connectant à des sources distantes&nbsp;;
 * Il est plus facile a faire fonctionner sous Windows, car ne nécessite pas Docker&nbsp;;
 * Il nécessite par contre une connexion internet pour pouvoir accéder aux données.
