---
title: Simple Directory
section: 3
updated: 2020-12-09
description : Simple Directory
published: false
---
La connexion et la gestion des comptes est assurée par Simple-Directory.

### Connection des utilisateurs
Les utilisateurs peuvent se connecter avec un mot de passe et un email ou en utilisant un compte externe existant tels qu’un compte Gmail via le protocole oAuth2.


D’autres protocoles ou fournisseurs d’identités tels que LDAP ou SSO peuvent être implémentés.

# Gestion des comptes

Par défaut, il existe quatres rôles différents : utilisateur, contributeur, administrateur et super administrateur.
Les super administrateurs de la plateforme peuvent gérer l'ensemble des organisations et des membres de la plateforme. Il peuvent aussi configurer le front office (portail DataFair).

Tous les membres d'une organisation n'ont pas les même droits.



Il est possible d'ajouter d'autres protocoles, tel que LDAP, pour se conencter.
