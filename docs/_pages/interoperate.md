---
title: Interopérabilité
permalink: /interoperate
---

Accessible Date est conçu pour interopérer avec d'autres services Web : en tant que consommateur d'APIs externes et en tant que fournisseur de données pour des applications.

## Développement d'une nouvelle application

N'importe qui peut développer une nouvelle application compatible. Les applications elles aussi sont mises à disposition sous forme de services : ce sont des applications Web disponibles en ligne. Une instance de Accessible Data fait office de proxy vers les applications configurées et les réexpose en leur communiquant les informations de contexte nécessaires à l'intéropérabilité. Pour pouvoir être intégrée dans une instance Accessible Data, une application doit exposer certaines informations.

### Exposition des informations

Une application expose un fichier HTML, typiquement un fichier `ìndex.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balise de la section HEAD :
 * **tittle** : Le titre de l'application, dans une balise title.
 * **description** : La description de l'application, dans une balise meta.
 * **configuration** : Un lien vers la page de configuration de l'application. Le formalisme des balises à utiliser n'a pas encore été défini, ce lien peut aussi apparaître directement dans la page (lien a.href dans le body).

### Informations de contexte

Les applications ont besoin d'avoir accès à certaines informations pour bien fonctionner dans le contexte de votre instance Accessible Data : quels jeux de données ou APIs utiliser, comment authentifier les utilisateurs, etc. Ces informations sont transmises à l'aide de headers HTTP que le serveur de l'application interprète. Les headers suivant sont transmis par le service :
 * **X-Exposed-Url** : URL d'exposition de l'application
 * **X-Config-Url** : URL à utiliser pour enregistrer / lire la configuration de l'application
 * **X-Directory-Url** : URL de l'annuaire, qui implémente le même contrat que [simple-directory](https://github.com/koumoul-dev/simple-directory)
 * **X-API-Url** : URL de l'API de ce service, ce qui permet ensuite d'accéder aux APIs externes et aux datasets

### Authentification

L'application doit utiliser le même mécanisme d'authentification que ce service, c'est à dire celui décrit dans [simple-directory](https://github.com/koumoul-dev/simple-directory). A moins de stocker des données supplémentaires, l'application n'utilise le lien vers l'annuaire que pour authentifier et renouveler le jeton d'authentification d'un utilisateur. L'authentification se fait en mettant un lien vers la page appropriée de l'annuaire, tout en renseignant une URL de redirection. Le renouvellement du jeton se fait en utilisant le point d'accès d'API approprié (se référer à la documentation de l'annuaire).

Tous les appels aux APIs Accessible Data doivent contenir les informations d'authentification, typiquement le JWT (Json Web Token) obtenu avec les opérations décrites précédemment, envoyé dans un cookie `id_token`.

## Développer une nouvelle API compatible

Une API peut être utlisée par ce service si elle respecte certains critères. Elle doit être décrite avec un certain formalisme : spécification OpenAPI 3.0, annotations sémantiques particulières et mécanisme d'identification de l'API.

### Spécification OpenAPI 3.0

Le schéma utilisé pour décrire une API est celui de la [spécification OpenAPI 3.0](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md). Le format à utiliser est JSON (YAML sera supporté prochainement). Les autres formats ne sont pas supportés, en particulier le format Swagger 2.0. Si votre API est décrite dans un autre format, [certains outils](https://github.com/Mermade/awesome-openapi3) permettent de la convertir dans le format OpenAPI 3.0.

Néamoins, une description en pur OpenAPI 3.0 est insuffisante et il faut renseigner des informations complémentaires, notamment pour identifier l'API plus facilement et la sémantiser. Ces informations sont ajoutées en utilisant le format d'extensions autorisé par la spécification est les attributs supplémentaires sont de la forme *x-PropertyName*.

### Identification de l'API

La spécification OpenAPI 3.0 n'offre pas de mécanisme permettant d'identifier de manière unique un API. Cela pose différents problèmes :
 * Il est difficile de suivre l'évolution de l'API, on ne sait pas si 2 descriptions similaires correspondent à 2 APIs différentes ou a 2 versions différentes d'une même API.
 * Certaines applications nécessitent des fonctionnalités particulières d'API qu'il est difficile de décrire sémantiquement. Une identification unique de l'API permet au moins de dire que les applications ont besoin de cette API (et plus précisément d'une version minimale) en particulier.

Pour identifier de manière unique une API, nous avons choisi d'adopter [ces recommandations](https://github.com/zalando/restful-api-guidelines/blob/master/chapters/compatibility.adoc) : il faut renseigner un attribut `x-api-id` dans le bloc `ìnfo`. Plus précisément, il doit avoir cette forme :

```
/info/x-api-id:
  type: string
  format: urn
  pattern: ^[a-z0-9][a-z0-9-:.]{6,62}[a-z0-9]$
  description: |
    Globally unique and immutable ID required to identify the API. The API
    identifier allows to reveal the history and evolution of an API as a
    sequence of API specifications. It enables validation tools to detect
    incompatible changes and incorrect semantic versions.
```

### Annotations sémantiques

Les annotations sémantiques permettent de préciser ce que font les différentes opérations d'une API. On peut d'une part typer plus précisément les données en entrée et en sortie en utilisant des ontologies (par exemple un code postal est plus précis qu'un entier) et d'autre part déterminer une plus grande diversité d'actions que les verbes HTTP qui sont très restreints.

Le format d'annotations sémantiques que nous avons choisi est décrit dans [cet article](http://www.intelligence.tuc.gr/~petrakis/publications/SOAS4.pdf). *x-operationType* permet de spécifier plus précisément l'action réalisée par l'opération. Nous conseillons d'utiliser le vocabulaire [défini ici](http://schema.org/Action) dans les types spécifiques. Pour pouvoir être utilisé pour de l'enrichissement, un endpoint doit utiliser l'action *Search*. *x-refersTo* permet de typer les entrées et sorties avec des ontologies. Le vocabulaire à utiliser est décrit dans ce projet, dans le fichier `contract/vocabulary.json`.
