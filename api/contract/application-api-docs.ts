import type { Application, Settings } from '#types'

import config from '#config'
import { resolvedSchema as applicationSchema } from '../types/application/index.ts'
import { resolvedSchema as appConfigSchema } from '../types/app-config/index.js'
import journalSchema from './journal.js'
import { apiDoc as permissionsDoc } from '../src/misc/utils/permissions.ts'
import pJson from './p-json.js'

type ApplicationApiDocsInfo = NonNullable<Settings['info']>

/** Wraps a description into a text/plain OpenAPI response object. */
const textPlainResponse = (description: string) => ({
  description,
  content: {
    'text/plain': { schema: { type: 'string' } }
  }
})

/** Builds the per-application OpenAPI documentation served at /applications/{id}/api-docs.json. */
export default (application: Application, info: ApplicationApiDocsInfo, publicUrl: string = config.publicUrl) => {
  const errorResponses = {
    400: { $ref: '#/components/responses/BadRequest' },
    401: { $ref: '#/components/responses/Unauthorized' },
    403: { $ref: '#/components/responses/Forbidden' },
    404: { $ref: '#/components/responses/NotFound' }
  }
  const readErrorResponses = {
    401: { $ref: '#/components/responses/Unauthorized' },
    403: { $ref: '#/components/responses/Forbidden' },
    404: { $ref: '#/components/responses/NotFound' }
  }

  const api = {
    openapi: '3.1.0',
    info: {
      title: `API de l'application : ${application.title || application.id}`,
      version: pJson.version,
      termsOfService: config.info.termsOfService,
      contact: { ...(info.contact || {}) }
    },
    components: {
      schemas: { application: applicationSchema },
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-apiKey'
        },
        sdCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'id_token'
        }
      },
      responses: {
        BadRequest: textPlainResponse('Requête invalide : corps de requête mal formé, paramètres manquants ou contraintes métier non respectées.'),
        Unauthorized: textPlainResponse("Non authentifié : aucune session ni clé d'API valide n'a été fournie."),
        Forbidden: textPlainResponse("Permissions insuffisantes pour effectuer cette opération sur l'application."),
        NotFound: textPlainResponse("L'application (ou la ressource associée) n'existe pas.")
      }
    },
    security: [{ apiKey: [] }, { sdCookie: [] }],
    servers: [{
      url: `${publicUrl}/api/v1/applications/${application.id}`,
      description: `Application Data Fair - ${new URL(publicUrl).hostname} - ${application.title}`
    }],
    paths: {
      '/': {
        get: {
          summary: 'Lire les informations',
          description: "Récupérer les informations de l'application.",
          operationId: 'readDescription',
          'x-permissionClass': 'read',
          tags: ['Configuration'],
          responses: {
            200: {
              description: "Les informations de l'application.",
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...readErrorResponses
          }
        },
        patch: {
          summary: "Modifier l'application",
          description: "Mettre à jour les informations de l'application.",
          operationId: 'writeDescription',
          'x-permissionClass': 'write',
          tags: ['Configuration'],
          requestBody: {
            description: "Les informations de l'application.",
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/application' }
              }
            }
          },
          responses: {
            200: {
              description: "Les informations de l'application.",
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/application' }
                }
              }
            },
            ...errorResponses
          }
        },
        delete: {
          summary: "Supprimer l'application",
          description: 'Supprimer cette application.',
          operationId: 'delete',
          'x-permissionClass': 'admin',
          tags: ['Configuration'],
          responses: {
            204: {
              description: 'Application supprimée.'
            },
            ...readErrorResponses
          }
        }
      },
      '/configuration': {
        get: {
          summary: 'Lire la configuration actuelle',
          description: "Récupérer la configuration de l'application.",
          operationId: 'readConfig',
          'x-permissionClass': 'read',
          tags: ['Paramétrage'],
          responses: {
            200: {
              description: "La configuration de l'application.",
              content: {
                'application/json': {
                  schema: appConfigSchema
                }
              }
            },
            ...readErrorResponses
          }
        },
        put: {
          summary: 'Modifier la configuration',
          description: "Mettre à jour la configuration de l'application.",
          operationId: 'writeConfig',
          'x-permissionClass': 'write',
          tags: ['Paramétrage'],
          requestBody: {
            description: "La configuration de l'application.",
            required: true,
            content: {
              'application/json': {
                schema: appConfigSchema
              }
            }
          },
          responses: {
            200: {
              description: "La configuration modifiée de l'application.",
              content: {
                'application/json': {
                  schema: appConfigSchema
                }
              }
            },
            ...errorResponses
          }
        }
      },
      '/configuration-draft': {
        get: {
          summary: 'Lire le brouillon',
          description: "Récupérer le brouillon de la configuration de l'application.",
          operationId: 'readConfigDraft',
          'x-permissionClass': 'read',
          tags: ['Paramétrage'],
          responses: {
            200: {
              description: "Le brouillon de la configuration de l'application.",
              content: {
                'application/json': {
                  schema: appConfigSchema
                }
              }
            },
            ...readErrorResponses
          }
        },
        put: {
          summary: 'Modifier le brouillon',
          description: "Mettre à jour le brouillon de la configuration de l'application.",
          operationId: 'writeConfigDraft',
          'x-permissionClass': 'write',
          tags: ['Paramétrage'],
          requestBody: {
            description: "Le brouillon de la configuration de l'application.",
            required: true,
            content: {
              'application/json': {
                schema: appConfigSchema
              }
            }
          },
          responses: {
            200: {
              description: "Le brouillon de la configuration modifié de l'application.",
              content: {
                'application/json': {
                  schema: appConfigSchema
                }
              }
            },
            ...errorResponses
          }
        },
        delete: {
          summary: 'Supprimer le brouillon',
          description: "Annuler le brouillon de la configuration de l'application et revenir à la configuration actuelle.",
          operationId: 'deleteConfigDraft',
          'x-permissionClass': 'write',
          tags: ['Paramétrage'],
          responses: {
            204: {
              description: 'Brouillon de la configuration supprimé.'
            },
            ...readErrorResponses
          }
        }
      },
      '/base-application': {
        get: {
          summary: "Lire l'application de base",
          description: "Récupérer les informations de l'application de base (le composant front-end exécuté) à partir de laquelle cette application a été configurée.",
          operationId: 'readBaseApp',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          parameters: [{
            in: 'query',
            name: 'html',
            description: "Si <code>true</code>, certains champs textuels (description, etc.) sont renvoyés sous forme de HTML rendu plutôt qu'en Markdown brut.",
            required: false,
            schema: { type: 'boolean' }
          }],
          responses: {
            200: {
              description: "Les informations de l'application de base associée.",
              content: {
                'application/json': {
                  schema: { type: 'object' }
                }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/api-docs.json': {
        get: {
          summary: 'Obtenir la documentation OpenAPI',
          description: "Accéder à la documentation de l'application au format OpenAPI v3.",
          operationId: 'readApiDoc',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: "La documentation de l'API.",
              content: {
                'application/json': {
                  schema: {
                    type: 'object'
                  }
                }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/journal': {
        get: {
          summary: 'Lister les événements',
          description: "Lister les événements du journal de l'application.",
          operationId: 'readJournal',
          'x-permissionClass': 'readAdvanced',
          tags: ['Informations'],
          responses: {
            200: {
              description: "Le journal d'événements de l'application.",
              content: {
                'application/json': {
                  schema: journalSchema
                }
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/capture': {
        get: {
          summary: 'Générer une capture PNG',
          description: "Générer une capture d'écran de l'application.",
          operationId: 'readCapture',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: "La capture d'écran générée.",
              content: {
                'image/png': {}
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/print': {
        get: {
          summary: 'Générer une impression PDF',
          description: "Générer une impression PDF de l'application.",
          operationId: 'readPrint',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: 'Le PDF généré.',
              content: {
                'application/pdf': {}
              }
            },
            ...readErrorResponses
          }
        }
      },
      '/thumbnail': {
        get: {
          summary: "Récupérer la vignette de l'application",
          description: "Récupérer la vignette de l'image associée à l'application, redimensionnée pour servir d'aperçu.",
          operationId: 'readThumbnail',
          'x-permissionClass': 'read',
          tags: ['Informations'],
          responses: {
            200: {
              description: "La vignette de l'application.",
              content: {
                'image/*': {}
              }
            },
            401: { $ref: '#/components/responses/Unauthorized' },
            403: { $ref: '#/components/responses/Forbidden' },
            404: textPlainResponse("L'application n'existe pas ou ne possède pas d'image associée.")
          }
        }
      },
      '/attachments': {
        post: {
          summary: 'Charger une pièce jointe',
          description: "Charger une pièce jointe dans les métadonnées.\n\n**Attention** : il faut ensuite ajouter la pièce jointe aux informations de l'application via la route `writeDescription` pour qu'elle soit répertoriée.",
          operationId: 'postAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          requestBody: {
            description: 'La pièce jointe à charger.',
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    attachment: {
                      type: 'string',
                      format: 'binary'
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'La pièce jointe a correctement été chargée.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      mimetype: { type: 'string' },
                      name: { type: 'string' },
                      size: { type: 'integer' },
                      updatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            },
            ...errorResponses,
            413: textPlainResponse('Quota de stockage dépassé ou fichier trop volumineux.')
          }
        }
      },
      '/attachments/{attachmentId}': {
        parameters: [{
          in: 'path',
          name: 'attachmentId',
          description: 'Identifiant (chemin relatif) de la pièce jointe.',
          required: true,
          schema: {
            title: 'Identifiant de la pièce jointe.',
            type: 'string'
          }
        }],
        get: {
          summary: 'Télécharger une pièce jointe',
          description: 'Télécharger une pièce jointe des métadonnées.',
          operationId: 'downloadAttachment',
          'x-permissionClass': 'read',
          tags: ['Métadonnées'],
          responses: {
            200: {
              description: 'Le fichier de la pièce jointe.'
            },
            ...readErrorResponses
          }
        },
        delete: {
          summary: 'Supprimer une pièce jointe',
          description: "Supprimer une pièce jointe des métadonnées.\n\n**Attention** : il faut ensuite supprimer la pièce jointe des informations de l'application via la route `writeDescription` pour qu'elle ne soit plus répertoriée.",
          operationId: 'deleteAttachment',
          'x-permissionClass': 'write',
          tags: ['Métadonnées'],
          responses: {
            204: {
              description: 'La pièce jointe a été supprimée.'
            },
            ...readErrorResponses
          }
        }
      },
      '/permissions': structuredClone(permissionsDoc)
    },
    tags: [
      { name: 'Configuration' },
      { name: 'Paramétrage' },
      { name: 'Informations' },
      { name: 'Métadonnées' },
      { name: 'Permissions' }
    ],
    externalDocs: {
      description: 'Documentation sur GitHub',
      url: 'https://data-fair.github.io/master/'
    }
  }
  return api
}
