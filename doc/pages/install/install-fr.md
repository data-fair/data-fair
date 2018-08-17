## Installation

Cette application expose des services Web et interopère avec d'autres applications du même type. Pour comprendre comment ce *DataFair* fonctionne, vous pouvez aller voir la [description technique](technical-overview.md).

La procédure d'installation décrite ici est une procédure simplifiée, qui ne couvre pas toutes les étapes de configuration d'un environnement de production comme le *reverse proxy* avec certificat SSL, le DNS ou l'équilibrage de charge.

Nous proposons une installation simple grâce à l'utilisation de conteneurs [Docker](https://docker.com) basés sur [l'image](https://hub.docker.com/r/koumoul/data-fair/) que nous mettons à disposition. Le service peut être installé hors Docker, nous vous conseillons dans ce cas de regarder la documentation pour les développeurs directement dans le [répertoire du projet](https://github.com/koumoul-dev/data-fair).


## Prérequis

### Configuration matérielle

Ce service a été testé sous Linux (Ubuntu 16.04), vous pouvez utiliser n'importe quel système Linux compatible avec un démon Docker récent. Le service n'a pas besoin de beaucoup de ressources de calcul, mais plutôt de mémoire et d'entrée sortie. La configuration recommandée est la suivante :

 * Au moins 2 coeurs, 4 si les base de données tournent sur la même machine
 * 4 Go de RAM, 16 si les base données tournent sur la même machine. Cette quantité peut être plus importante si l'on souhaite stocker des volumes importants. Dans ce cas nous conseillons d'installer ElasticSearch sur une autre machine avec plus de mémoire vive, ou de faire un cluster sur plusieurs machines.
 * 50 Go de disque dur, de type SSD. Cette quantité peut être plus importante suivant le volume de données que l'on souhaite gérer.
 * 100 Mbits de bande passante au minimum, que ce soit en montant ou en descendant.

### Docker

Installez Docker en suivant la [documentation officielle](https://docs.docker.com/engine/installation/) très complète.

Nous conseillons aussi d'installer [docker-compose](https://docs.docker.com/compose/install/) pour une vision plus claire de la configuration.

### MongoDB

Le service nécessite MongoDB 3.4 ou supérieur pour persister ses données. MongoDB peut être [installé de différentes manières](https://docs.mongodb.com/v3.4/installation/).

**Installer MongoDB manuellement est optionnel**, vous pouvez opter pour une installation globale de tous les services avec Docker (voir plus bas).

### ElasticSearch

Le service nécessite ElasticSearch 5.0. Nous sommes en train d'étudier une migration vers la version 6.0 donc les informations décrites ici sont susceptibles d'évoluer. Les instruction d'installation sont [disponibles ici](https://www.elastic.co/guide/en/elasticsearch/reference/5.0/install-elasticsearch.html).

**Installer ElasticSearch manuellement est optionnel**, vous pouvez opter pour une installation globale de tous les services avec Docker (voir plus bas).

### Annuaire d'utilisateurs

## Installation

Pour une installation avec docker-compose vous devez créer un fichier `docker-compose.yml`. Le contenu de ce fichier dépend de la configuration souhaitée, nous proposons quelques configurations dans les sections suivante. Un fois le fichier créé vous pouvez lancer le ou les services décrits de cette manière :

```
docker-compose up -d
```

Le service peut être arrété avec la commande :

```
docker-compose stop
```

La mise à jour s'effectue en mettant à jour les versions de services dans le fichier `docker-compose.yml` et en lançant les 2 commandes suivantes :

```
docker-compose pull
docker-compose up -d
```

Pour plus d'informations sur les commandes disponibles, vous pouvez [consulter la documentation](https://docs.docker.com/compose/).

### Installation globale

Le contenu du fichier `docker-compose.yml` est le suivant (vous pouvez bien sûr l'adapter suivant votre environnement) :

```
version: '3'
services:
  data-fair:
    image: koumoul/data-fair:0.1.0
    ports:
      - 8080:8080
  elastic-search:
    image: elasticsearch:5.6.3-alpine
  mongodb:
    image: mvertes/alpine-mongo:3.4.9-0
  simple-directory:
    image: koumoul/simple-directory:0.1.0
    ports:
      - 5700:8080
    environment:
      - PUBLIC_URL=http://localhost:5700
    volumes:
      - ./test/resources/users.json:/webapp/resources/users.json
      - ./test/resources/organizations.json:/webapp/resources/organizations.json
```


### Installation du service uniquement
