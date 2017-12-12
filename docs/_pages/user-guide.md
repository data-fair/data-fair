---
title: Manuel utilisateur
permalink: /user-guide
---

## Jeux de données



## Services externes

Les services externes sont des fonctionnalités externalisées à ce service. Elles permettent de récupérer des données supplémentaires, de faire des traitements sur certaines données, ... Elles sont optionnelles pour pouvoir exposer ses données, mais nécessaires si l'on souhaite faire de l'enrichissement ou utiliser certaines applications. Ces APIs peuvent être ouvertes ou fermées, dans le 2e cas il faut alors paramétrer des codes d'accès à ces APIs.

### Importer et configurer l'accès à une API externe
Pour importer une API externe, on peut soit déposer un fichier JSON qui la décrit, soit rentrer une URL qui pointe vers ce fichier JSON.


## Configurations d'applications

Un aspect essentiel du service et de pouvoir facilement réutiliser les données dans des applications. Ces applications peuvent consommer différents flux de données, du moment qu'ils soient sémantisés et contiennent les informations dons les applications on besoin. Les applications on donc besoin d'être configurées, de stocker leur configuration et on doit facilement pouvoir configurer une application.

Les applications ne sont pas développées dans ce projet : elles peuvent être privées et développées par des éditeurs ou être opensource. Un des prérequis est qu'elles soient accessibles en ligne. Plus précisément, les applications sont des services web externes réexposés par ce service.

### Paramétrage d'une application existante

Pour ajouter une application, il faut connaître son URL d'exposition publique. Typiquement, en visitant cette adresse avec un navigateur web, on arrive sur une page présentant l'application et nous expliquant qu'elle n'est pas configurée. Il faut alors copier l'URL de cette explication et la coller dans l'écran d'ajout d'application de ce service. Après avoir cliqué sur *Suivant*, il faut ensuite renseigner le propriétaire qui peut être l'utilisateur connecté ou une des organisations auxquelles il appartient. Une fois ce choix effectué, un paramétrage pour cette application est créé. L'utilisateur peut accéder à ce paramétrage en cliquant sur le lien de la notification.

Sur l'écran de paramétrage, le titre et la description de l'application sont renseignés avec les valeurs par défaut pour cette application. Ils peuvent être modifiée, par exemple pour identifier que l'application est liée à certaines données. Ces informations sont principalement utilisées dans la vue en liste des paramétrages d'application. A noter qu'**une même application peut être paramétrée plusieurs fois** pour les mêmes utilisateurs / organisations. Les paramétrages peuvent ensuite différer par rapport aux données qu'ils utilisent.

Des boutons d'action en bas de l'écran de paramétrage permettent de réaliser différente tâche : accès direct à l'application configurée, suppression de l'application et éventuellement accès à l'écran de paramétrage de l'application.


## Contrôles d'accès

Le contrôle d'accès sur les flux de données se fait avec un système de permissions. Il y a des permissions sur les jeux de données et les APIs externes, mais pas sur les applications : celles-ci ont besoin des flux de données pour fonctionner, et en contrôlant les modalités d'accès à ces flux on peut déterminer si l'utilisateur peut utiliser l'application. Le niveau de granularité du contrôle d'accès est le fait d'être propriétaire ou non de la ressource (droits sur toutes les opérations liées à cette ressource), ou sinon sur chaque opération unitairement.

### Utilisateurs et Organisations

Le système des permissions repose sur une modélisation assez simple des concepts d'utilisateurs et d'organisations, comme par exemple celui implémenté dans [simple-directory](https://github.com/koumoul-dev/simple-directory) : les utilisateurs peuvent appartenir à plusieurs organisations et une organisation peut contenir plusieurs utilisateurs, il n'y a pas de relations entre les organisations.

Que ce soit au niveau du propriétaire ou des permissions, il y a toujours possibilité de les définir à un niveau unitaire qui est un utilisateur, ou à un niveau de groupe qui est l'organisation. Dans ce 2e cas, tous les membres de l'organisation bénéficient alors de la propriété de la ressource ou de la permission d'accès.

Ce système est simple mais permet de couvrir beaucoup de cas fonctionnels. Il faut cependant faire attention car il peut être dangereux. Il faut notamment bien régler les droits de propriété ou d'écriture et nous conseillons de les garder à un niveau utilisateur, et d'ouvrir des droits de lecture sur des organisations.

### Portée des permissions

L'utilisateur propriétaire ou tous les membres de l'organisation propriétaire peuvent faire toutes les opérations sur la ressource possédée. Pour les autres utilisateurs, la permission est octroyée à un niveau opération. Une opération est un point d'accès exposé par l'API (externe ou d'un jeu de données). On peut par exemple accorder la permission à quelqu'un de lire la description d'un jeu de données, mais pas les données.
