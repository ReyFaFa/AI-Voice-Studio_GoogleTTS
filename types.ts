
export interface Voice {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female';
}

export interface Language {
  code: string;
  name: string;
}

export interface ScriptLine {
  id: string;
  speakerId: string;
  text: string;
  estimatedTime?: number;
  style?: string;
}

export interface SrtLine {
  id: string;
  index: number;
  startTime: string;
  endTime: string;
  text: string;
  hasAudio?: boolean;        // 오디오 존재 여부
  chunkIndex?: number;       // 소속 청크 번호 (-1 = 오디오 없음)
  warningType?: 'no_audio' | 'suspicious_timecode' | null;  // 경고 타입
}

export interface Preset {
  id: string;
  name: string;
  voiceId: string;
  stylePrompt: string;
  model: string;
  speed: number;
}

export interface TtsApiKey {
  id: string;
  key: string;
}

// TTS 청크 개별 관리용 인터페이스
export interface AudioChunkItem {
  id: string;
  index: number;
  buffer: AudioBuffer;
  text: string;
  durationMs: number;
}
