## Conformité et audit

### Données personnelles : un entrepôt sans identités, par construction

L'entrepôt de révisions est indestructible avant échéance — il ne doit donc contenir **aucune donnée personnelle** dont l'effacement pourrait être exigé. C'est garanti par construction, pas par nettoyage :

- le contexte d'une révision enregistre la **catégorie** d'auteur (utilisateur, superadministrateur, traitement interne, propagation, migration), jamais un identifiant individuel ;
- les champs d'attribution individuelle des métadonnées sont exclus du périmètre scellé ;
- l'**imputation individuelle au-delà de la fenêtre d'attribution ci-dessous** vit dans le journal d'activité de la plateforme, qui reste modifiable et est anonymisé lors de la suppression d'un compte utilisateur — le rapprochement par date entre l'historique de révisions et le journal redonne le « qui » tant que le journal le détient.

Une demande d'effacement portant sur un utilisateur n'entre donc jamais en conflit avec l'entrepôt indestructible lui-même : il n'y a rien à y effacer.

### Attribution bornée : une identité individuelle, mais à durée fixe et courte

Quand elle est capturée (écriture authentifiée par une session utilisateur ou une clé d'API), l'identité de l'auteur — identifiant, adresse IP, pays — n'est **pas absente** du dispositif : elle est conservée à part, dans un objet verrouillé **distinct** de la révision, avec sa **propre** fenêtre de rétention, volontairement plus courte que celle de l'historique (180 jours par défaut, contre un an pour l'historique) :

- **base légale** : la journalisation à des fins de sécurité et d'intégrité — exactement le périmètre visé par la doctrine CNIL en la matière (délibération 2021-122 : six mois à un an), avec 180 jours en milieu de fourchette ;
- **effacement** : différé d'au plus 180 jours après l'écriture, et **activement exécuté** par le même mécanisme de purge que celui de l'historique général — jamais prolongé, quelle que soit la durée de vie du jeu de données lui-même ;
- **asymétrie assumée, et volontaire** : l'imputation portée par le journal d'activité est anonymisée **immédiatement** à la suppression d'un compte utilisateur, tandis que cette attribution bornée subsiste jusqu'à 180 jours après l'écriture **indépendamment** d'une suppression de compte ultérieure — c'est précisément ce qui la rend infalsifiable pendant sa fenêtre. Cette asymétrie doit être explicitée dans la politique de confidentialité / le contrat de sous-traitance des données (**action à mener côté exploitant, hors du périmètre de cette fonctionnalité**) ;
- **droit d'accès (article 15)** : une demande d'accès est satisfaite par la clause de journalisation standard — « les données d'attribution sont conservées au maximum 180 jours à des fins d'intégrité » — sans qu'un index dédié par utilisateur soit nécessaire ni construit à ce stade ;
- **minimisation** : identifiant seul, jamais nom ni courriel ; adresse IP et localisation géographique grossière uniquement quand la plateforme dispose d'une source fiable pour ces informations ; aucune donnée de substitution n'est stockée en absence d'information réelle.

### Rétention de l'historique : une fenêtre documentée, auto-exécutée

La fenêtre de rétention de l'historique (un an par défaut — distincte de la fenêtre d'attribution ci-dessus, plus courte et non renouvelée) est à la fois l'horizon de protection et le **délai maximal entre la suppression d'une ressource et l'effacement complet de son historique**. Ce choix s'appuie sur les référentiels usuels : haut de la fourchette CNIL pour la journalisation (délibération 2021-122 : six mois à un an, extensible sur justification), durée plancher recommandée par l'ANSSI (PA-022 : au moins douze mois), et doctrine CNIL de l'effacement différé pour les stockages non modifiables — cycle fini documenté, purge automatique à échéance, aucune reredistribution des données expirées. La purge est un mécanisme actif de la plateforme, testé, et non une règle d'infrastructure implicite : l'engagement « effacé au plus tard une fenêtre après la suppression » est tenu par un dispositif dont la plateforme est responsable.

L'unité d'effacement anticipé reste le **compte** (organisation) : comme pour les sauvegardes globales, la suppression d'une organisation est honorée à l'issue de la fenêtre — un délai d'attente borné et contractualisable, identique à celui déjà pratiqué pour les sauvegardes.

### Traçabilité pour l'audit

- **Le registre est l'entrepôt lui-même** : l'historique de révisions se reconstitue depuis le stockage seul, sans faire confiance à la base de données de la plateforme — c'est précisément ce que le verdict de cohérence vérifie en continu.
- **Alerte et supervision** passent par le système d'événements standard de la plateforme : les administrateurs s'abonnent aux alertes d'intégrité comme aux autres notifications, et les événements sont réémis périodiquement tant qu'un état anormal persiste.
- **Accès d'audit** : par défaut, l'accès aux révisions est servi par la plateforme, sous son contrôle d'accès (administrateurs du compte en lecture, superadministrateur pour les actions). Pour un audit exigeant une vérification *sans faire confiance à la plateforme*, le fournisseur de stockage cible permet de délivrer des accès en lecture seule restreints au périmètre du compte audité — une modalité manuelle, à la demande.

### Points d'attention pour l'évaluateur

- La force de la garantie dépend du **mode conformité du stockage** : le déploiement doit utiliser un fournisseur le supportant réellement (vérifié sur le fournisseur cible de la plateforme) ; un stockage sans verrouillage ramènerait la fonctionnalité à une simple journalisation.
- La fenêtre de rétention est **extensible mais jamais réductible rétroactivement** : l'allonger est une décision d'exploitation réversible seulement pour les nouvelles révisions ; c'est un engagement à assumer dans la durée, notamment vis-à-vis du délai d'effacement.
- Le **coût de stockage** de l'historique est décompté du quota du compte, y compris pendant la période où l'historique d'un jeu supprimé s'efface progressivement.
