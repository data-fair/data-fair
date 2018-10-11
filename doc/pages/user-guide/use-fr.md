### Jeux de données

Les jeux de données sont créés à partir de fichiers chargés par les utilisateurs. Dés métadonnées sont rajoutées et complétées par les utilisateurs, ce qui permet de les trouver et réutiliser plus facilement. Les données sont indexées et rendues disponible au travers d'une API Web, ce qui les rend accessibles. Les champs peuvent être décrits avec un vocabulaire sémantique, ce qui permet de mieux comprendre la données et de la rendre plus facilement interopérable.

Les données importées sont pour l'instant de type tabulaire, fait d'autres types de structures seront supportées prochainement, comme par exemple le geoJSON.

### Importer un fichier

Pour l'instant, seul le format CSV est supporté mais d'autres devraient bientôt suivre. Si votre fichier n'est pas dans ce format, vous pouvez le convertir avec votre tableur. Une fois votre fichier à disposition, vous pouvez l'importer en cliquant sur *Importer un fichier* dans la section *Jeux de données*. Une fois le fichier choisi, vous devez déterminer le propriétaire (vous ou l'une des organisations auxquelles vous appartenez). Enfin, si vous avez déjà importé auparavant un fichier avec ce nom pour ce propriétaire, vous pourrez mettre le jeux de données à jour. Dans tous les cas vous pouvez aussi créer un nouveau jeu de données.

### Décrire les métadonnées

Une fois le jeu de données créé par import d'un fichier, il est fortement conseillé de renseigner ses métadonnées : cela permet de le trouver et de le réutiliser plus facilement. Les informations générales sont surtout utiles pour le catalogage, alors que les informations du schéma sont très important pour la réutilisabilité. Les libellés et descriptions des champs apparaîtront sur la vue en table ou dans les infobulles des applications. Le choix de concepts appropriés pour vos champs est ce qui va permettre de réutiliser vos données dans des applications tierces ou de les enrichir avec des services distants.

### Vue tableau

Cette vue permet de naviguer rapidement dans les données et d'en avoir un aperçu. Elle permet de rechercher dans les données à partir d'une requête textuelle, de naviguer dans différentes pages, mais ne permet pas de faire des filtres poussés ou des agrégations. Si vous souhaitez faire ce genre de chose, il vaut mieux configurer une application avec vos données pour le faire.

### Permissions
Voir à la section plus bas correspondante de ce document.

### Enrichissement

Suivant les services distants que vous avez configurés, et les concepts que vous avez assigné aux champs de vos données, il peut être possible d'enrichir les données. On peut par exemple rajouter des champs latitude et longitude si des champs décrivant une adresse sont présents, ou un secteur d'activité si un champ correspond à un SIRET d'un établissement.

### Journal d'activité

Ce journal décrit l'ensemble des activité liées au jeu de données et permet de savoir dans quel état il est. Si la première entrée est *Les données sont indexées, le jeu de données est maintenant disponible*, vous pouvez consulter ou utiliser vos données dans des applications.

### Documentation d'API
Cette documentation est destinée aux développeurs et va leur permettre de bien comprendre comment réutiliser vos données pour les intégrer dans d'autres applications. Cette documentation permet de faire des appels aux différents points d'accès de l'API pour bien comprendre comment elle marche.

## Services distants

Les services distants sont des fonctionnalités externalisées à ce service. Ils permettent par exemple de récupérer des données supplémentaires ou de faire des traitements sur certaines données. Ces services distants sont optionnels pour pouvoir exposer ses données, mais nécessaires si l'on souhaite faire de l'enrichissement ou utiliser certaines applications. Ils se présentent sous la forme d'APIs Web qui peuvent être ouvertes ou fermées, dans le 2e cas il faut alors paramétrer des codes d'accès à ces APIs.

### Importer et configurer l'accès à un service distant
Pour importer un service distant, on peut soit déposer un fichier JSON qui décrit son API, soit rentrer une URL qui pointe vers ce fichier JSON. La description de l'API du service doit être rédigée avec un certain formalisme qui est décrit dans la section [Interopérabilité](interoperate).


## Configurations d'applications

Un aspect essentiel du service et de pouvoir facilement réutiliser les données dans des applications. Ces applications peuvent consommer différents flux de données, du moment qu'ils soient sémantisés et contiennent les informations dons les applications on besoin. Les applications on donc besoin d'être configurées, de stocker leur configuration et on doit facilement pouvoir configurer une application.

Les applications ne sont pas développées dans ce projet : elles peuvent être privées et développées par des éditeurs ou être opensource. Un des prérequis est qu'elles soient accessibles en ligne. Plus précisément, les applications sont des services web réexposés par ce service. La section [Interopérabilité](interoperate) décrit comment concevoir une application pour qu'elle puisse être réutilisée.

### Paramétrage d'une application existante

Pour ajouter une application, il faut connaître son URL d'exposition publique. Typiquement, en visitant cette adresse avec un navigateur web, on arrive sur une page présentant l'application et nous expliquant qu'elle n'est pas configurée. Il faut alors copier l'URL de cette explication et la coller dans l'écran d'ajout d'application de ce service. Après avoir cliqué sur *Suivant*, il faut ensuite renseigner le propriétaire qui peut être l'utilisateur connecté ou une des organisations auxquelles il appartient. Une fois ce choix effectué, un paramétrage pour cette application est créé. L'utilisateur peut accéder à ce paramétrage en cliquant sur le lien de la notification.

Sur l'écran de paramétrage, le titre et la description de l'application sont renseignés avec les valeurs par défaut pour cette application. Ils peuvent être modifiée, par exemple pour identifier que l'application est liée à certaines données. Ces informations sont principalement utilisées dans la vue en liste des paramétrages d'application. A noter qu'**une même application peut être paramétrée plusieurs fois** pour les mêmes utilisateurs / organisations. Les paramétrages peuvent ensuite différer par rapport aux données qu'ils utilisent.

Des boutons d'action en bas de l'écran de paramétrage permettent de réaliser différentes tâches : accès direct à l'application configurée, suppression de l'application et éventuellement accès à l'écran de paramétrage de l'application.


## Contrôles d'accès

Le contrôle d'accès sur les flux de données se fait avec un système de permissions. Il y a des permissions sur les jeux de données, les services distants et les applications. Le niveau de granularité du contrôle d'accès est le fait d'être propriétaire ou non de la ressource (droits sur toutes les opérations liées à cette ressource), ou sinon sur chaque opération unitairement.

### Utilisateurs et Organisations

Le système des permissions repose sur une modélisation assez simple des concepts d'utilisateurs et d'organisations, comme par exemple celui implémenté dans [simple-directory](https://github.com/koumoul-dev/simple-directory) : les utilisateurs peuvent appartenir à plusieurs organisations et une organisation peut contenir plusieurs utilisateurs, il n'y a pas de relations entre les organisations.

Que ce soit au niveau du propriétaire ou des permissions, il y a toujours possibilité de les définir à un niveau unitaire qui est un utilisateur, ou à un niveau de groupe qui est l'organisation. Dans ce 2e cas, tous les membres de l'organisation bénéficient alors de la propriété de la ressource ou de la permission d'accès.

Ce système est simple mais permet de couvrir beaucoup de cas fonctionnels. Il faut cependant faire attention car il peut être dangereux. Il faut notamment bien régler les droits de propriété ou d'écriture et nous conseillons de les garder à un niveau utilisateur, et d'ouvrir des droits de lecture sur des organisations.

### Portée des permissions

L'utilisateur propriétaire ou tous les membres de l'organisation propriétaire peuvent faire toutes les opérations sur la ressource possédée. Pour les autres utilisateurs, la permission est octroyée à un niveau opération. Une opération est un point d'accès exposé par l'API (tierce ou d'un jeu de données). On peut par exemple accorder la permission à quelqu'un de lire la description d'un jeu de données, mais pas les données.


## Paramètres

Des paramètres peuvent être réglés à un niveau utilisateur ou organisation. Pour le moment, ils permettent de régler des webhooks sortants.

### Configuration des Webhooks

Un webhook permet d'envoyer un messsage à un autre service Web quand un évènement se produit. Par exemple quand un jeu de données est mis à jour, il peut être intéressant d'avoir une notification dans un certain canal de communication. Pour configurer un webhook, il faut renseigner 3 champs :
 * Le titre du webhook, en général à quel service il est relié
 * L'URL à appeler, voir dans les sections ci-dessous comment l'obtenir en fonction du service que vous souhaiter connecter
 * La liste des évènements qui vont déclencher un appel vers le service configuré dans l'URL

#### Mattermost

[Mattermost](https://mattermost.com) est un logiciel open source qui permet aux équipes de discuter entre elles pour collaborer. Il est déployé par [Framasoft](https://framasoft.org/) et utilisable gratuitement sur [Framateam](https://framateam.org). La documentation, en anglais, à [cette page](https://docs.mattermost.com/developer/webhooks-incoming.html) décrit comment obtenir l'URL décrite ci dessus pour pouvoir déverser des notifications dans un canal particulier. Une fois l'URL générée dans Mattermost, il ne vous reste plus qu'à la copier dans le champ URL du nouveau Webhook que vous voulez créer.
