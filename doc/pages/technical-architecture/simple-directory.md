---
title: Simple Directory
section: 3
updated: 2020-12-09
description : Simple Directory
published: true
---
La connexion et la gestion des comptes est assurée par Simple Directory. Il permet de gérer 2 types de comptes : les comptes utilisateurs et les comptes organisation.

### Gestion de session décentralisée
Le rôle principal de Simple Directory est de permettre aux utilisateurs de s'authentifier dans la plateforme. Cela se fait au moyen de JWT (JSON Web Token) qui sont stockés coté client. Les clients envoient leur JWT à chaque requête HTTP, et chaque service dans l'infrastructure est capable de vérifier qu'un JWT est correct. Cela se fait en vérifiant le jeton avec la clé publique mise à leur disposition par Simple Directory.


### Connection des utilisateurs
Les utilisateurs peuvent se connecter avec un mot de passe et un email ou en utilisant un compte externe existant tel qu’un compte Gmail, Facebook, Github ou Linkedin via le protocole oAuth2.

D’autres protocoles ou fournisseurs d’identités tels que LDAP ou SSO vont bientôt être implémentés.


### Stack technique

Le backend de Simple Directory est écrit en NodeJS avec le framework ExpressJS. La persistance est assurée avec MongoDB. Le frontend est réalisé avec les frameworks VueJS, VuetifyJS et NuxtJS. La création et gestion des JWT est assurée grâce à différentes librairies open source.

Il n'y a pour l'instant qu'un mode de distribution qui est Docker, et il est recommandé d'opérer ce service dans un environnement tel que Kubernetes.
