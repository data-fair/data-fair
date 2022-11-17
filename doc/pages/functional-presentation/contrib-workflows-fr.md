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
  classDef terminus fill:#1E88E5,color:#FFF;
  class start,dataset terminus;
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