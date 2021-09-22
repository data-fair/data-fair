---
title: Gestion des utilisateurs
section: 3
subsection : 6
updated: 2020-12-09
description : Gestion des utilisateurs
published: true
---

Par défaut, il existe quatres rôles différents : utilisateur, contributeur, administrateur et super administrateur.

Les super administrateurs de la plateforme peuvent gérer l'ensemble des organisations et des membres de la plateforme. Ils peuvent aussi configurer le portail de données et gérer les traitements périodiques.

Les administrateurs d’une organisation peuvent gérer les membres :

* Inviter de nouveaux membres par e-mail
* Changer les rôles des membres
* Exclure un membre

Permissions par défaut des différents rôles d’une organisation :

| Actions                              | Utilisateur | Contributeur | Administrateur |
|--------------------------------------|:-----------:|:------------:|:--------------:|
| Ajout d'un jeu de données            |             |       x      |        x       |
| Lecture d'un jeu de données          |      x      |       x      |        x       |
| Modification d'un jeu de données     |             |       x      |        x       |
| Administration de'un jeu de données  |             |              |        x       |
| Ajout d'une visualisation            |             |       x      |        x       |
| Lecture d'une visualisation          |      x      |       x      |        x       |
| Edition d'une visualisation          |             |       x      |        x       |
| Administration d'une visualisation   |             |              |        x       |
| Accès et modification des paramètres |             |              |        x       |
| Création et modification du portail  |             |              |        x       |

Une personne peut appartenir à plusieurs organisations avec différents rôles dans chaque organisation.
