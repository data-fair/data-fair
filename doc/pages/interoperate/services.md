---
title: Services externes
section: 3
updated: 2020-12-10
description: Services externes
published: true
---

Une API peut être utilisée par ce service si elle respecte certains critères. Elle doit être décrite avec un certain formalisme&nbsp;: spécification OpenAPI 3.0, annotations sémantiques particulières et mécanisme d'identification de l'API.

## Spécification OpenAPI 3.0

Le schéma utilisé pour décrire une API est celui de la [spécification OpenAPI 3.0](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md). Le format à utiliser est JSON (YAML sera supporté prochainement). Les autres formats ne sont pas supportés, en particulier le format Swagger 2.0. Si votre API est décrite dans un autre format, [certains outils](https://github.com/Mermade/awesome-openapi3) permettent de la convertir dans le format OpenAPI 3.0.

Néanmoins, une description en pur OpenAPI 3.0 est insuffisante et il faut renseigner des informations complémentaires, notamment pour identifier l'API plus facilement et la sémantiser. Ces informations sont ajoutées en utilisant le format d'extensions autorisé par la spécification est les attributs supplémentaires sont de la forme *x-PropertyName*.

## Identification de l'API

La spécification OpenAPI 3.0 n'offre pas de mécanisme permettant d'identifier de manière unique un API. Cela pose différents problèmes&nbsp;:
 * Il est difficile de suivre l'évolution de l'API, on ne sait pas si deux descriptions similaires correspondent à deux API différentes ou à deux versions différentes d'une même API.
 * Certaines applications nécessitent des fonctionnalités particulières d'API qu'il est difficile de décrire sémantiquement. Une identification unique de l'API permet au moins de dire que les applications ont besoin de cette API (et plus précisément d'une version minimale) en particulier.

Pour identifier de manière unique une API, nous avons choisi d'adopter [ces recommandations](https://github.com/zalando/restful-api-guidelines/blob/master/chapters/compatibility.adoc)&nbsp;: il faut renseigner un attribut `x-api-id` dans le bloc `info`. Plus précisément, il doit avoir cette forme&nbsp;:

```yaml
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

## Annotations sémantiques

Les annotations sémantiques permettent de préciser ce que font les différentes opérations d'une API. On peut, d'une part, typer plus précisément les données en entrée et en sortie en utilisant des ontologies (par exemple, un code postal est plus précis qu'un entier) et, d'autre part, déterminer une plus grande diversité d'actions que les verbes HTTP qui sont très restreints.

Le format d'annotations sémantiques que nous avons choisi est décrit dans [cet article](http://www.intelligence.tuc.gr/~petrakis/publications/SOAS4.pdf). *x-operationType* permet de spécifier plus précisément l'action réalisée par l'opération. Nous conseillons d'utiliser le vocabulaire [défini ici](http://schema.org/Action) dans les types spécifiques. Pour pouvoir être utilisé pour de l'enrichissement, un endpoint doit utiliser l'action *Search*. *x-refersTo* permet de typer les entrées et sorties avec des ontologies. Le vocabulaire à utiliser est décrit dans ce projet, dans le fichier `contract/vocabulary.json`.
