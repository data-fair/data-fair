---
title: Gestion des utilisateurs
section: 3
subsection : 4
description : Gestion des utilisateurs
published: true
---

Par défaut, il existe quatre rôles différents : utilisateur, contributeur, administrateur et super administrateur.

Les **super administrateurs** de la plateforme peuvent gérer l'ensemble des organisation, membres et tout le contenu de la plateforme. Ils ont la possibilité de configurer les visualisations disponibles, publier les portails sur des noms de domaine particuliers, paramétrer les traitements périodiques, ou définir quels sont les jeux de données maitres. Il est prévu de transférer prochainement la gestion des deux derniers éléments aux administrateurs des organisations.

Les 3 autres rôles sont définis par organisation : il est par exemple possible d'être *administrateur* dans une organisation et simple *utilisateur* dans une autre.

### Rôles et permissions associées

Les administrateurs d’une organisation peuvent gérer les membres :

* **Inviter** de nouveaux membres par e-mail
* **Changer** les rôles des membres
* **Exclure** un membre

<p></p>
Permissions par défaut des différents rôles d’une organisation :

| Actions                              | Utilisateur | Contributeur | Administrateur |
|--------------------------------------|:-----------:|:------------:|:--------------:|
| Ajout d'un jeu de données            |             |       x      |        x       |
| Lecture d'un jeu de données          |      x      |       x      |        x       |
| Modification d'un jeu de données     |             |       x      |        x       |
| Administration d'un jeu de données  |             |              |        x       |
| Ajout d'une visualisation            |             |       x      |        x       |
| Lecture d'une visualisation          |      x      |       x      |        x       |
| Edition d'une visualisation          |             |       x      |        x       |
| Administration d'une visualisation   |             |              |        x       |
| Accès et modification des paramètres |             |              |        x       |
| Création et modification du portail  |             |              |        x       |

### Départements

En plus de leur rôle, les utilisateurs peuvent être assigné à un département de l'organisation. Cela permet une **forme de cloisonnement** et d'avoir des groupes d'utilisateurs qui gèrent chacun leurs données de leur coté. Les utilisateurs qui ne sont pas restreints à un département peuvent voir (ou modifier si ils ont un rôle de *contributeur* ou *administrateur*) toutes les ressources de l'organisation.

Un *contributeur* d'un département ne peut mettre à jour que les jeux de données de ce département, et quand il créé un jeu de données, celui ci est rattaché à son département. De la même manière, un administrateur rattaché à un département ne peut publier des jeux de données que sur un portail rattaché à son département. Par contre, un administrateur général de l'organisation peut publier ce même jeu de données sur un portail plus global à l'organisation.
