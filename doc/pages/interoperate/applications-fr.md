## Développement d'une nouvelle application

N'importe qui peut développer une nouvelle application compatible. Les applications elles aussi sont mises à disposition sous forme de services : ce sont des applications Web disponibles en ligne. Une instance de Data FAIR fait office de proxy vers les applications configurées et les réexpose en leur communiquant les informations de contexte nécessaires à l'intéropérabilité. Pour pouvoir être intégrée dans une instance Data FAIR, une application doit exposer certaines informations.

Pour un exemple d'application vous pouvez consulter le [code source de data-fair-charts](https://github.com/koumoul-dev/data-fair-charts).

### Métadonnées essentielles

Une application expose un fichier HTML, typiquement un fichier `ìndex.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balises de la section HEAD :
 * **tittle** : Le titre de l'application, dans une balise title.
 * **description** : La description de l'application, dans une balise meta.

### Gestion des configurations

Une application doit donner à Data FAIR le moyen de créer et éditer des configurations cohérentes avec ses besoins. Pour cela nous proposons deux méthodes. Dans la mesure du possible nous recommandons la première.

La première méthode est de servir à la racine de l'application un fichier config-schema.json. Ce fichier est un schéma JSON qui décrit le format de configuration attendu. Ce schéma peut être enrichi d'annotations qui vont permettre à Data FAIR de créer automatiquement un formulaire avec la librairie [vuetify-jsonschema-form](https://github.com/koumoul-dev/vuetify-jsonschema-form). C'est la méthode utilisée par notre application d'exemple data-fair-charts.

La deuxième méthode est d'exposer une page Web au chemin /config de l'application. Cette page sera intégrée en iFrame dans Data FAIR.

### Informations de contexte

#### Côté client

Par simplicité nous privilégions des applications statiques déployables sur un simple serveur Web comme notre application exemple data-fair-charts. Pour ces applications nous avons prévu un mécanisme simple de transmission des informations contextuelles.

Le proxy Data FAIR cherche dans le contenu HTML qui transite la chaîne de caractère %APPLICATION% et la remplace par la configuration d'application complète au format JSON. Le code Javascript peut donc récupérer cet objet et l'utiliser pour effectuer un rendu adapté et consommer l'API de Data FAIR en conséquence.

#### Côté serveur

Il est aussi possible de développer une application avec rendu côté serveur. Dans ce cas le mode de transmission des informations contextuelles est différent.

Ces informations sont transmises à l'aide de headers HTTP que le serveur de l'application interprète. Les headers suivant sont transmis par le service :
 * **X-Exposed-Url** : URL d'exposition de l'application
 * **X-Application-Url** : URL à utiliser pour connaître le propriétaire de l'application, les droits de l'utilisateur courant (pour par exemple masquer / afficher un bouton de configuration). En rajoutant */config* au bout de cette URL, on peut enregistrer / lire la configuration de l'application
 * **X-API-Url** : URL de l'API de ce service, ce qui permet ensuite d'accéder aux services distants et aux datasets
