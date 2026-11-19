import { BellRing, Blocks } from 'lucide-react'

export const demoScenarios = [
  {
    key: 'teams-notifications',
    title: 'Problème de notifications Microsoft Teams',
    niveau: 1 as const,
    icon: BellRing,
    description: 'Depuis ce matin, je ne reçois plus les notifications de Microsoft Teams sur mon poste. Les messages apparaissent uniquement lorsque j’ouvre l’application. J’ai vérifié les paramètres de notifications de Teams et de Windows, sans changement.',
  },
  {
    key: 'multi-tool-incident',
    title: 'Incident applicatif multi-outils',
    niveau: 2 as const,
    icon: Blocks,
    description: 'Plusieurs outils professionnels, dont Microsoft Teams et Outlook, deviennent très lents ou cessent de répondre depuis ce matin. Le problème survient après la connexion à Windows et j’ai déjà redémarré mon poste sans amélioration.',
  },
] as const

export type DemoScenarioKey = (typeof demoScenarios)[number]['key']
