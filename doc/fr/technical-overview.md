# Stack technique du projet
Cette page présente les langages de programmation, services et outils utilisés pour réaliser ce projet. Ce service sert le backend (API) et le frontend (client).

## Backend
Le backend sert les pages publiques (frontend) et l'API qui interagi avec d'autres services de persitance. Les pages publiques sont rendu au travers d'une Single Page Application : le backend ne fait quasiment pas de rendu HTML.

### Persistance
Ce service utilise 3 types de persistance : fichier, base de données et moteur de recherche. La persistance fichier est utilisée pour stocker les datasets des utilisateurs : les fichiers sont stockés tels quels sur le système de fichier et sont ensuite analysés puis indexés.

Les informations sur les datasets, les APIs externes et les configurations d'applications sont stockées dans une base de données MongoDB, qui est une base NOSQL opensource orientée documents. Cette base a été choisie car il y a peu de liens entre les données, et celles ci peuvent par contre être complexes avec des niveaux de profondeur importants.

Les datasets sont indexés dans un moteur de recherche opensource qui est ElasticSearch. Il permet de faire des recherches textuelles performantes, ainsi que des agrégations puissante sur des données numériques ou géographiques.

### Code source
Le code du backend est écrit en NodeJS, en respectant la syntaxe ES7. Le code utilise donc massivement les promesses, cachées derrières des mots clés comme *async* ou *await*. Cela permet d'avoir du code clair, concis et facilement compréhensible, tout en étant très performant grâce à une gestion non bloquant des opérations asynchrones.

Un autre aspect de NodeJS est très utilisé dans ce projet : la gestion d'opérations en flux (streams). Cela permet de réaliser des traitements sur des volumes importants sans saturer la mémoire de la machine. Ce service demande donc peu de mémoire vive pour fonctionner (mais il en faudra par contre une bonne quantité pour ElasticSearch).

Le serveur web et l'API sont écrits avec le framework express 4 qui est utilisé dans de nombreux projets web NodeJS. Les briques fonctionnelles sont séparées dans des *router* Express, qui permettent par exemple de définir les opérations autour d'un certain concept.

### Authentification
Le mécanisme d'authentification utilisé pour sécuriser les APIs est le JWT (Json Web Token). La sécurité repose sur des mécanismes de cryptograhie asymétrique (RSA). La session utilisateur est maintenue coté client, ce qui permet d'avoir un backend sans état, et donc scalable. Le backend n'emet pas de JWT : il doit donc être relié à un annuaire qui en emet. Le lien vers cet annuaire permet de télécharger sa clé publique pour ensuite vérifier que les JWT reçus soient valides.

## Front end
Le frontend est conçu avec la triplette HTML / CSS / Javascript. Comme mentionné précédement, c'est une Single Page Application : toute l'application est chargée à la connexion du client, puis celui interagi avec l'API du backend via des requêtes Ajax.

Le framework Javascript utilisé est VueJS 2, qui est un framework moderne et réactif. Nous utilisons les principales librairies qui vont avec pour faire le routage coté client (Vue-router), les appels Ajax (Vue-resource), ou le stockage de l'état de l'application (VueX). La documentation sur cet écosystème est bien fournie et de qualité. Ce n'est pas pour rien que VueJS fait partie des projets Github les plus populaires.

## Déploiement
Le service est livré et déployé avec Docker. Les artefacts sortants du build de ce projet sont des images dockers, qui sont ensuite déployées sur un environnement de recette. L'installation du service en production se fait de la même manière : ce qui permet d'avoir un processus simple et puissant pour les mises a jours.

En développement, les dépendance peuvent être installées avec Docker, ce qui permet une prise en main de ce projet très rapide.
