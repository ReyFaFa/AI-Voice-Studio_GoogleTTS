import {
  MultiSpeakerConfig,
  MultiSpeakerId,
  ScriptLine,
  SpeakerMode,
  SpeakerVoiceAssignment,
} from '../types'

export const DEFAULT_MULTI_SPEAKER_CONFIG: MultiSpeakerConfig = {
  speakers: [
    { id: 'speaker1', name: '화자1', voiceId: '' },
    { id: 'speaker2', name: '화자2', voiceId: '' },
  ],
}

const cloneDefaultConfig = (): MultiSpeakerConfig => ({
  speakers: DEFAULT_MULTI_SPEAKER_CONFIG.speakers.map(speaker => ({ ...speaker })),
})

export const normalizeSpeakerLabel = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, '')

const SPEAKER_LINE_PATTERN = /^\s*([가-힣A-Za-z][가-힣A-Za-z0-9._ -]{0,29})\s*[:\uff1a]\s*(.*)$/

export const detectSpeakerLabels = (text: string): string[] => {
  const labels: string[] = []

  for (const line of text.split('\n')) {
    const match = line.match(SPEAKER_LINE_PATTERN)
    if (!match) continue

    const label = match[1].trim()
    const normalizedLabel = normalizeSpeakerLabel(label)
    if (labels.some(existing => normalizeSpeakerLabel(existing) === normalizedLabel)) continue

    labels.push(label)
    if (labels.length > 2) break
  }

  return labels
}

export const applyDetectedSpeakerLabels = (
  text: string,
  config: MultiSpeakerConfig
): MultiSpeakerConfig => {
  const normalizedConfig = normalizeMultiSpeakerConfig(config)
  const detectedLabels = detectSpeakerLabels(text)

  // The feature supports exactly two speakers. Avoid guessing when a script
  // contains only one label or more than two distinct labels.
  if (detectedLabels.length !== 2) return normalizedConfig

  return {
    speakers: normalizedConfig.speakers.map((speaker, index) => ({
      ...speaker,
      name: detectedLabels[index],
    })),
  }
}

export const normalizeMultiSpeakerConfig = (value: unknown): MultiSpeakerConfig => {
  if (!value || typeof value !== 'object') return cloneDefaultConfig()

  const candidate = value as { speakers?: unknown }
  if (!Array.isArray(candidate.speakers)) return cloneDefaultConfig()

  const defaults = cloneDefaultConfig().speakers
  const speakers = defaults.map((fallback, index) => {
    const item = candidate.speakers?.[index]
    if (!item || typeof item !== 'object') return fallback

    const raw = item as Partial<SpeakerVoiceAssignment>
    return {
      id: fallback.id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
      voiceId: typeof raw.voiceId === 'string' ? raw.voiceId : '',
    }
  })

  return { speakers }
}

export const validateMultiSpeakerConfig = (config: MultiSpeakerConfig): string | null => {
  const speakers = normalizeMultiSpeakerConfig(config).speakers
  if (speakers.length !== 2) return '2명의 화자 설정이 필요합니다.'
  if (speakers.some(speaker => !speaker.name.trim())) return '두 화자의 이름을 입력해주세요.'
  if (speakers.some(speaker => /[:\uff1a\r\n]/.test(speaker.name)))
    return '화자 이름에는 콜론(:)이나 줄바꿈을 사용할 수 없습니다.'
  if (speakers.some(speaker => !speaker.voiceId.trim())) return '두 화자의 목소리를 모두 선택해주세요.'

  const normalizedNames = speakers.map(speaker => normalizeSpeakerLabel(speaker.name))
  if (normalizedNames[0] === normalizedNames[1]) return '두 화자의 이름은 서로 달라야 합니다.'
  if (speakers[0].voiceId === speakers[1].voiceId)
    return '두 화자에게 서로 다른 목소리를 선택해주세요.'

  return null
}

export const getSpeakerById = (
  config: MultiSpeakerConfig,
  speakerId: string
): SpeakerVoiceAssignment => {
  const speakers = normalizeMultiSpeakerConfig(config).speakers
  return speakers.find(speaker => speaker.id === speakerId) || speakers[0]
}

export const formatScriptLinesForTts = (
  lines: ScriptLine[],
  mode: SpeakerMode,
  config: MultiSpeakerConfig
): string =>
  lines
    .filter(line => line.text.trim().length > 0)
    .map(line => {
      if (mode === 'single') return line.text
      const speaker = getSpeakerById(config, line.speakerId)
      return `${speaker.name}: ${line.text}`
    })
    .join('\n')
    .trim()

export const formatScriptLinesForEditor = (
  lines: ScriptLine[],
  mode: SpeakerMode,
  config: MultiSpeakerConfig
): string =>
  lines
    .map(line => {
      if (mode === 'single') return line.text
      if (!line.text.trim()) return ''
      const speaker = getSpeakerById(config, line.speakerId)
      return `${speaker.name}: ${line.text}`
    })
    .join('\n')

export interface ParsedSpeakerLine {
  text: string
  speakerId: MultiSpeakerId
}

