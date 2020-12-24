---
title: Data Fair
section: 2
updated: 2020-12-09
description : Data Fair
published: true
---

Data Fair permet d'exposer facilement ses données via une API web, contractualisée et documentée, ce qui permet aux développeurs de les réutiliser facilement dans leurs **applications**. De plus les données peuvent être sémantisées, ce qui permet ensuite de les enrichir avec d'autres données sémantisées. Ainsi, des données qui ont une adresse peuvent par exemple être complétées par des coordonnées GPS, ce qui permet ensuite de les afficher sur une carte.

Le coeur de la solution permet
* d’indexer des données
* d’Apifier des données
* d’enrichir des données
* de partager des données
* de configurer les visualisations
* de gérer les droits d’accès aux données et aux visualisations (publication)


Cette page présente brièvement les langages de programmation, services et outils utilisés pour réaliser ce projet. Pour les développeurs vous pouvez consulter directement le [README et le code source sur github](https://github.com/koumoul-dev/data-fair).

## Backend

Le backend sert l'application cliente (frontend) et l'API. Le frontend est une application Web dynamique avec un rendu côté serveur partiel et un rendu final côté client en Javascript.


### Persistance

Ce service utilise 3 types de persistance : fichier, base de données et moteur de recherche.

La persistance fichier est utilisée pour stocker les jeux de données des utilisateurs : les fichiers sont stockés tels quels sur le système de fichier et sont ensuite analysés puis indexés.

Les informations sur les jeux de données, les services distants et les configurations d'applications sont stockées dans une base de données [MongoDB](https://www.mongodb.com/fr), qui est une base NoSQL open source orientée documents. Les jeux de données incrémentaux sont également stockés dans cette base.

Les datasets sont indexés dans un moteur de recherche open source [ElasticSearch](https://www.elastic.co/fr/products/elasticsearch). Très performant et puissant il permet de faire des recherches textuelles et des agrégations pour des temps de réponse irréprochables.

## Front end

L'interface du service est une applications Web (HTML/CSS/JS).

Le framework Javascript utilisé est [VueJS 2](https://vuejs.org/) complété principalement par [Nuxt](https://nuxtjs.org/) et [Vuetify](https://vuetifyjs.com/en/). Le tout forme un environnement très complet pour développer des interfaces graphiques dynamiques et claires. La documentation sur cet écosystème est bien fournie et de qualité. Ce n'est pas pour rien que VueJS fait partie des projets Github les plus populaires.

## Code source

Le code du backend est écrit en [NodeJS](https://nodejs.org/en/), en respectant la syntaxe ES7. Le code utilise donc massivement les promesses, cachées derrières des mots clés comme *async* ou *await*. Cela permet d'avoir du code clair, concis et facilement compréhensible, tout en étant très performant grâce à une gestion non bloquante des opérations asynchrones.

Un autre aspect de NodeJS est très utilisé dans ce projet : la gestion d'opérations en flux (streams). Cela permet de réaliser des traitements sur des volumes importants sans abuser des ressources de la machine. Ce service demande donc peu de mémoire vive pour fonctionner (mais il en faudra par contre une bonne quantité pour ElasticSearch).

Le serveur web et l'API sont écrits avec le framework [express 4](https://expressjs.com/fr/) qui est utilisé dans de nombreux projets Web NodeJS. Les briques fonctionnelles sont séparées dans des *router* Express, qui permettent par exemple de définir les opérations autour d'un certain concept.
