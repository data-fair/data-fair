## Développement d'une nouvelle application

N'importe qui peut développer une nouvelle application compatible. Les applications elles aussi sont mises à disposition sous forme de services : ce sont des applications Web disponibles en ligne. Une instance de Data FAIR fait office de proxy vers les applications configurées et les réexpose en leur communiquant les informations de contexte nécessaires à l'intéropérabilité. Pour pouvoir être intégrée dans une instance Data FAIR, une application doit exposer certaines informations.

### Exposition des informations

Une application expose un fichier HTML, typiquement un fichier `ìndex.html` à sa racine. Ce fichier doit contenir certaines informations, renseignées dans des balise de la section HEAD :
 * **tittle** : Le titre de l'application, dans une balise title.
 * **description** : La description de l'application, dans une balise meta.
 * **configuration** : Un lien vers la page de configuration de l'application. Le formalisme des balises à utiliser n'a pas encore été défini, ce lien peut aussi apparaître directement dans la page (lien a.href dans le body).

### Informations de contexte

Les applications ont besoin d'avoir accès à certaines informations pour bien fonctionner dans le contexte de votre instance Data FAIR : quels jeux de données ou APIs utiliser, comment authentifier les utilisateurs, etc. Ces informations sont transmises à l'aide de headers HTTP que le serveur de l'application interprète. Les headers suivant sont transmis par le service :
 * **X-Exposed-Url** : URL d'exposition de l'application
 * **X-Application-Url** : URL à utiliser pour connaître le propriétaire de l'application, les droits de l'utilisateur courant (pour par exemple masquer / afficher un bouton de configuration). En rajoutant */config* au bout de cette URL, on peut enregistrer / lire la configuration de l'application
 * **X-Directory-Url** : URL de l'annuaire, qui implémente le même contrat que [simple-directory](https://github.com/koumoul-dev/simple-directory)
 * **X-API-Url** : URL de l'API de ce service, ce qui permet ensuite d'accéder aux services distants et aux datasets

### Authentification

L'application doit utiliser le même mécanisme d'authentification que ce service, c'est à dire celui décrit dans [simple-directory](https://github.com/koumoul-dev/simple-directory). A moins de stocker des données supplémentaires, l'application n'utilise le lien vers l'annuaire que pour authentifier et renouveler le jeton d'authentification d'un utilisateur. L'authentification se fait en mettant un lien vers la page appropriée de l'annuaire, tout en renseignant une URL de redirection. Le renouvellement du jeton se fait en utilisant le point d'accès d'API approprié (se référer à la documentation de l'annuaire).

Tous les appels aux APIs Data FAIR doivent contenir les informations d'authentification, typiquement le JWT (Json Web Token) obtenu avec les opérations décrites précédemment, envoyé dans un cookie `id_token`.
