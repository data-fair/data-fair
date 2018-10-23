Data FAIR expose un API HTTP complète. Une partie de cette API est essentiellement à destination des applications et autres réutilisations des jeux de données. Une autre partie concerne principalement les producteurs de contenu qui souhaite automatiser leur processus. Dans cette page nous proposons un aperçu de quelques méthodes de publication de contenu.

### Pré-requis

  - Une installation opérationnelle de Data FAIR, soit locale, soit publique comme sur [koumoul.com](https://koumoul.com/s/data-fair)
  - Un compte et une clé d'API avec la portée "Gestion des jeux de données" (voir vos paramètres personnels ou d'organisation dans le menu en haut à droite)
  - [curl](https://curl.haxx.se/) ou autre client HTTP à condition d'adapter les exemples

Définissez une variable contenant votre clé d'API :

```sh
export API_KEY="XXXX"
```



Téléchargez un fichier CSV d'exemple :

```sh
curl https://raw.githubusercontent.com/koumoul-dev/data-fair/master/test/resources/dataset1.csv -o dataset1.csv
```

Créez un jeu de données simple à partir de ce fichier avec une requête HTTP multipart :

```sh
curl -v -X POST --header "x-apiKey=$API_KEY" --form file=@dataset1.csv {{publicUrl}}/api/v1/datasets
```

Notez dans le retour que le jeu de données créé s'est vu attribué un identifiant "id" que vous pouvez conserver pour effectuer des opérations ultérieures sur ce jeu de données.

L'attribut page est lui aussi intéressant, il vous permet de naviguer dans un navigateur directement sur la page de description du jeu de données.

Enfin l'attribut "status" est à "loaded". Notez que les traitements sur le jeu de données sont exécutés de manière asynchrone, quelques secondes plus tard le statut devrait devenir "finalized" en passant par des étapes intermédiaires.
