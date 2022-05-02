---
title: Row Attachments
section: 4
subsection: 7
updated: 2021-09-20
description: Row Attachments
published: false
---

When you load a dataset, it is possible to associate a zip archive containing PDF, JPG, etc ... files with your dataset. These files can be latter used in visualizations.

In order for your zip file to be correctly associated with your dataset, your dataset and archive must follow these two rules:

1. your dataset must have a column containing the paths and names of the files in the ZIP archive
2. the name of your zip file must match the name column containing the paths of the files in the ZIP archive. Example: You column is **Document**, your file must be **Document.zip**.

<p>
</p>

![PJ-1](./images/user-guide-backoffice/piece-jointe-1.jpg)

In the **Schema** section of your dataset, the concept **Attached digital document** will be automatically associated with the column containing the names of the files of your ZIP archive.

![PJ-2](./images/user-guide-backoffice/piece-jointe-2.jpg)

The attachment indexing time can be long and will depend on the size of your attachments files.   
The unzipped files size is counted in your data storage quota.  

Please do [contact](https://koumoul.com/contact) us if you have any trouble.
