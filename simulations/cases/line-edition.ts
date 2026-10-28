/**
 * Line edition cases: an autonomous agent writes lines into a demanding register
 * (simulations/runner/line-edition-fixtures.ts) from what a person hands it, once per arm of the
 * experiment (plain JSON tools, or json-layout editor groups) and per repeat. Unlike the other cases,
 * each states the register's expected final state, compared field by field by the row check
 * (simulations/runner/row-check.ts) beside the judge's verdict: what is measured is the data written.
 *
 * Where the input is ambiguous on purpose, the expected state assumes the agent asked and the persona
 * answered as scripted. Extension fields (`_code_insee.*`) come from the referential's line of the
 * commune: a row filed under the wrong commune shows there too.
 */
import type { LineEditionArm } from '../../api/contract/x-agent-line-edition.ts'
import { calledTool, LINES_AGENT, type AgentCase } from '../runner/autonomous-agent.ts'
import type { ExpectedState } from '../runner/row-check.ts'

export type LineEditionCase = Omit<AgentCase, 'route' | 'surface' | 'premise'> & { expected: ExpectedState }
export type LineEditionRun = AgentCase & { base: string, arm: LineEditionArm, repeat: number, expected: ExpectedState }

const ARMS: LineEditionArm[] = ['json', 'editor']

/** The extension fields a line of the commune gets from the referential. */
const extension = (population: number) => ({ '_code_insee.departement': '44', '_code_insee.population': population })

const saintHerblain = { commune: '44162', ...extension(50025) }
const reze = { commune: '44143', ...extension(43053) }
const nantes = { commune: '44109', ...extension(318808) }

// a row of the pasted table that must become a line, matched on the unicity key
const pasted = (nom: string, commune: Record<string, unknown>, fields: Record<string, unknown>) =>
  ({ match: { nom, commune: commune.commune }, fields: { ...fields, ...commune } })

const table = [
  'Équipement\tClub\tCatégorie\tVille\tDisciplines\tPlaces\tOuverture',
  'Gymnase Léo Lagrange\tRezé Basket\tgymnase\tReze\tbasket\t200\t01/09/2026',
  'Dojo du Pont Rousseau\tJudo Club Rezéen\tdojo\tRezé\tjudo\t50\t2026-09-15',
  'Piscine Léo Lagrange\tNantes Natation\tpiscine\tNANTES\tnatation\t300\t15 sept. 2026',
  'Stade de la Noë\tFootball Club Sébastiennais\tstade\tSt-Sébastien\tfootball\t800\t01/09/2026',
  'Gymnase de la Frébaudière\tOrvault Sports Basket\tgymnase\tOrvault\tbasket, handisport\t250\t2026-09-01',
  'Gymnase de la Bourgonnière\tSH Basket\tgymnase\tSaint-Herblain\tbasket\t350\t01/09/2026',
  'Salle de la Vrillère\tVertou Danse\tsalle polyvalente\tVertou\tdanse\t90\t22/09/2026',
  'Piscine des Bourrelières\tBouguenais Aquatique\tpiscine\tBouguenais\tnatation\t250\t2026-10-01',
  'Stade de la Fleuriaye\tCarquefou Football Club\tstade\tCarquefou\tfootball\t1500\t5 oct. 2026',
  'Salle de l\'Estuaire\tCouëron Yoga\tsalle polyvalente\tCouëron\tyoga\t40\t01/10/2026'
].join('\n')

