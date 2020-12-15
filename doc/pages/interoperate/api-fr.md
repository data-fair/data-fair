---
title: API Data Fair
section: 1
updated: 2020-12-10
description : API Data Fair
published: true
---

Data Fair expose une API Rest complète. Une partie de cette API est essentiellement à destination des applications et autres réutilisations des jeux de données. Une autre partie concerne principalement les producteurs de contenu qui souhaitent automatiser leur processus. Dans cette page nous proposons un aperçu de quelques méthodes de publication de contenu. Les exemples ci-dessous ne montrent qu'un échantillon des capacités de l'API DataFair et ne remplacent pas la documentation interactive bien plus complète embarquée dans le service.

### Pré-requis

  - Une installation opérationnelle de Data FAIR, soit locale, soit publique comme sur [koumoul.com](https://koumoul.com/s/data-fair)
  - Un compte et une clé d'API avec la portée "Gestion des jeux de données" (voir vos paramètres personnels ou d'organisation dans le menu en haut à droite)
  - [curl](https://curl.haxx.se/) ou autre client HTTP à condition d'adapter les exemples

Définissez une variable contenant votre clé d'API :

```sh
export API_KEY="XXXX"
```

Définissez une variable contenant l'URL de base de votre instance DataFair :

```sh
export DATAFAIR_URL="https://koumoul.com/s/data-fair"
export DATAFAIR_URL="http://localhost/data-fair"
```

### Jeu de données simple basé fichier

Téléchargez un fichier CSV d'exemple :

```sh
curl https://raw.githubusercontent.com/koumoul-dev/data-fair/master/test/resources/dataset1.csv -o dataset1.csv
```

Créez un jeu de données simple à partir de ce fichier avec une requête HTTP multipart :

```sh
curl -v --header "x-apiKey: $API_KEY" --form file=@dataset1.csv $DATAFAIR_URL/api/v1/datasets
```

Notez dans le retour que le jeu de données créé s'est vu attribué un identifiant "id" que vous pouvez conserver pour effectuer des opérations ultérieures sur ce jeu de données.

```sh
export DATASET_ID=identifiant que vous venez de recevoir
```

L'attribut "status" est à "loaded". Notez que les traitements sur le jeu de données sont exécutés de manière asynchrone, quelques secondes plus tard le statut devrait devenir "finalized" en passant par des étapes intermédiaires. Pour vérifier cela vous pouvez faire un GET sur le jeu de données :

```sh
curl -v --header "x-apiKey: $API_KEY" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID
```

L'attribut page est lui aussi intéressant, il vous permet de naviguer dans un navigateur directement sur la page de description du jeu de données. Pour connaître l'étendue des capacités de requêtage sur ce jeu de données vous pouvez vous rendre sur l'onglet API depuis cette page. Voici un exemple basique :

```sh
curl -v --header "x-apiKey: $API_KEY" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/lines
```

### Jeu de données basé fichier avec pièces jointes

Téléchargez un fichier CSV d'exemple qui contient une colonne de chemins vers des pièces jointes :

```sh
curl https://raw.githubusercontent.com/koumoul-dev/data-fair/master/test/resources/dataset-attachments.csv -o dataset-attachments.csv
```

Téléchargez l'archive contenant les pièces jointes correspondantes :

```sh
curl https://raw.githubusercontent.com/koumoul-dev/data-fair/master/test/resources/files.zip -o files.zip
```

Créez un jeu de données basé sur le CSV et enrichi avec les pièces jointes de l'archive grâce à cette requête HTTP multipart :

```sh
curl -v --header "x-apiKey: $API_KEY" --form file=@dataset-attachments.csv --form attachments=@files.zip $DATAFAIR_URL/api/v1/datasets
export DATASET_ID=identifiant que vous venez de recevoir
```

Si vous visitez la page de ce jeu de données vous verrez un onglet "Fichiers" supplémentaire qui permet de lister les pièces jointes et d'effectuer des recherches dans leur contenu. En effectuant une requête basique sur le jeu de données vous pouvez constater l'ajout de champs \_file.\* qui sont issus de l'analyse du contenu des pièces jointes.

### Jeu de données incrémental

Créez un jeu de données incrémental vide avec un schéma minimaliste. Notez l'attribut "isRest" qui est la condition pour créer ce type de jeu de données :

```sh
curl -v --header "x-apiKey: $API_KEY" --header "Content-Type: application/json" $DATAFAIR_URL/api/v1/datasets --data '{
  "isRest": true,
  "title": "rest1",
  "schema": [{ "key": "attr1", "type": "string" }, { "key": "attr2", "type": "string" }]
}'
export DATASET_ID=identifiant que vous venez de recevoir
```

Ajouter une ligne de donnée :

```sh
curl -v --header "x-apiKey: $API_KEY" --header "Content-Type: application/json" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/lines --data '{
  "_id": "ligne1",
  "attr1": "attr1 ligne1",
  "attr2": "attr2 ligne1"
}'
```

Ajoutez/modifiez plusieurs lignes de donnée :

```sh
curl -v --header "x-apiKey: $API_KEY" --header "Content-Type: application/json" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/_bulk_lines --data '[
  { "_id": "ligne1", "_action": "patch", "attr1": "attr1 ligne1 autre valeur"},
  { "_id": "ligne2", "attr1": "attr1 ligne2", "attr2": "attr2 ligne2"}
]'
```

Vérifiez la donnée :

```sh
curl -v --header "x-apiKey: $API_KEY" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/lines
```

### Jeu de données incrémental avec pièces jointes

Créez un jeu de données incrémental vide avec un schéma qui contient un champ type *pièces jointes* :

```sh
curl -v --header "x-apiKey: $API_KEY" --header "Content-Type: application/json" $DATAFAIR_URL/api/v1/datasets --data '{
  "isRest": true,
  "title": "rest1",
  "schema": [
    { "key": "attr1", "type": "string" },
    { "key": "attachmentPath", "type": "string", "x-refersTo": "http://schema.org/DigitalDocument" }
  ]
}'
export DATASET_ID=identifiant que vous venez de recevoir
```

Ajoutez plusieurs lignes de données avec pièces jointes dans une archive :

```sh
echo '[
  { "_id": "line1", "attr1": "test1", "attachmentPath": "test.odt" },
  { "_id": "line2", "attr1": "test1", "attachmentPath": "dir1/test.pdf" }
]' > actions.json
curl -v --header "x-apiKey: $API_KEY" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/_bulk_lines --form attachments=@files.zip --form actions=@actions.json
```

Vérifiez la donnée :

```sh
curl -v --header "x-apiKey: $API_KEY" $DATAFAIR_URL/api/v1/datasets/$DATASET_ID/lines
```
