---
title: Gestion des utilisateurs
section: 3
subsection : 4
description : Gestion des utilisateurs
published: true
---

Par défaut, il existe quatre rôles différents&nbsp;: utilisateur, contributeur, administrateur et super&nbsp;administrateur.

Les **super&nbsp;administrateurs** de la plateforme peuvent gérer l'ensemble des organisations, membres et tout le contenu de la plateforme. Ils ont la possibilité de configurer les visualisations disponibles, publier les portails sur des noms de domaine particuliers, paramétrer les traitements périodiques, ou définir les jeux de données&nbsp;maîtres.

Les trois autres rôles sont définis par organisation&nbsp;: il est, par exemple, possible d'être administrateur dans une organisation et simple utilisateur dans une autre.

### Rôles et permissions associées

Les administrateurs d’une organisation peuvent gérer les membres&nbsp;:

* **Inviter** de nouveaux membres par e-mail&nbsp;;
* **Changer** les rôles des membres&nbsp;;
* **Exclure** un membre.

<p></p>
Permissions par défaut des différents rôles d’une organisation :

<div style="width:700px">

|Actions|Utilisateur|Contributeur|Administrateur|
|--------------------------------------------------------------|:-----------:|:------------:|:--------------:|
| Ajout d'un jeu de données                                    |             |       x      |        x       |
| Lecture d'un jeu de données                                  |      x      |       x      |        x       |
| Modification d'un jeu de données                             |             |       x      |        x       |
| Administration d'un jeu de données                           |             |              |        x       |
| Ajout d'une visualisation                                    |             |       x      |        x       |
| Lecture d'une visualisation                                  |      x      |       x      |        x       |
| Édition d'une visualisation                                  |             |       x      |        x       |
| Administration d'une visualisation                           |             |              |        x       |
| Accès et modification des paramètres                         |             |              |        x       |
| Création et modification du portail                          |             |              |        x       |
| Création d'un jeu de données de référence                    |             |              |        x       |
| Création d'une extension   |             |       x      |        x       |
| Création et modification d'un traitement de données          |             |              |        x       |

</div>

### Départements

En plus de leur rôle, les utilisateurs peuvent être assignés à un département de l'organisation. Cela permet une **forme de cloisonnement** et d'avoir des groupes d'utilisateurs qui gèrent chacun leurs données de leur côté. Les utilisateurs qui ne sont pas restreints à un département peuvent voir (ou modifier s'ils ont un rôle de contributeur ou administrateur) toutes les ressources de l'organisation.

Un contributeur d'un département ne peut mettre à jour que les jeux de données de ce département et, quand il créé un jeu de données, celui-ci est rattaché à son département. De la même manière, un administrateur rattaché à un département ne peut publier des jeux de données que sur un portail rattaché à son département. Par contre, un administrateur général de l'organisation peut publier ce même jeu de données sur un portail plus global à l'organisation.

### Partenaires

Les partenaires sont des organisations qui sont invitées sur un portail.
Ces organisations peuvent être composées de plusieurs membres avec différents droits.  
Il est ainsi possible d'ouvrir des jeux de données privés à des partenaires privilégiés : ainsi, les membres de l'organisation partenaire peuvent lire les données et/ou les modifier dans leur espace personnel sur votre portail.
