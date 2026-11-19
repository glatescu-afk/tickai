export type MockChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type MockChatbotReply = {
  message: string
  readyToConfirm: boolean
  summary: string | null
  diagnostic: string | null
  categorieId: number | null
  categorie: string | null
  niveau: 1 | 2
}

const teamsQuestions = [
  'Les notifications manquent-elles pour tous les messages ou seulement certains (conversations, mentions, réunions) ?',
  'Utilisez-vous Teams sur ordinateur, sur le web ou sur mobile ?',
  'Depuis quand le problème est-il apparu ?',
  'Avez-vous modifié récemment des paramètres de Teams ou de Windows ?',
  'Le problème touche-t-il uniquement votre compte ou aussi vos collègues ?',
]

const generalQuestions = [
  'Quelle application ou quel service est concerné ?',
  'Quel message d’erreur s’affiche, s’il y en a un ?',
  'Le problème touche-t-il d’autres collègues ?',
  'Depuis quand ?',
  'Avez-vous déjà essayé une première solution ?',
]

const summaryPrompt = 'Voici votre demande :'

function cleanAnswer(answer: string | undefined) {
  return answer?.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '') ?? ''
}

function endSentence(sentence: string) {
  return `${sentence.trim().replace(/[.!?…]+$/u, '')}.`
}

function isShortAnswer(answer: string) {
  const words = cleanAnswer(answer).split(/\s+/u).filter(Boolean)
  return words.length <= 1
}

function collectProgress(messages: MockChatMessage[], questionCount: number) {
  const answers: string[] = []
  const additionalDetails: string[] = []
  let questionIndex = 0
  let pendingAnswer: string | null = null
  let lastQuestion = ''
  let lastQuestionWasRepeated = false

  for (const message of messages) {
    if (message.role === 'user') {
      pendingAnswer = message.content
      continue
    }

    const askedQuestion = [...teamsQuestions, ...generalQuestions].find((question) => message.content.includes(question))
    if (pendingAnswer === null) {
      if (askedQuestion) {
        lastQuestion = askedQuestion
        lastQuestionWasRepeated = false
      }
      continue
    }

    if (message.content !== lastQuestion) {
      if (questionIndex < questionCount) {
        answers[questionIndex] = pendingAnswer
        questionIndex += 1
      } else {
        additionalDetails.push(pendingAnswer)
      }
    }

    pendingAnswer = null
    if (askedQuestion) {
      lastQuestionWasRepeated = askedQuestion === lastQuestion
      lastQuestion = askedQuestion
    }
  }

  return { answers, additionalDetails, questionIndex, pendingAnswer, lastQuestionWasRepeated }
}

function formatSince(answer: string | undefined) {
  const value = cleanAnswer(answer)
  if (!value) return ''
  if (/^depuis\b/iu.test(value)) return value.toLowerCase()
  if (/^(il y a|cela fait|ça fait)\b/iu.test(value)) return value.toLowerCase()
  return `depuis ${value.toLowerCase()}`
}

function formatTeamsSince(answer: string | undefined) {
  const value = cleanAnswer(answer)
  if (!value) return ''
  if (/^depuis\b/iu.test(value)) return value.toLowerCase()
  if (/^(?:il y a|cela fait|ça fait)\s+/iu.test(value)) {
    return `depuis ${value.replace(/^(?:il y a|cela fait|ça fait)\s+/iu, '').toLowerCase()}`
  }
  return `depuis ${value.toLowerCase()}`
}

function formatTeamsPlatform(answer: string | undefined) {
  const value = cleanAnswer(answer)
  if (!value) return ''
  if (/ordinateur|\bpc\b|windows|mac/iu.test(value)) return 'sur ordinateur'
  if (/web|navigateur|chrome|edge/iu.test(value)) return 'sur le web'
  if (/mobile|téléphone|portable|iphone|android/iu.test(value)) return 'sur mobile'
  return `sur ${value.toLowerCase()}`
}

function formatTeamsScope(answer: string | undefined) {
  const value = cleanAnswer(answer)
  if (!value) return ''

  const affectedTypes = [
    /conversation/iu.test(value) ? 'les conversations' : null,
    /mention/iu.test(value) ? 'les mentions' : null,
    /r[eé]union/iu.test(value) ? 'les réunions' : null,
    /message d['’ ]?équipe|messages d['’ ]?équipe/iu.test(value) ? 'les messages d’équipe' : null,
  ].filter((item): item is string => Boolean(item))

  if (affectedTypes.length > 0) return `pour ${affectedTypes.join(' et ')}`
  if (/tous|toutes|chaque|ensemble/iu.test(value)) return 'pour tous les messages'
  if (/certains|seulement|uniquement/iu.test(value)) return 'pour certains messages'
  return `pour ${value.toLowerCase()}`
}

