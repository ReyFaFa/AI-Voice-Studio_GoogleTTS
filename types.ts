
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
}

export interface Preset {
  id: string;
  name: string;
  voiceId: string;
  stylePrompt: string;
  model: string;
  speed: number;
}

// TTS 청크 개별 관리용 인터페이스
export interface AudioChunkItem {
  id: string;
  index: number;
  buffer: AudioBuffer;
  text: string;
  durationMs: number;
}
