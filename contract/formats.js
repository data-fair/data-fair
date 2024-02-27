// a mix of some standard formats and some custom formats

module.exports = [
  {
    id: 'time',
    standard: true,
    title: {
      fr: 'Heure',
      en: 'Time'
    },
    description: {
      fr: 'Heure exprimée au format ISO 8601 avec fuseau horaire optionnel',
      en: 'Time expressed in ISO 8601 format with optional time zone'
    }
  },
  {
    id: 'duration',
    standard: true,
    title: {
      fr: 'Durée',
      en: 'Duration'
    },
    description: {
      fr: 'Heure exprimée au format ISO 8601 avec fuseau horaire optionnel',
      en: 'Time expressed in ISO 8601 format with optional time zone'
    }
  },
  {
    id: 'email',
    standard: true,
    title: {
      fr: 'Email',
      en: 'Email'
    },
    description: {
      fr: 'Adresse email',
      en: 'Email address'
    }
  },
  {
    id: 'uri',
    standard: true,
    title: {
      fr: 'URI',
      en: 'URI'
    },
    description: {
      fr: 'Uniform Resource Identifier',
      en: 'Uniform Resource Identifier'
    }
  },
  {
    id: 'df:url',
    title: {
      fr: 'URL',
      en: 'URL'
    },
    description: {
      fr: 'Adresse URL',
      en: 'URL address'
    },
    pattern: '(https?:\\/\\/)?(www\\.)?[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)'
  }
]