function buildTeamsSummary(description: string, answers: string[], additionalDetails: string[]) {
  const initialText = `${description} ${answers.join(' ')}`
  const problem = /ne\s+(?:reçois|recevons|recevez|reçoit)\s+(?:plus|pas)|aucune? notification|notifications? absentes/iu.test(initialText)
    ? 'Notifications Microsoft Teams absentes'
    : 'Problème de notifications Microsoft Teams'
  const fields = [`Problème : ${problem}`]
  const platform = formatTeamsPlatform(answers[1])
  const since = formatTeamsSince(answers[2])
  const scope = formatTeamsScope(answers[0])
  if (platform) fields.push(`Application : Microsoft Teams ${platform.replace(/^sur /u, '')}`)
  if (since) fields.push(`Depuis : ${since.replace(/^depuis /iu, '')}`)
  if (scope) fields.push(`Messages concernés : ${scope.replace(/^pour /u, '')}`)

  const settings = cleanAnswer(answers[3])
  if (settings && !isNegativeAnswer(settings)) fields.push(`Changement récent : ${settings}`)
  const affectedPeople = cleanAnswer(answers[4])
  if (affectedPeople && isNegativeAnswer(affectedPeople)) fields.push('Personnes touchées : vous uniquement')
  else if (affectedPeople && isPositiveAnswer(affectedPeople)) fields.push('Personnes touchées : plusieurs collègues')
  else if (affectedPeople) fields.push(`Personnes touchées : ${affectedPeople}`)
  for (const detail of additionalDetails) fields.push(`Détail : ${cleanAnswer(detail)}`)

  const diagnostic = 'notifications probablement désactivées dans Teams ou bloquées par Windows'
  return { summary: fields.join('\n'), diagnostic }
}

function getGeneralDiagnostic(text: string) {
  if (/wifi|wi-fi|r[eé]seau|internet|connectivit[eé]|connexion réseau/iu.test(text)) {
    return 'une interruption réseau ou un problème de connectivité'
  }
  if (/plusieurs applications|plusieurs logiciels|toutes les applications|plusieurs services/iu.test(text)) {
    return 'un incident partagé ou une perturbation du réseau local'
  }
  if (/acc[eè]s|identifiant|authentification|compte|connexion|mot de passe/iu.test(text)) {
    return 'un problème de compte ou de droits d’accès'
  }
  return 'une anomalie de l’application ou un paramètre à corriger'
}

function isNegativeAnswer(answer: string) {
  return /^(non|aucun|aucune|personne|pas vraiment|je suis seul|seul(?:e)?\b|uniquement moi|seulement moi|que moi|uniquement mon compte)\b/iu.test(cleanAnswer(answer))
}

function isPositiveAnswer(answer: string) {
  return /^(oui|plusieurs|tout le monde|d['’]autres|également|mes collègues|les collègues)\b/iu.test(cleanAnswer(answer))
}

function buildGeneralSummary(description: string, answers: string[], additionalDetails: string[]) {
  const application = cleanAnswer(answers[0])
  const error = cleanAnswer(answers[1])
  const colleagues = cleanAnswer(answers[2])
  const since = formatSince(answers[3])
  const fields = [`Problème : ${application ? `Incident sur ${application}` : cleanAnswer(description)}`]
  if (error && !isNegativeAnswer(error)) fields.push(`Message d’erreur : « ${error} »`)
  if (since) fields.push(`Depuis : ${since.replace(/^depuis /iu, '')}`)
  if (colleagues && isNegativeAnswer(colleagues)) fields.push('Personnes touchées : vous uniquement')
  else if (colleagues && isPositiveAnswer(colleagues)) fields.push('Personnes touchées : vous et des collègues')
  else if (colleagues) fields.push(`Personnes touchées : ${colleagues}`)

  const attemptedSolution = cleanAnswer(answers[4])
  if (attemptedSolution && !isNegativeAnswer(attemptedSolution)) fields.push(`Déjà essayé : ${attemptedSolution}`)
  for (const detail of additionalDetails) fields.push(`Détail : ${cleanAnswer(detail)}`)

  const diagnostic = getGeneralDiagnostic(`${description} ${answers.join(' ')}`)
  return { summary: fields.join('\n'), diagnostic }
}

export function getMockChatbotReply(description: string, messages: MockChatMessage[]): MockChatbotReply {
  const isTeamsNotification = /teams|notifications?|alertes?/iu.test(description)
  const questions = isTeamsNotification ? teamsQuestions : generalQuestions
  const categorieId = isTeamsNotification ? 1 : null
  const categorie = isTeamsNotification ? 'Notifications Teams' : null
  const niveau: 1 | 2 = isTeamsNotification ? 1 : 2

  if (messages.length === 0) {
    return {
      message: questions[0],
      readyToConfirm: false,
      summary: null,
      diagnostic: null,
      categorieId,
      categorie,
      niveau,
    }
  }

  const progress = collectProgress(messages, questions.length)
  const answers = [...progress.answers]
  const additionalDetails = [...progress.additionalDetails]
  let questionIndex = progress.questionIndex

  if (progress.pendingAnswer !== null) {
    if (
      messages.filter((message) => message.role === 'user').length < 5
      && questionIndex < questions.length
      && isShortAnswer(progress.pendingAnswer)
      && !progress.lastQuestionWasRepeated
    ) {
      return {
        message: questions[questionIndex],
        readyToConfirm: false,
        summary: null,
        diagnostic: null,
        categorieId,
        categorie,
        niveau,
      }
    }

    if (questionIndex < questions.length) {
      answers[questionIndex] = progress.pendingAnswer
      questionIndex += 1
    } else {
      additionalDetails.push(progress.pendingAnswer)
    }
  }

  if (questionIndex < questions.length && messages.filter((message) => message.role === 'user').length < 5) {
    return {
      message: questions[questionIndex],
      readyToConfirm: false,
      summary: null,
      diagnostic: null,
      categorieId,
      categorie,
      niveau,
    }
  }

  const result = isTeamsNotification
    ? buildTeamsSummary(description, answers, additionalDetails)
    : buildGeneralSummary(description, answers, additionalDetails)

  return {
    message: summaryPrompt,
    readyToConfirm: true,
    summary: result.summary,
    diagnostic: result.diagnostic,
    categorieId,
    categorie,
    niveau,
  }
}
