export interface Voice {
  id: string
  name: string
  description: string
  gender: 'male' | 'female'
}

export interface Language {
  code: string
  name: string
}

export interface ScriptLine {
  id: string
  speakerId: string
  text: string
  estimatedTime?: number
  style?: string
}

export type SpeakerMode = 'single' | 'multi'

export type MultiSpeakerId = 'speaker1' | 'speaker2'

export interface SpeakerVoiceAssignment {
  id: MultiSpeakerId
  name: string
  voiceId: string
}

export interface MultiSpeakerConfig {
  speakers: SpeakerVoiceAssignment[]
}

export interface SrtLine {
  id: string
  index: number
  startTime: string
  endTime: string
  text: string
  hasAudio?: boolean // 오디오 존재 여부
  chunkIndex?: number // 소속 청크 번호 (-1 = 오디오 없음)
  warningType?: 'no_audio' | 'suspicious_timecode' | null // 경고 타입
}

export interface Preset {
  id: string
  name: string
  voiceId: string
  stylePrompt: string
  model: string
  speed: number
  maxLength?: number // 최대 글자 수
  maxLines?: number // 최대 줄 수
  maxEstimatedSeconds?: number // 최대 예상 소요 시간
  createdAt?: string // 생성 시간 (ISO string)
  speakerMode?: SpeakerMode
  multiSpeakerConfig?: MultiSpeakerConfig
}

export interface TtsApiKey {
  id: string
  key: string
}

// TTS 청크 개별 관리용 인터페이스
export interface AudioChunkItem {
  id: string
  index: number
  buffer: AudioBuffer | null
  text: string
  durationMs: number
  isFailed?: boolean
}
