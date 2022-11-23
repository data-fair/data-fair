---
title: Parcours de contribution
section: 3
subsection : 2.5
description : Parcours de contribution
published: false
---

Pour améliorer et encadrer l'expérience des contributeurs des parcours standards leurs sont proposés.

## Créer un jeu de données

```mermaid
flowchart TD
  start([Bouton créer un jeu de données]) --> type{Quel type ?}
  
  %% fichier
  type -- Fichier --> format[Liste des formats supportés]
  format --> file[/Chargement du fichier/]
  file --> fileSize[["Vérification de la taille du fichier<br>propose d'utiliser une archive si pertinent"]]
  fileSize --> file
  file --> attachment[/"Chargement des pièces jointes<br>(optionnel)"/]
  attachment --> params[/Saisie du titre<br>et autres paramètres/]

  %% éditable
  type -- Éditable --> restInit{Quelle<br>initialisation ?}
  restInit -- Vierge --> params
  restInit -- "À partir d'un<br>jeu de données existant" --> restDataset[/Choix du jeu de données/]
  restDataset --> params

  %% virtuel
  type -- Virtuel --> virtualChildren[/Choix de jeux enfants/]
  virtualChildren --> params

  %% métadonnées
  type -- Métadonnées --> params
  params --> conflict[[Vérification doublon potentiel<br>titre, nom de fichier, etc]]

  %% end
  conflict --> confirm{Confirmer ?}
  confirm -- Oui --> import[[Import]]
  import --> dataset([Page du nouveau jeu de données])
  dataset --> worker[["Traitement du jeu de données<br>(analyse, indexation...)"]]
  worker --> dataset

  %% styling
  classDef primary fill:#1E88E5,color:#FFF;
  class start,dataset primary;
```

## Mettre à jour un jeu de données

```mermaid
flowchart TD
  start([Bouton mettre à jour un jeu de données]) --> file[/Chargement de fichier/]
  file --> suggest[Suggestion de jeu de données<br>correspondant au nom de fichier]
  suggest --> choseDataset[/Choix du jeu de données/]
  choseDataset --> datasetDraft[Page du brouillon]
  datasetDraft -- "Étapes de traitement<br>(analyse, indexation...)" --> datasetDraft
  datasetDraft --> draftValidate{Valider le<br>brouillon ?}
  draftValidate -- Annuler --> dataset([Page du jeu de données])
  draftValidate -- Valider --> dataset
```

### Partager un jeu de données sur un portail

```mermaid
flowchart TD
  start([Bouton partager un jeu de données]) --> choseDataset[/Choix du jeu de données/]
  choseDataset --> chosePortal[/Choix du portail/]
  chosePortal -- rôle contrib --> fetchRequiredMetadata[[Récupération des métadonnées<br>obligatoires pour ce portail]]
  chosePortal --> rôle admin --> editPermissions[Édition des permissions]
  editPermissions --> fetchRequiredMetadata
  fetchRequiredMetadata --> editMetadata[Édition des métadonnées]
  editMetadata --> confirm{Confirmer ?}
  confirm -- rôle contrib --> publicationRequested[[Demande de publication<br>envoyée aux administrateurs]]
  publicationRequested --> home([Retour à l'accueil])
  confirm -- rôle admin --> publicationSaved[[Enregistrement de la publication]]
  publicationSaved --> datasetPortal([Page du jeu de données dans le portail])

  %% styling
  classDef primary fill:#1E88E5,color:#FFF;
  class start,datasetPortal,home primary;
```