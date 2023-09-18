---
title: Simple Directory
section: 3
updated: 2020-12-09
description : Simple Directory
published: true
---
La connexion et la gestion des comptes est assurée par Simple Directory. Il permet de gérer deux types de comptes&nbsp;: les comptes utilisateurs et les comptes organisations.

## Gestion de session décentralisée
Le rôle principal de Simple Directory est de permettre aux utilisateurs de s'authentifier sur la plateforme. Cela se fait au moyen de JWT (JSON Web Tokens) qui sont stockés côté clients. Les clients envoient leur JWT à chaque requête HTTP, et chaque service dans l'infrastructure est capable de vérifier qu'un JWT est correct&nbsp;: le jeton est vérifié avec la clé publique mise à leur disposition par Simple Directory.


## Connection des utilisateurs
Les utilisateurs peuvent se connecter avec un mot de passe et une adresse e-mail ou en utilisant un compte externe, tel qu'un compte Gmail, Facebook, Github ou Linkedin, via le protocole **oAuth2**.

D’autres protocoles ou fournisseurs d’identités, tels que LDAP ou SSO, seront bientôt implémentés.


## Stack technique

Le back-end de Simple Directory est écrit en Node.js avec le framework Express.js. La persistance est assurée avec MongoDB. Le front-end est réalisé avec les frameworks Vue.js, Vuetify.js et Nuxt.js. La création et gestion des JWT est assurée grâce à différentes librairies open&nbsp;source.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