export const parseSpeakerLine = (
  rawLine: string,
  config: MultiSpeakerConfig,
  fallbackSpeakerId: string = 'speaker1'
): ParsedSpeakerLine => {
  const speakers = normalizeMultiSpeakerConfig(config).speakers
  const fallback = getSpeakerById(config, fallbackSpeakerId)
  const match = rawLine.match(SPEAKER_LINE_PATTERN)
  if (!match) return { text: rawLine, speakerId: fallback.id }

  const label = normalizeSpeakerLabel(match[1])
  const aliases: Record<MultiSpeakerId, string[]> = {
    speaker1: ['speaker1', '화자1', '1', normalizeSpeakerLabel(speakers[0].name)],
    speaker2: ['speaker2', '화자2', '2', normalizeSpeakerLabel(speakers[1].name)],
  }
  const matchedSpeaker = speakers.find(speaker => aliases[speaker.id].includes(label))

  return matchedSpeaker
    ? { text: match[2], speakerId: matchedSpeaker.id }
    : { text: rawLine, speakerId: fallback.id }
}

export const stripSpeakerPrefix = (line: string, config: MultiSpeakerConfig): string => {
  const match = line.match(SPEAKER_LINE_PATTERN)
  if (!match) return line

  const label = normalizeSpeakerLabel(match[1])
  const isKnownSpeaker = normalizeMultiSpeakerConfig(config).speakers.some(
    speaker => normalizeSpeakerLabel(speaker.name) === label
  )
  return isKnownSpeaker ? match[2] : line
}

const splitTextByLimit = (text: string, limit: number): string[] => {
  if (text.length <= limit) return [text]

  const sentences = text.match(/[^.!?]+[.!?]*["'”’\])]*\s*/g) || [text]
  const pieces: string[] = []
  let current = ''

  const pushByWords = (value: string) => {
    let wordBuffer = ''
    for (const word of value.split(/\s+/).filter(Boolean)) {
      const candidate = wordBuffer ? `${wordBuffer} ${word}` : word
      if (candidate.length <= limit) {
        wordBuffer = candidate
        continue
      }
      if (wordBuffer) pieces.push(wordBuffer)
      wordBuffer = ''
      if (word.length <= limit) {
        wordBuffer = word
      } else {
        for (let offset = 0; offset < word.length; offset += limit) {
          const slice = word.slice(offset, offset + limit)
          if (slice.length === limit) pieces.push(slice)
          else wordBuffer = slice
        }
      }
    }
    if (wordBuffer) pieces.push(wordBuffer)
  }

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    if (trimmed.length > limit) {
      if (current) pieces.push(current)
      current = ''
      pushByWords(trimmed)
      continue
    }

    const candidate = current ? `${current} ${trimmed}` : trimmed
    if (candidate.length <= limit) current = candidate
    else {
      if (current) pieces.push(current)
      current = trimmed
    }
  }

  if (current) pieces.push(current)
  return pieces
}

export const splitMultiSpeakerTextIntoChunks = (
  text: string,
  maxLength: number,
  maxLines: number = 15,
  maxEstimatedSeconds: number = 60
): string[] => {
  const safeMaxLength = Math.max(1, maxLength)
  const safeMaxLines = Math.max(1, maxLines)
  const maxSpokenChars = Math.max(1, Math.floor(maxEstimatedSeconds / 0.156))
  const atomicTurns: string[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^([^:\uff1a\n]{1,40})\s*[:\uff1a]\s*(.*)$/)
    if (!match) {
      for (const piece of splitTextByLimit(line, Math.min(safeMaxLength, maxSpokenChars))) {
        atomicTurns.push(piece)
      }
      continue
    }

    const prefix = `${match[1].trim()}: `
    const bodyLimit = Math.max(
      1,
      Math.min(safeMaxLength - prefix.length, maxSpokenChars)
    )
    for (const piece of splitTextByLimit(match[2].trim(), bodyLimit)) {
      atomicTurns.push(`${prefix}${piece}`)
    }
  }

  const chunks: string[] = []
  let currentTurns: string[] = []
  let currentSpokenChars = 0

  const flush = () => {
    if (currentTurns.length > 0) chunks.push(currentTurns.join('\n'))
    currentTurns = []
    currentSpokenChars = 0
  }

  for (const turn of atomicTurns) {
    const spokenText = turn.replace(/^([^:\uff1a\n]{1,40})\s*[:\uff1a]\s*/, '')
    const spokenChars = spokenText.replace(/\s/g, '').length
    const candidateLength = currentTurns.length
      ? currentTurns.join('\n').length + 1 + turn.length
      : turn.length
    const exceedsLimit =
      currentTurns.length > 0 &&
      (candidateLength > safeMaxLength ||
        currentTurns.length + 1 > safeMaxLines ||
        currentSpokenChars + spokenChars > maxSpokenChars)

    if (exceedsLimit) flush()
    currentTurns.push(turn)
    currentSpokenChars += spokenChars
  }

  flush()
  return chunks
}
