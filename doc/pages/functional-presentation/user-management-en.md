---
title: User Management
section: 3
subsection : 4
description : User Management
published: true
---
By default, there are four different roles: User, Contributor, Admin, and Super Admin.

**Super administrators** of the platform can manage all the organizations, members and all the content of the platform. They have the possibility to configure the visualizations available, publish the portals on particular domain names, configure the periodic processing, or define which are the master data sets. It is planned to transfer the management of the last two elements to the administrators of the organizations in the near future.

The other 3 roles are defined by organization: it is for example possible to be *administrator* in one organization and simple *user* in another.

### Roles and associated permissions

Organization admins can manage members:

* **Invite** new members by email
* **Change** member roles
* **Exclude** a member

<p></p>
Default permissions of the different roles of an organization:

| Actions                              | User | Contributor | Admin |
|--------------------------------------|:-----------:|:------------:|:--------------:|
| Add a dataset            |             |       x      |        x       |
| Read a dataset          |      x      |       x      |        x       |
| Edit a datase     |             |       x      |        x       |
| Administration of a dataset  |             |              |        x       |
| Add a visualization            |             |       x      |        x       |
| Read a visualization         |      x      |       x      |        x       |
| Edit a visualization          |             |       x      |        x       |
| Administration of a visualization |             |              |        x       |
| Acces and Change Settings |             |              |        x       |
| Create and modify the portal |             |              |        x       |

### Departments

In addition to their role, users can be assigned to a department of the organization. This allows a **form of partitioning** and to have groups of users who each manage their data on their side. Users who are not restricted to a department can see (or edit if they have a *contributor* or *administrator* role) all resources in the organization.

A *contributor* of a department can only update the datasets of this department, and when he creates a dataset, it is attached to his department. Similarly, an administrator attached to a department can only publish datasets on a portal attached to his department. On the other hand, a global administrator of the organization can publish this same dataset on a portal more global to the organization.