export const lineEditionCases: LineEditionCase[] = [
  // One record from prose. The commune is free text with a near-homonym in the referential
  // (Saint-Herblon, 44165), the activities a sentence, the date loose and the phone in another
  // format than the register's; the type of venue is missing, and only the person knows it.
  {
    name: 'saisie-courriel',
    persona: 'Tu es bénévole au bureau d\'une fédération d\'associations sportives et tu tiens à jour, avec l\'agent, la liste des lieux où vos associations pratiquent. Tu n\'es pas informaticien : tu ne parles jamais de colonne, de champ, de ligne ni d\'API, et tu ne vérifies rien toi-même à l\'écran, tu fais confiance à ce qu\'on te répond. Tu sais que le Gymnase du Vigneau est un gymnase, mais tu ne le dis que si on te demande de quel type de lieu il s\'agit. Si on te demande l\'année du 1er mars, c\'est 2026 : le courriel date de février et tu as oublié de le traiter. Si on te demande de quelle commune il s\'agit, c\'est Saint-Herblain, à côté de Nantes.',
    goal: 'Tu veux que le lieu décrit dans ce courriel soit ajouté à la liste des lieux d\'activité des associations. Dans ton premier message, tu demandes de l\'enregistrer et tu colles le courriel tel quel :\n\n« De : Karim Benali <contact@herblain-multisports.fr>\nEnvoyé : jeudi 12 février 2026\nObjet : Nouveau lieu pour nos activités\n\nBonjour,\nJe vous écris au nom de l\'association Herblinoise Multisports (SIRET 79845612300017). À partir du 1er mars, nous aurons nos créneaux au Gymnase du Vigneau, 12 rue du Vigneau à St Herblain. On y fait du basket, du judo et un peu de yoga le samedi. Le gymnase accueille jusqu\'à 120 personnes, enfants comme adultes, et il est accessible aux personnes en fauteuil roulant. La cotisation annuelle est de 160 €. La convention avec la mairie court jusqu\'au 30 juin 2027, le lieu ne nous sera plus ouvert après. Pour nous joindre : 02.40.12.34.56.\nBien cordialement,\nKarim Benali »\n\nTu réponds aux questions de l\'agent, et tu attends qu\'il te confirme que le lieu est bien enregistré avant de t\'arrêter.',
    maxTurns: 6,
    expected: {
      rows: [{
        match: { nom: 'Gymnase du Vigneau' },
        fields: {
          association: 'Association Herblinoise Multisports',
          type_lieu: 'gymnase',
          ...saintHerblain,
          adresse: '12 rue du Vigneau',
          telephone: '02 40 12 34 56',
          email: 'contact@herblain-multisports.fr',
          siret: '79845612300017',
          activites: ['basket', 'judo', 'yoga'],
          publics: ['enfants', 'adultes'],
          capacite: 120,
          accessible_pmr: true,
          date_ouverture: '2026-03-01',
          date_fermeture: '2027-06-30',
          tarif_annuel: 160
        }
      }],
      absent: [{ commune: '44165' }],
      totalRows: 7
    }
  },
  // A batch pasted from a spreadsheet, with headers that are not the register's titles: dates in
  // three formats, communes in mixed spellings, a type outside the allowed values (the person says
  // "salle polyvalente" when asked), and a venue the register already has under the same name and
  // commune, which the unicity constraint refuses and the agent must report instead of overwriting.
  {
    name: 'import-tableur',
    persona: 'Tu es bénévole au bureau d\'une fédération d\'associations sportives et tu tiens à jour, avec l\'agent, la liste des lieux où vos associations pratiquent. Tu n\'es pas informaticien : tu ne parles jamais de colonne, de champ, de ligne ni d\'API, et tu ne vérifies rien toi-même à l\'écran, tu fais confiance à ce qu\'on te répond. Tu n\'as pas d\'autres informations que celles du tableau : si on te demande une adresse, un téléphone ou les publics accueillis, tu dis que tu ne les as pas et qu\'on peut laisser vide. Si on te demande ce qu\'est le « dojo », tu réponds que c\'est une salle polyvalente. Si on te signale qu\'un lieu existe déjà, tu dis de garder celui qui existe tel quel.',
    goal: `Un collègue t'a envoyé un tableau des nouveaux lieux de la rentrée. Tu veux qu'ils soient tous ajoutés à la liste des lieux d'activité des associations. Dans ton premier message, tu demandes de les ajouter et tu colles le tableau tel quel :\n\n${table}\n\nTu réponds aux questions de l'agent. Tu veux savoir à la fin si certains lieux n'ont pas été ajoutés, et pourquoi, et tu attends que l'agent te confirme ce qui est bien enregistré avant de t'arrêter.`,
    maxTurns: 8,
    expected: {
      rows: [
        pasted('Gymnase Léo Lagrange', reze, { association: 'Rezé Basket', type_lieu: 'gymnase', activites: ['basket'], capacite: 200, date_ouverture: '2026-09-01' }),
        pasted('Dojo du Pont Rousseau', reze, { association: 'Judo Club Rezéen', type_lieu: 'salle polyvalente', activites: ['judo'], capacite: 50, date_ouverture: '2026-09-15' }),
        pasted('Piscine Léo Lagrange', nantes, { association: 'Nantes Natation', type_lieu: 'piscine', activites: ['natation'], capacite: 300, date_ouverture: '2026-09-15' }),
        pasted('Stade de la Noë', { commune: '44190', ...extension(27964) }, { association: 'Football Club Sébastiennais', type_lieu: 'stade', activites: ['football'], capacite: 800, date_ouverture: '2026-09-01' }),
        pasted('Gymnase de la Frébaudière', { commune: '44114', ...extension(27279) }, { association: 'Orvault Sports Basket', type_lieu: 'gymnase', activites: ['basket', 'handisport'], capacite: 250, date_ouverture: '2026-09-01' }),
        pasted('Salle de la Vrillère', { commune: '44215', ...extension(25587) }, { association: 'Vertou Danse', type_lieu: 'salle polyvalente', activites: ['danse'], capacite: 90, date_ouverture: '2026-09-22' }),
        pasted('Piscine des Bourrelières', { commune: '44020', ...extension(20335) }, { association: 'Bouguenais Aquatique', type_lieu: 'piscine', activites: ['natation'], capacite: 250, date_ouverture: '2026-10-01' }),
        pasted('Stade de la Fleuriaye', { commune: '44026', ...extension(20278) }, { association: 'Carquefou Football Club', type_lieu: 'stade', activites: ['football'], capacite: 1500, date_ouverture: '2026-10-05' }),
        pasted('Salle de l\'Estuaire', { commune: '44047', ...extension(23058) }, { association: 'Couëron Yoga', type_lieu: 'salle polyvalente', activites: ['yoga'], capacite: 40, date_ouverture: '2026-10-01' }),
        // the line the register already had, untouched by the duplicate row of the table
        {
          match: { nom: 'Gymnase de la Bourgonnière', commune: '44162' },
          fields: { association: 'Saint-Herblain Basket Club', type_lieu: 'gymnase', activites: ['basket'], capacite: 300, date_ouverture: '2019-09-02', telephone: '02 40 63 21 18' }
        }
      ],
      absent: [{ association: 'SH Basket' }],
      totalRows: 15
    }
  },
  // Corrections to existing lines: a phone replaced, a value added to a multi-valued column (an
  // append: a replace loses natation and yoga), and a closing date moved earlier, which must still
  // come after the opening date. Nothing else changes, and no line is added or removed.
  {
    name: 'corrections',
    persona: 'Tu es bénévole au bureau d\'une fédération d\'associations sportives et tu tiens à jour, avec l\'agent, la liste des lieux où vos associations pratiquent. Tu n\'es pas informaticien : tu ne parles jamais de colonne, de champ, de ligne ni d\'API, et tu ne vérifies rien toi-même à l\'écran, tu fais confiance à ce qu\'on te répond. Si on te demande la date exacte de fermeture de la salle Jean Jaurès, c\'est le 31 mars de cette année. La salle n\'a pas disparu de la liste pour autant : elle a fermé, c\'est tout.',
    goal: 'Tu as trois corrections à faire dans la liste des lieux d\'activité des associations, et tu les donnes dans ton premier message, avec ces mots : « le numéro de la piscine Petite Amazonie a changé, c\'est le 02 40 99 88 77 ; ajoute handisport à ses activités ; la salle Jean Jaurès a fermé fin mars ». Tu réponds aux questions de l\'agent, et tu attends qu\'il te confirme que les trois corrections sont bien enregistrées avant de t\'arrêter.',
    maxTurns: 6,
    expected: {
      rows: [
        {
          match: { nom: 'Piscine Petite Amazonie' },
          fields: {
            telephone: '02 40 99 88 77',
            activites: ['natation', 'yoga', 'handisport'],
            association: 'Nantes Natation',
            type_lieu: 'piscine',
            commune: '44109',
            adresse: '8 rue Gaston Michel',
            email: 'accueil@nantes-natation.fr',
            siret: '38765432100021',
            publics: ['enfants', 'adultes', 'seniors'],
            capacite: 450,
            accessible_pmr: true,
            date_ouverture: '2018-01-08',
            date_fermeture: null,
            tarif_annuel: 220
          }
        },
        {
          match: { nom: 'Salle Jean Jaurès' },
          fields: {
            date_fermeture: '2026-03-31',
            association: 'Judo Club Rezéen',
            type_lieu: 'salle polyvalente',
            commune: '44143',
            adresse: 'Place Jean Jaurès',
            telephone: '02 40 75 12 30',
            email: null,
            siret: '45678912300034',
            activites: ['judo', 'yoga'],
            publics: ['enfants', 'adultes'],
            capacite: 80,
            accessible_pmr: false,
            date_ouverture: '2020-09-07',
            tarif_annuel: 150
          }
        }
      ],
      totalRows: 6
    }
  }
]

