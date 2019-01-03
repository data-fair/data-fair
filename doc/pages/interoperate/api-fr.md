Data FAIR expose un API HTTP complète. Une partie de cette API est essentiellement à destination des applications et autres réutilisations des jeux de données. Une autre partie concerne principalement les producteurs de contenu qui souhaitent automatiser leur processus. Dans cette page nous proposons un aperçu de quelques méthodes de publication de contenu. Les exemples ci-dessous ne montrent qu'un échantillon des capacités de l'API DataFair et ne remplacent pas la documentation interactive bien plus complète embarquée dans le service.

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
export dataFairUrl="https://koumoul.com/s/data-fair"
export dataFairUrl="http://localhost/data-fair"
```

### Jeu de données simple basé fichier

Téléchargez un fichier CSV d'exemple :

```sh
curl https://raw.githubusercontent.com/koumoul-dev/data-fair/master/test/resources/dataset1.csv -o dataset1.csv
```

Créez un jeu de données simple à partir de ce fichier avec une requête HTTP multipart :

```sh
curl -v -X POST --header "x-apiKey: $API_KEY" --form file=@dataset1.csv $dataFairUrl/api/v1/datasets
```

Notez dans le retour que le jeu de données créé s'est vu attribué un identifiant "id" que vous pouvez conserver pour effectuer des opérations ultérieures sur ce jeu de données.

L'attribut page est lui aussi intéressant, il vous permet de naviguer dans un navigateur directement sur la page de description du jeu de données.

Enfin l'attribut "status" est à "loaded". Notez que les traitements sur le jeu de données sont exécutés de manière asynchrone, quelques secondes plus tard le statut devrait devenir "finalized" en passant par des étapes intermédiaires.

### Jeu de données basé fichier avec pièces jointes

### Jeu de données incrémental

### Jeu de données incrémental avec pièces jointes
