Cette application expose des services Web et interopère avec d'autres applications du même type. Pour comprendre comment ce *DataFair* fonctionne, vous pouvez aller voir la [description technique](https://koumoul-dev.github.io/data-fair/about/technical-overview).

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

Le service nécessite ElasticSearch 6.0 avec le plugin ingest-attachment. Les instruction d'installation sont [disponibles ici](https://www.elastic.co/guide/en/elasticsearch/reference/6.0/install-elasticsearch.html).

**Installer ElasticSearch manuellement est optionnel**, vous pouvez opter pour une installation globale de tous les services avec Docker (voir plus bas).

### Annuaire d'utilisateurs

Le service nécessite [Simple Directory](https://koumoul-dev.github.io/simple-directory/) pour sa gestion des comptes.

**Installer Simple Directory individuellement est optionnel**, vous pouvez opter pour une installation globale de tous les services avec Docker (voir plus bas).

## Installation recommandée

Pour une installation avec docker-compose vous devez créer un fichier `docker-compose.yml`. Ci-dessous un exemple qui lance non seulement le service data-fair, mais aussi toutes ses dépendances et un proxy HTTP en frontal. Cet exemple peut être assez complet pour une mise en production simple sur une machine, nous allons détailler son paramétrage dans les sections suivantes:

```yaml
version: '3'
services:

  #########################
  # Dynamic reverse proxy
  #########################

  traefik:
    image: traefik:1.7
    command:
      - "--docker.exposedbydefault=false"
      - "--forwardingtimeouts.dialtimeout=5m"
    restart: always
    ports:
      - 80:80
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  redirect-root:
    image: cusspvz/redirect
    restart: always
    labels:
      - "traefik.enable=true"
      - "traefik.frontend.rule=Path:/"
    environment:
      - REDIRECT=${PROTOCOL}://${DOMAIN}/data-fair
      - REDIRECT_TYPE=redirect

  #########################
  # HTTP services
  #########################

  data-fair:
    image: koumoul/data-fair:0
    restart: always
    volumes:
      - data-fair-data:/webapp/data
    labels:
      - "traefik.enable=true"
      - "traefik.frontend.rule=PathPrefixStrip:/data-fair/"
    environment:
      - PUBLIC_URL=${PROTOCOL}://${DOMAIN}/data-fair
      - DIRECTORY_URL=${PROTOCOL}://${DOMAIN}/simple-directory
      - PRIVATE_DIRECTORY_URL=http://simple-directory:8080
      - OPENAPI_VIEWER_URL=${PROTOCOL}://${DOMAIN}/api-doc/
      - THUMBOR_URL=${PROTOCOL}://${DOMAIN}/thumbor/
      - THUMBOR_KEY=${SECRET}
      - MONGO_URL=mongodb://mongo:27017/data-fair
      - ES_HOST=elasticsearch:9200

  simple-directory:
    image: koumoul/simple-directory:1
    restart: always
    volumes:
      - simple-directory-security:/webapp/security
    labels:
      - "traefik.enable=true"
      - "traefik.main.frontend.rule=PathPrefixStrip:/simple-directory"
      - "traefik.main.port=8080"
      - "traefik.maildev.frontend.rule=PathPrefixStrip:/mails"
      - "traefik.maildev.port=1080"
      - "traefik.maildev.frontend.auth.basic.users=${MAILDEV_BASIC}"
    environment:
      - PUBLIC_URL=${PROTOCOL}://${DOMAIN}/simple-directory
      - STORAGE_MONGO_URL=mongodb://mongo:27017/simple-directory
      - ADMINS=${ADMINS}
      - HOME_PAGE=${PROTOCOL}://${DOMAIN}
      - MAILS_TRANSPORT=${MAILS_TRANSPORT}
      - MAILDEV_ACTIVE=${MAILDEV}
      - MAILDEV_URL=${PROTOCOL}://${DOMAIN}/mails/

  openapi-viewer:
    image: koumoul/openapi-viewer:1
    restart: 'always'
    labels:
      - "traefik.enable=true"
      - "traefik.frontend.rule=PathPrefixStrip:/api-doc/"

  thumbor:
    image: apsl/thumbor:6.4.2
    restart: 'always'
    environment:
      - SECURITY_KEY=${SECRET}
      - STORAGE_EXPIRATION_SECONDS=600
      - MAX_AGE=600
    labels:
      - "traefik.enable=true"
      - "traefik.frontend.rule=PathPrefixStrip:/thumbor/"

  #########################
  # Dependencies
  #########################

  elasticsearch:
    image: koumoul/data-fair-elasticsearch:latest
    restart: always
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    environment:
      - discovery.type=single-node

  mongo:
    image: mongo:4.0
    restart: always
    volumes:
      - mongo-data:/data/db

volumes:
  data-fair-data:
  simple-directory-security:
  elasticsearch-data:
  mongo-data:

```

Récupérer les dernières versions des images compatibles:

```sh
docker-compose pull
```

Configurez quelques variables d'environnement nécessaires:

```sh
export ADMINS='["alban.mouton@koumoul.com"]'
export SECRET=type some random string here
```

### Variante 1 : HTTP local avec envoi de mail virtuel

Cette variante est utile pour se faire la main sur la logique de déploiement et tester.

Créez une paire identifiant / mot de passe pour la protection de la boite mail locale:

```sh
export MAILDEV_BASIC="$(htpasswd -nbm user passwd)"
```

Configurez les autres variables d'environnement puis lancez les services:

```sh
export MAILDEV=true
export PROTOCOL=http
export DOMAIN=localhost
```

Lancez les services:

```sh
docker-compose up -d --force-recreate
```

Vérifiez l'état des services:

```sh
docker-compose ps
```

Quand tous les services sont "Up" vous pouvez accéder à [http://localhost](http://localhost).
Pour créer des comptes vous aurez besoin d'accéder à la boite mail virtuelle [http://localhost/mails](http://localhost/mails) protégée par identifiant = user et mot de passe = passwd.

### Variante 2 : HTTP sur une machine privée et envoi de mails

Cette variante peut suffire pour un usage en intranet par exemple.

Vous pouvez suivre les instructions précédentes. Mais les variables d'environnement sont différentes.

La variable MAILS_TRANSPORT attend un objet JSON de configuration compatible avec la librairie [nodemailer](https://nodemailer.com/smtp/)

```sh
export ADMINS='["alban.mouton@koumoul.com"]'
export MAILDEV=false
export PROTOCOL=http
export DOMAIN=MON NOM DE MACHINE
export MAILS_TRANSPORT='{"service": "Mailgun", "auth": {...}}'
docker-compose up -d --force-recreate
docker-compose ps
```

Et accédez sur "http://MON_NOM_DE_MACHINE".

### Variante 3 : HTTPS sur un serveur

Cette variante est une solution complète de déploiement sécurisé. En pré-requis minimal il faut:

  - une machine virtuelle sur internet sécurisée (firewall, etc.) et disposant d'un démon docker
  - un nom de domaine configuré pour pointer vers l'adresse de cette machine virtuelle

**À venir**

### Mises à jour

La mise à jour s'effectue en lançant les 2 commandes suivantes :

```sh
docker-compose pull
docker-compose up -d
```

Pensez bien à re-définir les variables d'environnement à chaque fois que vous faites cette opération. Pour des changements de versions majeures, vous pouvez avoir besoin de mettre à jour le contenu du fichier docker-compose.yml

Pour plus d'informations sur les commandes disponibles, vous pouvez [consulter la documentation](https://docs.docker.com/compose/).
