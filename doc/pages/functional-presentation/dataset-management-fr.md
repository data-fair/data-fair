---
title: Administration des jeux de données
section: 3
subsection : 1
description : Administration des jeux de données
published: true
---

Les jeux de données permettent de mettre à disposition de l'utilisateur des données, ainsi que des informations sur celles-ci (métadonnées) comme la licence qui leur est associée, la date de mise à jour, leur propriétaire, etc.

<!-- ![Fiche d'un jeu de données](./images/functional-presentation/jeu-2.jpg) -->

### Types de jeux de données

Il existe plusieurs types de jeux de données sur la plateforme&nbsp;: les fichiers, les jeux de données éditables, les jeux de données virtuels et des jeux de données externes.

* Les **jeux de données fichiers** correspondent à des données sous format tabulaire ou cartographique chargées sur la plateforme. Plusieurs formats de fichiers sont supportés, tels que CSV, TSV, OpenDocument, XLS, XLSX, GeoJSON, KML, KMZ, ESRI Shapefile, GPX et iCalendar. Suivant les besoins, de nouveaux formats de fichiers sont régulièrement ajoutés. Quand un fichier est chargé, il est converti en interne dans un format plus standard, puis analysé automatiquement pour déterminer le schéma du jeu de données. Le contributeur peut ensuite modifier ce schéma, par exemple, déterminer qu'une colonne aura sa donnée indexée en tant que chaîne de caractère plutôt que nombre entier.

* Les **jeux de données éditables** sont des données stockées en base et sont plutôt adaptés à des données qui évoluent régulièrement, ou mises à jour par des personnes métier qui veulent juste modifier quelques lignes. La création de ce type de jeu de données se fait en éditant son schéma de données&nbsp;: on définit chaque colonne et son type. Pour des données produites par des systèmes informatiques (données IOT, par exemple), ces jeux de données sont généralement mis à jour par API. Dans le cas de mises à jour manuelles par des agents, cela se fait via un formulaire de saisie.

* Les **jeux de données virtuels** correspondent à des vues d’un ou plusieurs jeux de données. Ils permettent d’avoir un contrôle d’accès plus poussé. Ils peuvent, par exemple, servir à créer une vue publique, restreinte à certaines lignes et certaines colonnes, d’un jeu de données plus complet qui reste privé. Cela permet aussi de faire de l'anonymisation de données. On peut, par exemple, restreindre un jeu de données national à un seul département. L'autre cas d'usage de ce type de jeu de données est d'opérer avec des données millésimées ou territorialisées&nbsp;: on peut ainsi publier des données chaque année via un fichier qui a toujours le même format, puis faire une vue qui regroupe les différentes années.

* Les **jeux de données externes** n'ont pas de données indexées sur la plateforme. Ils permettent de renseigner des métadonnées (titre, description, licence...) et d'y associer des données dans des formats qui ne sont pas exploitables par la plateforme (PDF, archive ZIP...) ou de cataloguer des données présentes sur d'autres plateformes en renseignant un lien dans la description.

### Schéma des données

La plateforme supporte l'indexation de données tabulaires. Chaque jeu de données (excepté les jeux de données externes) possède un schéma qui est la description des différentes colonnes (ou champs) qui le composent. *A minima*, chaque colonne a un identifiant et un type, mais il est possible de renseigner des informations complémentaires.

Un libellé et une description permettent d'avoir des entêtes de colonnes plus lisibles et compréhensibles. Le champ peut avoir un groupe qui permet de le retrouver plus rapidement quand il y a beaucoup de colonnes. Si le champ est de type texte, on peut opter pour du formatage riche&nbsp;: il sera alors possible de mettre du HTML ou Markdown dans ce champ. Le champ peut également être défini comme étant multivalué&nbsp;: dans ce cas, on spécifie le séparateur utilisé dans la colonne entre les différentes valeurs.

<img src="./images/functional-presentation/schema.jpg"
     height="275" style="margin:10px auto;" alt="capture d'écran de l'édition du schéma d'un jeu de données" />

Le dernier élément qui peut être renseigné et qui a une importance considérable est le **type métier** associé au champ. Cela se fait en sélectionnant un **concept issu d'un thésaurus**. Il y a une base de concepts communs à toute la plateforme et il est possible de **rajouter ses propres concepts**. Ceux-ci sont, en général, liés à du vocabulaire issu du Web sémantique, le concept de code postal a, par exemple, l'identifiant `http://schema.org/postalCode`.

Ce typage métier **augmente la réutilisabilité** des données et permet deux choses au sein de la plateforme : **l'enrichissement à partir d'autres données**, et la proposition de **visualisations adaptées** (en simplifiant le paramétrage de celles-ci)&nbsp;: les concepts &laquo;&nbsp;latitude&nbsp;&raquo; et &laquo;&nbsp;longitude&nbsp;&raquo; permettent, par exemple, de paramétrer des cartes avec des marqueurs.

Les valeurs dans les colonnes peuvent être limitées à certaines valeurs à l'aide de la validation des données. Il est possible de rendre la colonne obligatoire, d'avoir une longueur minimale et/ou maximal et de renseigner un format basé sur une expression régulière qui va limiter les valeurs possibles de la colonne.  

<img src="./images/functional-presentation/colonne-obligatoire.jpg"
     height="200" style="margin:10px auto;" alt="capture d'écran de l'édition du schéma d'un jeu de données" />

### Référentiel de schémas

Pour améliorer la saisie et la réutilisation des données, nous proposons un référentiel de schémas issus de https://schema.data.gouv.fr/schemas.html qui recense différents schémas de données publiques pour la France.  

Lors de la création d'un jeu de données éditable, il est possible de choisir un des schémas proposés. Les données saisies seront standardisées, ce qui augmentera leur réutilisabilité, tant au niveau de la remontée de différentes données vers une destination commune pour fusionner les données, que dans l'utilisation de visualisations.  

<img src="./images/functional-presentation/list-schema.jpg"
     height="250" style="margin:20px auto;" alt="Liste de schéma data.gouv.fr" />

Par exemple, une application permettant de rechercher et visualiser des délibérations publiées au format SCDL pourra être utilisée par toute collectivité qui publie ses données de délibérations avec le schéma adapté.

### Métadonnées et pièces jointes

Certaines métadonnées sont préremplies, comme les dates de mise à jour des métadonnées ou des données et l'utilisateur qui les a créées ou modifiées. La page d’édition d’un jeu de données permet de modifier les différentes métadonnées de ce jeu. Il est possible de modifier le titre et la description, de définir une **licence d'utilisation** et d'associer des **thématiques**. Les listes de licences et thématiques utilisables sont communes à toute l'organisation et peuvent être éditées par les administrateurs.

Il est possible d’associer des **pièces jointes à chaque ligne** d’un jeu de données. Cela se fait en associant une archive au format zip qui contient les fichiers à associer. Il faut aussi qu’il y ait dans le jeu de données une colonne contenant les noms des fichiers à associer à chaque ligne. Deux types de fichiers peuvent être liés aux lignes : des images (png, jpg, etc.) ou des documents (pdf, docx, xlsx, etc.) Dans le cas des documents, ils peuvent être indexés **fulltext** par la plateforme pour que les recherches tiennent compte du contenu de ces documents.

Les pièces jointes peuvent aussi être **directement attachées à un jeu de données**. On peut, par exemple, ajouter des fichiers de documentation ou des métadonnées riches. On peut également s'en servir pour publier des données qui ne peuvent pas être indexées par la plateforme dans le cas d'un jeu de données de type externe.

### Données&nbsp;maîtres et enrichissement

Certaines données peuvent être utilisées à différents endroits et dans différents processus par les organisations. Il est possible de définir un jeu de données comme étant des **données&nbsp;maîtres** (*master&nbsp;data*, en anglais). Ce sont des données qui font référence à des concepts particuliers, et la plateforme met à disposition de toutes les organisations des données&nbsp;maîtres mutualisées.  
L'administrateur d'une organisation peut également définir des données privées de son organisation comme des données maîtres. Celles-ci ne pourront être utilisées que par son organisation.

Les données de la **base Sirene** sont rattachées aux concepts de &laquo;&nbsp;code SIREN&nbsp;&raquo;, &laquo;&nbsp;code SIRET&nbsp;&raquo; et &laquo;&nbsp;code APE&nbsp;&raquo;, par exemple. Il y a également des données mises à disposition à partir du **cadastre** (via des &laquo;&nbsp;codes parcelle&nbsp;&raquo;) ou des données de l'INSEE (via les &laquo;&nbsp;codes commune&nbsp;&raquo;, &laquo;&nbsp;codes département&nbsp;&raquo;...) Il y a enfin des données d'adresses, issues de la **BAN**, qui permettent de faire du géocodage. De nouvelles données de référence sont régulièrement ajoutées à la plateforme, et chaque organisation peut elle-même créer ses propres jeux de données pivots.

Ces données&nbsp;maîtres sont d'une grande valeur, car elles permettent de **compléter facilement les autres données**. Dans le cadre des formulaires de saisie des jeux incrémentaux, on peut faire référence à des données&nbsp;maîtres en assignant un concept à un certain champ, et le **formulaire proposera une liste de valeurs** (avec un moteur de recherche si elle est grande) pour sélectionner ce qui sera mis dans le champ. Il est ainsi possible de contraindre la saisie dans un champ et de s'assurer que les valeurs dedans soient toutes valides suivant certaines règles métier.

<img src="./images/functional-presentation/ajout-ligne.jpg"
     height="350" style="margin:10px auto;" alt="Ajout d'une ligne standardisées" />

La deuxième possibilité pour compléter les données est de mettre en place des **enrichissements**&nbsp;: des colonnes sont alors automatiquement ajoutées au jeu de données et les valeurs renseignées à partir d'une ou plusieurs autres colonnes. Par exemple, des colonnes qui ont les concepts &laquo;&nbsp;numéro de rue&nbsp;&raquo;, &laquo;&nbsp;libellé de rue&nbsp;&raquo; et &laquo;&nbsp;code postal&nbsp;&raquo; peuvent être complétées par les données d'adresse et être géocodées, ce qui permet de projeter les données sur une carte. Quand les données sont actualisées, les enrichissements sont automatiquement mis à jour, et un jeu de données peut avoir plusieurs enrichissements provenant de données&nbsp;maîtres différentes.  
L'enrichissement de données sans données de référence est possible à l'aide des **colonnes calculées**. Tout comme un enrichissement classique, un enrichissement de **colonne calculée** va ajouter une nouvelle colonne, mais la source de cet enrichissement va être une ou plusieurs colonnes du jeu de données. Par exemple, si le jeu de données contient des colonnes numéro, type, voie, code postal et nom de la commune et prénom, il va être possible de concaténer ces colonnes en une seule colonne pour obtenir l'adresse.

<img src="./images/functional-presentation/adresse.jpg"
     height="300" style="margin:10px auto;" alt="Concaténer plusieurs colonnes" />

Les données de référence peuvent également être utilisées via les jeux virtuels pour proposer les données de référence sur son portail.
Il est alors possible de créer un jeu virtuel sur le portail de son organisation qui va être une vue du jeu de données de référence. Ainsi, lorsque les données de références seront mises à jour, le jeu virtuel sera également actualisé.  
Les jeux virtuels peuvent posséder des filtres sur les valeurs de colonnes. Il est, par exemple, possible de filtrer les données de la **base Sirene** sur un territoire et sur certains **code APE** pour proposer un jeu de données sur un secteur d'activité de votre territoire. Il sera alors très simple de configurer une visualisation cartographique pour explorer ces données.

### Permissions et publication des données

Un administrateur peut contrôler finement les permissions d’**accès aux données**. Les données ne sont, de base, visibles que par les administrateurs et les contributeurs de l'organisation. Il est ensuite possible de les partager en interne, c'est-à-dire que seuls les membres de l'organisation authentifiés peuvent les consulter, ou de les rendre **publiques**&nbsp;: dans ce cas, tout le monde pourra y accéder, y compris les utilisateurs non enregistrés.

On peut également définir des droits d'accès à certains utilisateurs ou à des organisations partenaires. Un mode avancé permet de définir les permissions pour chaque point d'accès de l'API d'un jeu de données&nbsp;: on peut, par exemple, rendre l'accès aux métadonnées public alors que l'accès aux données reste restreint.

<img src="./images/functional-presentation/permissions.jpg"
     height="250" style="margin:10px auto;" alt="Edition des permissions d'un jeu de données" />

Quand un jeu de données vient d'être créé, il n'est pas encore disponible dans les différents portails de données de l'organisation. Il doit d'abord être **publié dans un ou plusieurs portails**. Dans le cadre de portails open&nbsp;data, le jeu de données doit aussi avoir une permission d'accès public en plus d'être publié.

Ce mécanisme de publication permet de travailler de manière agile&nbsp;: on peut, par exemple, avoir un **portail de recette** sur lequel on publie les jeux de données que l’on souhaite ouvrir prochainement, en les accompagnant de visualisations. Celles-ci peuvent mettre en avant un problème dans les données ou une mauvaise structuration de celles-ci, problème qui peut être vu par plusieurs personnes, car les données sont déjà publiées sur un portail. Une fois que l’on atteint la **qualité de publication souhaitée**, on dépublie le jeu de données du portail de recette et on le publie sur un ou plusieurs portails de production.

<img src="./images/functional-presentation/portail-publication.jpg"
     height="250" style="margin:10px auto;" alt="capture d'écran de la gestion des publications d'un jeu de données sur des portails" />

Il est aussi possible de publier un jeu de données sur des portails ou catalogues de données externes à la plateforme, ceci est décrit plus en détail à la section sur les **connecteurs de catalogues**.

### Journal des événements

Chaque étape du traitement d'un jeu de données laisse des traces dans le journal associé. On peut ainsi retracer les actions, leurs dates, leurs durées et les éventuelles erreurs rencontrées.

### Validation des données
