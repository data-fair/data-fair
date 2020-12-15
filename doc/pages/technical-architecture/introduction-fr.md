---
title: Introduction
section: 1
updated: 2020-12-09
description : Introduction
published: true
---
Notre solution se compose de plusieurs modules open source et d’un abonnement à la plateforme Koumoul.

L’abonnement vous permet d’avoir accès au catalogue des applications, aux données de référence et aux fond de cartes mis à disposition par Koumoul.

Les modules open sources peuvent être remplacés par d’autres solutions open source. Par exemple, le Portail de données peut être remplacé par la solution uData utilisée sur https://www.data.gouv.fr/

Modules de notre solution :
* **DataFair**, le coeur de la solution, permet d’indexer, d’Apifier, d’enrichir et de partager facilement ses données.
* **Simple Directory** permet de se connecter au portail et gérer les comptes.
* Le **Portail de données** permet d’exposer les jeux de données et les visualisations
* Les **Connecteurs** permettent de communiquer avec des ressources externes
* Les **Traitements périodiques** permettent de mettre à jour les données et de récolter les données issues de l’IOT
* **Notify** permet de gérer les alertes et les notifications
* **Matomo** permet d’avoir les statistiques du portail
* **Capture** permet de créer les miniatures et les captures d’images des visualisations
* **Thumbor** permet les traitement des images des jeux de données
* **Backup** permet de gérer les sauvegardes de la plateforme

![Catalogue de données](./images/technical-architecture/architecture.jpg)


Cette page présente brièvement les langages de programmation, services et outils utilisés pour réaliser ce projet. Pour les développeurs vous pouvez consulter directement le [README et le code source sur github](https://github.com/koumoul-dev/data-fair).

## Backend

Le backend sert l'application cliente (frontend) et l'API. Le frontend est une application Web dynamique avec un rendu côté serveur partiel et un rendu final côté client en Javascript.

### Persistance

Ce service utilise 3 types de persistance : fichier, base de données et moteur de recherche.

La persistance fichier est utilisée pour stocker les jeux de données des utilisateurs : les fichiers sont stockés tels quels sur le système de fichier et sont ensuite analysés puis indexés.

Les informations sur les jeux de données, les services distants et les configurations d'applications sont stockées dans une base de données [MongoDB](https://www.mongodb.com/fr), qui est une base NoSQL open source orientée documents. Les jeux de données incrémentaux sont également stockés dans cette base.

Les datasets sont indexés dans un moteur de recherche open source [ElasticSearch](https://www.elastic.co/fr/products/elasticsearch). Très performant et puissant il permet de faire des recherches textuelles et des agrégations pour des temps de réponse irréprochables.

### Code source

Le code du backend est écrit en [NodeJS](https://nodejs.org/en/), en respectant la syntaxe ES7. Le code utilise donc massivement les promesses, cachées derrières des mots clés comme *async* ou *await*. Cela permet d'avoir du code clair, concis et facilement compréhensible, tout en étant très performant grâce à une gestion non bloquante des opérations asynchrones.

Un autre aspect de NodeJS est très utilisé dans ce projet : la gestion d'opérations en flux (streams). Cela permet de réaliser des traitements sur des volumes importants sans abuser des ressources de la machine. Ce service demande donc peu de mémoire vive pour fonctionner (mais il en faudra par contre une bonne quantité pour ElasticSearch).

Le serveur web et l'API sont écrits avec le framework [express 4](https://expressjs.com/fr/) qui est utilisé dans de nombreux projets Web NodeJS. Les briques fonctionnelles sont séparées dans des *router* Express, qui permettent par exemple de définir les opérations autour d'un certain concept.

### Authentification

Le mécanisme d'authentification utilisé pour sécuriser les APIs est le JWT (Json Web Token). La sécurité repose sur des mécanismes de cryptograhie asymétrique (RSA). La session utilisateur est maintenue coté client, ce qui permet d'avoir un backend sans état, et donc scalable. Le backend n'émet pas de JWT : il doit donc être relié à un annuaire [simple directory](https://koumoul-dev.github.io/simple-directory/) qui en émet. Le lien vers cet annuaire permet de télécharger sa clé publique pour ensuite vérifier que les JWT reçus soient valides.

## Front end

Le frontend est une application Web (HTML/CSS/JS).

Le framework Javascript utilisé est [VueJS 2](https://vuejs.org/) complété principalement par [Nuxt](https://nuxtjs.org/) et [Vuetify](https://vuetifyjs.com/en/). Le tout forme un environnement très complet pour développer des interfaces graphiques dynamiques et claires. La documentation sur cet écosystème est bien fournie et de qualité. Ce n'est pas pour rien que VueJS fait partie des projets Github les plus populaires.

## Déploiement

Le service est livré et déployé avec [Docker](https://www.docker.com/). L'artefact sortant du build de ce projet est une image docker. Sur [koumoul.com](https://koumoul.com/) nous déployons automatiquement chaque nouvelle version de l'image sur un environnement de recette et à chaque release nous déployons en production.

Les dépendances peuvent aussi être installées avec Docker, ce qui permet une prise en main de ce projet très rapide. Pour plus de détails consultez la [documentation d'installation](install/install).
