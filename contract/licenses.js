// initialized based on https://www.data.gouv.fr/api/1/datasets/licenses/
// we removed other-* generic licenses
// we replaced url with href to match our dataset.license and settings.licenses contracts
export default [
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'okd_compliant',
      'domain_content'
    ],
    id: 'cc-by',
    maintainer: null,
    title: 'Creative Commons Attribution',
    href: 'http://www.opendefinition.org/licenses/cc-by'
  },
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'okd_compliant',
      'domain_content'
    ],
    id: 'cc-by-sa',
    maintainer: null,
    title: 'Creative Commons Attribution Share-Alike',
    href: 'http://www.opendefinition.org/licenses/cc-by-sa'
  },
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'domain_data',
      'okd_compliant',
      'domain_content',
      'domain_software'
    ],
    id: 'cc-zero',
    maintainer: null,
    title: 'Creative Commons CCZero',
    href: 'http://www.opendefinition.org/licenses/cc-zero'
  },
  {
    alternate_titles: [
      'LO/OL'
    ],
    alternate_urls: [
      'https://www.etalab.gouv.fr/wp-content/uploads/2014/05/Open_Licence.pdf'
    ],
    flags: [
      'domain_data',
      'okd_compliant',
      'domain_content'
    ],
    id: 'fr-lo',
    maintainer: null,
    title: 'Licence Ouverte / Open Licence',
    href: 'https://www.etalab.gouv.fr/wp-content/uploads/2014/05/Licence_Ouverte.pdf'
  },
  {
    alternate_titles: [
      'License Etalab',
      'License Etalab v2',
      'License Etalab v2.0',
      'Licence Ouverte (Etalab)',
      'License Ouverte',
      'Licence Ouverte v2',
      'Licence Ouverte v2.0',
      'Licence Ouverte v2.0 (Etalab)',
      'Licence Ouverte version 2.0',
      'Open Licence v2',
      'Open Licence v2.0',
      'Open Licence version 2.0',
      'Licence Ouverte / Open Licence v2',
      'Licence Ouverte / Open Licence v2.0',
      'etalab-2.0'
    ],
    alternate_urls: [
      'https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf',
      'https://github.com/etalab/Licence-Ouverte/blob/master/LO.md'
    ],
    flags: [
      'domain_data',
      'okd_compliant',
      'domain_content'
    ],
    id: 'lov2',
    maintainer: null,
    title: 'Licence Ouverte / Open Licence version 2.0',
    href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence'
  }, /*,  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'generic'
    ],
    id: 'notspecified',
    maintainer: null,
    title: 'License Not Specified',
    href: null
  } */
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'domain_data',
      'okd_compliant'
    ],
    id: 'odc-by',
    maintainer: null,
    title: 'Open Data Commons Attribution License',
    href: 'http://opendatacommons.org/licenses/by/summary/'
  },
  {
    alternate_titles: [
      'Open Database License (ODbL) 1.0',
      'Open Data Commons Open Database License 1.0',
      'Open Database License'
    ],
    alternate_urls: [
      'https://opendefinition.org/licenses/odc-odbl'
    ],
    flags: [
      'domain_data',
      'okd_compliant'
    ],
    id: 'odc-odbl',
    maintainer: null,
    title: 'Open Data Commons Open Database License (ODbL)',
    href: 'http://opendatacommons.org/licenses/odbl/summary/'
  },
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'domain_data',
      'okd_compliant'
    ],
    id: 'odc-pddl',
    maintainer: null,
    title: 'Open Data Commons Public Domain Dedication and Licence (PDDL)',
    href: 'http://opendatacommons.org/licenses/pddl/summary/'
  }/*,
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'okd_compliant',
      'generic',
      'domain_content'
    ],
    id: 'other-at',
    maintainer: null,
    title: 'Other (Attribution)',
    href: null
  },
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'okd_compliant',
      'generic',
      'domain_content'
    ],
    id: 'other-open',
    maintainer: null,
    title: 'Other (Open)',
    href: null
  },
  {
    alternate_titles: [],
    alternate_urls: [],
    flags: [
      'okd_compliant',
      'generic',
      'domain_content'
    ],
    id: 'other-pd',
    maintainer: null,
    title: 'Other (Public Domain)',
    href: null
  } */
]