/** A write of a line through the tools of the arm, on a register of a run (never on the referential). */
const writeTools: Record<LineEditionArm, (name: string) => boolean> = {
  json: name => ['datafair_write_line', 'datafair_patch_line', 'datafair_bulk_lines'].includes(name),
  editor: name => (name.startsWith('datafair_create_line_') || name.startsWith('datafair_edit_line_')) && name.endsWith('saveForm')
}

/**
 * One run per case, arm and repeat, named `<case>--<arm>--r<repeat>`: evidence files are named after
 * it, so two runs never share them. Every run of arm `json` comes first, then every run of arm
 * `editor`, so the arm (a platform document refresh) flips once.
 */
export function expandRuns (cases: LineEditionCase[], arms: LineEditionArm[], repeats: number): LineEditionRun[] {
  return ARMS.filter(arm => arms.includes(arm)).flatMap(arm => cases.flatMap(c => Array.from({ length: repeats }, (_, i) => ({
    ...c,
    name: `${c.name}--${arm}--r${i + 1}`,
    base: c.name,
    arm,
    repeat: i + 1,
    route: `/agents/organization/test_org1/chat?agentId=${LINES_AGENT.id}`,
    surface: 'autonomous-agent' as const,
    user: 'test_user1',
    premise: {
      description: `a write tool of arm ${arm} was called on the run's register`,
      holds: exports => calledTool(exports, writeTools[arm], input => typeof input?.id === 'string' && input.id.startsWith('sim-lieux-'))
    }
  }))))
}

/** The runs SIM_ARMS (default `json,editor`) and SIM_REPEAT (default 2) ask for. */
export function lineEditionRuns (env: { SIM_ARMS?: string, SIM_REPEAT?: string } = process.env): LineEditionRun[] {
  const arms = (env.SIM_ARMS || ARMS.join(',')).split(',').map(s => s.trim()).filter(Boolean)
  const unknown = arms.filter(arm => !ARMS.includes(arm as LineEditionArm))
  if (unknown.length || !arms.length) throw new Error(`SIM_ARMS: unknown arm ${unknown.join(', ')} (have: ${ARMS.join(', ')})`)
  const repeats = Number(env.SIM_REPEAT || 2)
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`SIM_REPEAT must be a positive integer, got ${env.SIM_REPEAT}`)
  return expandRuns(lineEditionCases, arms as LineEditionArm[], repeats)
}
