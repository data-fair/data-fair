---
title: Installation
permalink: /install
---

Cette application est servicialisée et interopère avec d'autres applications servicialisées. Pour comprendre comment ce service fonctionne, vous pouvez aller voir la [description technique](technical-overview.md).

La procédure d'installation décrite ici est une procédure simplifiée, qui ne couvre pas toutes les étapes de configuration de l'environnement comme le proxy, le DNS ou l'équilibrage de charge. Nous proposons une installation simplifiée grâce à l'utilisation de conteneurs [Docker](https://docker.com) grâce à [l'image](https://hub.docker.com/r/koumoul/accessible-data/) que nous mettons à disposition. Le service peut être installé hors Docker, nous vous conseillons dans ce cas de regarder la documentation pour les développeurs directement dans le [répertoire du projet](https://github.com/koumoul-dev/accessible-data).


## Prérequis

La machine hébergeant le service doit posséder le démon Docker. Elle peut aussi héberger les services de persistance de données, mais nous conseillons de les mettre sur une autre machine dans une configuration de production.

### Configuration matérielle

Ce service a été testé sous Linux (Ubuntu 16.04) et nous conseillons fortement ce système d'exploitation, d'autant plus si l'installation se fait avec Docker. Le service n'a pas besoin de beaucoup de ressources de calcul, mais plutôt de mémoire et d'entrée sortie. La configuration recommandée est la suivante :
 * Au moins 2 coeurs, 4 si les base de données tournent sur la même machine
 * 4 Go de RAM, 16 si les base données tournent sur la même machine. Cette quantité peut être plus importante si l'on souhaite stocker des volumes importants. Dans ce cas nous conseillons d'installer ElasticSearch sur une autre machine avec plus de mémoire vive, ou de faire un cluster sur plusieurs machines.
 * 50 Go de disque dur, de type SSD. Cette quantité peut être plus importante suivant le volume de données que l'on souhaite gérer.
 * 100 Mbits de bande passante au minimum, que ce soit en montant ou en descendant.

### Docker

L'installation de Docker se fait assez facilement sur différentes plateformes, la documentation étant complète et précise. Il faut d'abord installer le démon Docker, les instructions se trouvent [à cette page](https://docs.docker.com/engine/installation/). L'image docker peut être lancé directement, mais nous conseillons aussi d'installer [docker-compose](https://docs.docker.com/compose/install/) pour avoir vision plus clair de la configuration du lancement de l'image.

### MongoDB

Le service nécessite MongoDB 3.4 ou supérieur pour persister ses données. MongoDB peut être [installé de différentes manières](https://docs.mongodb.com/v3.4/installation/) et cette installation est optionnelle si vous choisissez de faire tourner la base sur la même machine avec Docker.

### ElasticSearch

Le service nécessite ElasticSearch 5.0. Nous sommes entrain d'étudier une migration vers la version 6.0 donc les informations décrites ici sont susceptibles d'évoluer. Les instruction d'installation sont [disponibles ici](https://www.elastic.co/guide/en/elasticsearch/reference/5.0/install-elasticsearch.html). Comme MongoDB, cette installation est optionnelle si vous choisissez de faire tourner le système d'indexation sur la même machine avec Docker.

### Annuaire d'utilisateurs

## Installation

L'installation se fait avec docker-compose en créant un fichier `docker-compose.yml` et en lançant dans le même dossier la commande suivante :

```
docker-compose up -d
```

Le contenu du fichier `docker-compose.yml` dépend du fait que vous fassiez tourner les services de persistance sur la même machine avec Docker ou non et nous proposons 2 ocnfigurations dans les sections suivante.

Le service peut être arrété avec la commande :

```
docker-compose stop
```

La mise à jour s'effectue en mettant à jour les versions de services dans le fichier `docker-compose.yml` et en lançant les 2 commandes suivantes :

```
docker-compose pull
docker-compose up -d
```

Pur plus d'informations sur les commandes disponibles, vous pouvez [consulter la documentation](https://docs.docker.com/compose/).

### Installation globale

Le contenu du fichier `docker-compose.yml` est le suivant (vous pouvez bien sûr l'adapter suivant votre environnement) :

```
version: '2'
services:
  accessible-data:
    image: koumoul/accessible-data:0.1.0
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
