---
title: Configurations d'applications
permalink: /applications-configs
---

Un aspect essentiel du service et de pouvoir facilement réutiliser les données dans des applications. Ces applications peuvent consommer différents flux de données, du moment qu'ils soient sémantisés et contiennent les informations dons les applications on besoin. Les applications on donc besoin d'être configurées, de stocker leur configuration et on doit facilement pouvoir configurer une application.

Les applications ne sont pas développées dans ce projet : elles peuvent être privées et développées par des éditeurs ou être opensource. Un des prérequis est qu'elles soient accessibles en ligne. Plus précisément, les applications sont des services web externes réexposés par ce service.

## Paramétrage d'une application existante
Pour ajouter une application, il faut connaître son URL d'exposition publique. Typiquement, en visitant cette adresse avec un navigateur web, on arrive sur une page présentant l'application et nous expliquant qu'elle n'est pas configurée. Il faut alors copier l'URL de cette explication et la coller dans l'écran d'ajout d'application de ce service. Après avoir cliqué sur *Suivant*, il faut ensuite renseigner le propriétaire qui peut être l'utilisateur connecté ou une des organisations auxquelles il appartient. Une fois ce choix effectué, un paramétrage pour cette application est créé. L'utilisateur peut accéder à ce paramétrage en cliquant sur le lien de la notification.

Sur l'écran de paramétrage, le titre et la description de l'application sont renseignés avec les valeurs par défaut pour cette application. Ils peuvent être modifiée, par exemple pour identifier que l'application est liée à certaines données. Ces informations sont principalement utilisées dans la vue en liste des paramétrages d'application. A noter qu'**une même application peut être paramétrée plusieurs fois** pour les mêmes utilisateurs / organisations. Les paramétrages peuvent ensuite différer par rapport aux données qu'ils utilisent.

Des boutons d'action en bas de l'écran de paramétrage permettent de réaliser différente tâche : accès direct à l'application configurée, suppression de l'application et éventuellement accès à l'écran de paramétrage de l'application.

## Développement d'une nouvelle application
N'importe qui peut développer une nouvelle application utilisable dans ce service. Les applications sont servicialisées : ce sont des applications web servies par un backend. Ce service fait office de proxy et les réexpose en leur donnant des information de contexte pour qu'elles puissent fonctionner correctement. Pour pouvoir être intégrée et comprise, une application doit exposer certaines informations.

### Exposition des informations
Une application expose les informations la concernant en servant un fichier HTML, typiquement un fichier `ìndex.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balise de la section HEAD :
 * **tittle** : Le titre de l'application, dans une balise title.
 * **description** : La description de l'application, dans une balise meta.
 * **configuration** : Un lien vers la page de configuration de l'application. Le formalisme des balises à utiliser n'a pas encore été défini, ce lien peut aussi apparaître directement dans la page (lien a.href dans le body).

### Informations de contexte
Les applications ont besoin d'avoir accès à certaines informations pour bien fonctionner : quels jeux de données ou APIs utiliser, comment authentifier les utilisateurs, ... Le service qui les réexpose fait office de proxy et leur transmet ces informations. Cette transmission s'effectue à l'aide de headers HTTP : le backend de l'application les intercepte et peut ensuite, si il ne fait pas lui même le rendu client, les transmettre au front-end. Les headers suivant sont transmis par le service :
 * **X-Exposed-Url** : URL d'exposition de l'application
 * **X-Config-Url** : URL à utiliser pour enregistrer / lire la configuration de l'application
 * **X-Directory-Url** : URL de l'annuaire, qui implémente le même contrat que [simple-directory](https://github.com/koumoul-dev/simple-directory)
 * **X-API-Url** : URL de l'API de ce service, ce qui permet ensuite d'accéder aux APIs externes et aux datasets

### Authentification
L'application doit utiliser le même mécanisme d'authentification que ce service, c'est à dire celui décrit dans [simple-directory](https://github.com/koumoul-dev/simple-directory). A moins de stocker des données supplémentaire, l'application n'utilise le lien vers l'annuaire que pour authentifier et renouveler le jeton d'authentification d'un utilisateur. L'authentification se fait en mettant un lien vers la page appropriée de l'annuaire, tout en renseignant une URL de redirection. Le renouvellement du jeton se fait en utilisant le point d'accès d'API approprié (se référer à la documentation de l'annuaire).

Tous les appels aux APIs de se service doivent se faire en passant les informations d'authentification, typiquement le JWT (Json Web Token) obtenu avec les opérations décrites précédemment, envoyé dans un cookie `id_token`.

Les mécanisme à utiliser sont les même que ceux utilisés par ce service. Vous pouvez vous inspirer des pages dans le dossier `public/src` de ce projet.
