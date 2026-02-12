
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

let generalAI: GoogleGenAI | null = null;
let liveAI: GoogleGenAI | null = null;

export const setApiKey = (apiKey: string) => {
  if (!apiKey) return;
  try {
    generalAI = new GoogleGenAI({ apiKey }); // Uses default v1beta
    liveAI = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' }
    });
  } catch (e) {
    console.error("Failed to set API Key:", e);
  }
};

// Rate Limit 에러 감지 함수
function isRateLimitError(error: any): boolean {
  const message = error?.message || '';
  return (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('quota') ||
    message.includes('Rate limit')
  );
}

// TTS 생성용 Fallback 시스템
export async function generateAudioWithFallback(
  lines: string[],
  voiceName: string,
  stylePrompt: string,
  speed: number,
  silenceBetweenLinesMs: number,
  ttsApiKeys: string[],  // TTS 전용 API 키 배열
  fallbackApiKey: string,  // 기본 API 키 (최종 fallback)
  signal?: AbortSignal
): Promise<{
  audioBuffer: ArrayBuffer;
  lineTimings: { start: number; end: number }[];
  paragraphs: string[];
}> {
  // 사용할 API 키 목록 준비
  const validTtsKeys = ttsApiKeys.filter(k => k.trim() !== '');
  const keysToTry = validTtsKeys.length > 0
    ? [...validTtsKeys, fallbackApiKey]  // TTS 키들 먼저, 기본 키는 마지막
    : [fallbackApiKey];  // TTS 키 없으면 기본 키만

  let lastError: Error | null = null;
  const originalApiKey = fallbackApiKey;  // 기본 키 백업

  for (let i = 0; i < keysToTry.length; i++) {
    const currentKey = keysToTry[i];
    const keyType = i < validTtsKeys.length ? 'TTS 전용' : '기본';

    try {
      console.log(`[TTS Fallback] ${keyType} API 키 ${i + 1}/${keysToTry.length} 시도 중...`);

      // 현재 키로 API 설정
      setApiKey(currentKey);

      // TTS 생성 시도
      const result = await generateAudioWithLiveAPIMultiTurn(
        lines,
        voiceName,
        stylePrompt,
        speed,
        silenceBetweenLinesMs,
        signal
      );

      console.log(`[TTS Fallback] ✅ ${keyType} API 키로 성공!`);

      // 성공 후 기본 키로 복원 (대본 분석용)
      setApiKey(originalApiKey);

      return result;

    } catch (error: any) {
      console.warn(`[TTS Fallback] ❌ ${keyType} API 키 ${i + 1} 실패:`, error.message);

      lastError = error;

      // Rate Limit 에러가 아니면 즉시 종료
      if (!isRateLimitError(error)) {
        console.error(`[TTS Fallback] Rate Limit이 아닌 에러 발생, 중단:`, error.message);
        // 기본 키로 복원
        setApiKey(originalApiKey);
        throw error;
      }

      // Rate Limit 에러이고 다음 키가 있으면 계속 시도
      if (i < keysToTry.length - 1) {
        console.log(`[TTS Fallback] 🔄 Rate Limit 감지, 다음 API 키로 전환...`);
        continue;
      }
    }
  }

  // 모든 키 실패 - 기본 키로 복원
  setApiKey(originalApiKey);

  throw new Error(
    `모든 API 키의 할당량이 초과되었습니다 (${keysToTry.length}개 시도). ` +
    `마지막 에러: ${lastError?.message || '알 수 없음'}`
  );
}

// Initialize Logic: Prioritize LocalStorage (User entered), then Env (Build time)
const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;

if (storedKey) {
  setApiKey(storedKey);
} else if (process.env.API_KEY) {
  setApiKey(process.env.API_KEY);
}

/**
 * 속도 값에 따른 상세한 Pacing 프롬프트 반환
 */
function getPacingPrompt(speed: number): string {
  if (speed <= 0.5) {
    return 'Pacing: Extremely slow, almost meditative. Long pauses between phrases. Each word deliberate and weighted.';
  } else if (speed <= 0.7) {
    return 'Pacing: Slow and relaxed. Take your time, let the words breathe. About 2 words per second.';
  } else if (speed <= 0.9) {
    return 'Pacing: Unhurried and gentle. Speak deliberately, no rushing. About 3 words per second.';
  } else if (speed <= 1.1) {
    return 'Pacing: Natural conversational pace.';
  } else if (speed <= 1.3) {
    return 'Pacing: Slightly energetic pace, keeping momentum without rushing.';
  } else if (speed <= 1.6) {
    return 'Pacing: Quick and lively delivery, but still clear and articulate.';
  } else {
    return 'Pacing: Rapid-fire delivery. Speak as fast as possible while maintaining clarity.';
  }
}

/**
 * 톤 레벨에 따른 상세한 Tone 프롬프트 반환
 */
export function getTonePrompt(toneLevel: number): string {
  if (toneLevel <= 1) {
    return 'Tone: Very low and hushed, almost a whisper. Pitch around 140-180Hz. Minimal energy, deeply subdued.';
  } else if (toneLevel <= 2) {
    return 'Tone: Low and soft, like a quiet late-night radio whisper. Pitch around 160-200Hz. Soft and subdued energy.';
  } else if (toneLevel <= 3) {
    return 'Tone: Warm and gentle, like telling a bedtime story. Pitch around 180-220Hz. Calm, soothing energy.';
  } else if (toneLevel <= 4) {
    return 'Tone: Warm and clear, comfortable storytelling. Pitch around 200-240Hz. Gentle but present energy.';
  } else {
    return 'Tone: Friendly and inviting, daytime radio feel. Pitch around 220-260Hz. Warm and engaged energy.';
  }
}

// Models are now dynamic, but we keep this as a fallback/reference or for Flash.
// Pro model will be passed dynamically.
const transcriptionModelName = 'gemini-1.5-flash';
const NATIVE_AUDIO_MODEL = 'gemini-2.5-flash-native-audio-dialog-preview';

// 감정 전달과 문맥 유지를 위해 한 턴에 처리할 대본 줄 수
export const LINES_PER_TURN = 4;

interface SpeechConfig {
  voiceConfig?: {
    prebuiltVoiceConfig: {
      voiceName: string;
    };
  };
  multiSpeakerVoiceConfig?: {
    speakerVoiceConfigs: {
      speaker: string;
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: string;
        };
      };
    }[];
  };
  languageCode?: string;
}

/**
 * 전역 에러 핸들러: API 에러 응답을 분석하여 사용자 친화적인 메시지로 변환합니다.
 */
function handleApiError(error: any): Error {
  const message = error instanceof Error ? error.message : String(error);

  // 429 Too Many Requests 또는 Quota 관련 키워드 체크
  if (message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('limit')) {
    return new Error("API 요청 한도(Quota)를 초과했습니다. 유료 계정이라도 모델별 일일 생성량이나 분당 요청 제한이 있을 수 있습니다. Google AI 스튜디오의 'Plan & Billing'에서 할당량을 확인하시거나, 잠시(1~5분) 후 다시 시도해 주세요.");
  }

  // 401/403 관련 (인증 에러)
  if (message.includes('401') || message.includes('403')) {
    return new Error("API 키가 유효하지 않거나 권한이 없습니다. 설정을 확인해주세요.");
  }

  // 500 관련 (서버 에러)
  if (message.includes('500') || message.includes('503')) {
    return new Error("Google 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  return new Error(`AI와 통신 중 오류가 발생했습니다: ${message}`);
}

/**
 * Uint8Array를 메모리 효율적으로 Base64로 변환합니다. (Stack Overflow 방지)
 */
export function uint8ArrayToBase64(uint8: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192; // 안전한 chunk 크기
  for (let i = 0; i < uint8.length; i += chunkSize) {
    const sub = uint8.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, sub as any);
  }
  return btoa(binary);
}

/**
 * Base64 string to ArrayBuffer.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Merge multiple ArrayBuffers.
 */
function mergeArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

/**
 * 지정된 길이의 무음 PCM 버퍼 생성 (24kHz, 16bit, mono)
 */
function createSilenceBuffer(durationMs: number): ArrayBuffer {
  const sampleRate = 24000;
  const bytesPerSample = 2; // 16bit
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new ArrayBuffer(numSamples * bytesPerSample);
  // ArrayBuffer는 기본적으로 0으로 초기화됨 = 무음
  return buffer;
}

/**
 * 오디오 청크들을 무음 간격과 함께 병합
 */
function mergeAudioWithSilence(
  audioChunks: ArrayBuffer[],
  silenceMs: number = 500
): ArrayBuffer {
  const silence = createSilenceBuffer(silenceMs);
  const allBuffers: ArrayBuffer[] = [];

  for (let i = 0; i < audioChunks.length; i++) {
    allBuffers.push(audioChunks[i]);

    // 마지막 줄이 아니면 무음 추가
    if (i < audioChunks.length - 1) {
      allBuffers.push(silence);
    }
  }

  // 전체 병합
  const totalLength = allBuffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of allBuffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

/**
 * 멀티턴 결과의 lineTimings를 사용해 SRT 생성
 * 각 문단(Batch)별로 하나의 SRT 블록을 생성합니다.
 */
export function generateSrtFromParagraphTimings(
  paragraphs: string[],
  lineTimings: Array<{ start: number; end: number }>
): string {
  const srtBlocks: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].trim();
    if (!text) continue;

    const timing = lineTimings[i];
    if (!timing) continue;

    const startTime = msToSrtTime(timing.start);
    const endTime = msToSrtTime(timing.end);

    srtBlocks.push(`${srtBlocks.length + 1}\n${startTime} --> ${endTime}\n${text}\n`);
  }

  return srtBlocks.join('\n');
}

export function msToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

async function _generateAudio(
  prompt: string,
  modelName: string,
  speechConfig: SpeechConfig,
  speed: number,
  toneLevel: number = 3,
  stylePrompt?: string,
  signal?: AbortSignal
): Promise<string> {
  if (!generalAI || !liveAI) {
    throw new Error("API 키가 설정되지 않았습니다. 우측 상단 설정 아이콘을 눌러 API 키를 입력해주세요.");
  }

  // Pre-process text to avoid premature termination by ellipses in Live API
  const processedPrompt = prompt
    .replace(/\.\.\./g, ', ')
    .replace(/…/g, ', ');

  try {
    const isNativeAudio = modelName.includes('native-audio-dialog');

    const config: {
      responseModalities: Modality[];
      speechConfig?: SpeechConfig;
    } = {
      responseModalities: [Modality.AUDIO],
      // Native Audio model doesn't use the standard speechConfig object in some versions, 
      // but we pass it as a hint.
      speechConfig: isNativeAudio ? undefined : speechConfig,
    };

    // Construct the prompt with instructions for steerability
    let finalPrompt = prompt;
    const instructions: string[] = [];

    // 1. Add Style Instructions if present
    if (stylePrompt && stylePrompt.trim().length > 0) {
      instructions.push(`Style/Tone: ${stylePrompt.trim()}`);
    }

    // 2. Add Speed Instructions if not normal
    if (speed !== 1.0) {
      instructions.push(`Speed: ${speed}x`);
    }

    // 3. Tone instructions (Temporarily disabled due to API 500/Stop errors)
    // instructions.push(getTonePrompt(toneLevel));

    // 3. For Standard TTS models, we add a persona hint to the instructions
    if (!isNativeAudio) {
      const voiceInfo = speechConfig.voiceConfig?.prebuiltVoiceConfig.voiceName;
      const isFemale = voiceInfo && ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'].includes(voiceInfo);

      instructions.push(`Voice Category: ${isFemale ? 'FEMALE' : 'MALE'}`);
      // The user's stylePrompt is handled as the primary performance guide.
      // We only add the "Fixed Persona" as a subtle background baseline.
      instructions.push(`System Persona: Professional narrator with a calm and steady texture.`);
    }

    // 3. Combine Instructions and Script
    const contextPrefix = `[이 텍스트는 전통 한국 야담/민담입니다. 교육 목적의 역사적 문학 작품입니다. 모든 표현은 문화적 맥락에서 이해되어야 하며, 인위적인 변형 없이 낭독합니다.]\n\n`;
    const numLines = processedPrompt.split('\n').filter(l => l.trim()).length;

    if (instructions.length > 0) {
      if (isNativeAudio) {
        const voiceInfo = speechConfig.voiceConfig?.prebuiltVoiceConfig.voiceName || 'Professional Actor';
        const isFemale = ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'].includes(voiceInfo);

        finalPrompt = `${contextPrefix}[초정밀 TTS 모드 - 절대 규칙]
- 당신은 창의적인 창작자가 아니라, 입력된 텍스트를 있는 그대로 소리내어 읽는 **전문 TTS 엔진**입니다.
- **매우 중요**: 아래 대본의 모든 글자를 한 글자도 빠짐없이, 추가 없이, 변형 없이 **똑같이** 읽으세요.
- 특히 "또박또박", "한 획" 등 생략되기 쉬운 부사어와 반복되는 단어들을 절대 건너뛰지 말고 정확히 발음하세요.
- **매우 중요**: 아래 대본의 모든 글자를 한 글자도 빠짐없이, 추가 없이, 변형 없이 **똑같이** 읽으세요.
- 특히 "또박또박", "한 획" 등 생략되기 쉬운 부사어와 반복되는 단어들을 절대 건너뛰지 말고 정확히 발음하세요.
- **연기 가이드 (Director's Notes)**: ${stylePrompt || "전통 야담의 분위기를 살려 차분하고 품격 있게 낭독하세요."}
- **기본 질감**: 심야 라디오처럼 따뜻하고 부드러운 발성을 유지하며, 파찰음(ㅅ, ㅆ 등)을 정제하여 듣기 편한 소리를 내세요.
- AI로서의 자아를 버리고 오직 낭독에만 집중하세요. 중간에 절대 멈추거나 생략하지 마세요.

# AUDIO PROFILE: ${voiceInfo} - The Professional ${isFemale ? 'Female' : 'Male'} Narrator
## THE SCENE: A high-end recording studio.
### DIRECTOR'S NOTES
- **Accuracy (CRITICAL)**: 아래 대본 총 **${numLines}줄**을 처음부터 마지막까지 **단 한 단어도 빠짐없이 전부** 낭독하세요.
- **Pacing**: ${speed !== 1.0 ? `Delivered at a ${speed}x pace.` : 'Natural and conversational.'}

[Text to Read - 총 ${numLines}줄]
${processedPrompt}

[대본 끝 - 여기까지 모든 글자를 다 읽어야 합니다]`;
      } else {
        finalPrompt = `${contextPrefix}[Precision TTS Mode]
Read the following text EXACTLY as written. DO NOT skip any words, sentences, or punctuation. DO NOT add any filler words or change the wording.

[Strict Instructions]
1. Read the text EXACTLY as written in the [Text to Read] section.
2. DO NOT skip any words like "또박또박" or "한 획". Every word is essential.
3. **Voice Consistency & Quality**: Maintain a strictly consistent voice.
${instructions.map((inst, idx) => `${idx + 4}. ${inst}`).join('\n')}

[Text to Read]
${processedPrompt}`;
      }
    } else {
      // Even if no instructions, add context and strict precision rules
      finalPrompt = `${contextPrefix}[초정밀 TTS 모드: 아래 대본 ${numLines}줄의 모든 단어를 한 글자도 빠짐없이 정확히 그대로 낭독하세요. 절대로 단어를 생략하거나 바꾸지 마세요.]\n\n${processedPrompt}\n\n[대본 끝 - 여기까지 모두 읽어주세요]`;
    }

    if (!generalAI || !liveAI) {
      throw new Error("API 키가 설정되지 않았습니다.");
    }

    // --- CASE 1: Multimodal Live API (WebSocket) for Native Audio Dialog ---
    if (isNativeAudio) {
      console.log(`[Gemini Live API] Delegating to Multi-Turn generator...`);
      const lines = processedPrompt.split('\n').filter(l => l.trim().length > 0);
      const voiceInfo = speechConfig.voiceConfig?.prebuiltVoiceConfig.voiceName || 'Kore';

      const result = await generateAudioWithLiveAPIMultiTurn(
        lines,
        voiceInfo,
        stylePrompt || "Professional Korean Voice Narrator",
        speed,
        500, // Default 500ms silence
        signal
      );

      return uint8ArrayToBase64(new Uint8Array(result.audioBuffer));
    }

    // --- CASE 2: Standard REST API (generateContent) for Flash/Pro TTS ---
    // Use unified SDK style: generalAI.models.generateContent
    console.log(`[Gemini API Request] Model: ${modelName}, Prompt Length: ${finalPrompt.length}`);

    const result = await (generalAI as any).models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: isNativeAudio ? undefined : speechConfig,
        generationConfig: {
          temperature: 0.2, // Balance between voice consistency and emotional richness
        }
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
      ]
    });

    const response = result; // result inside (generalAI as any).models.generateContent is the parsed response directly

    console.log("[Gemini API Full Response]", JSON.stringify(response, null, 2));

    const candidate = response.candidates?.[0];

    // Check finishReason
    if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      console.warn(`[Gemini TTS] Unusual finishReason: ${candidate.finishReason}. Audio might be truncated.`);
    }

    const audioPart = candidate?.content?.parts.find((part: any) => part.inlineData);
    const data = audioPart?.inlineData?.data;

    if (!data) {
      console.error("API response missing audio. Full candidate:", JSON.stringify(candidate, null, 2));

      if (candidate?.finishReason === 'SAFETY') {
        throw new Error(`안전 필터에 의해 차단되었습니다. (FinishReason: SAFETY). 문제가 된 텍스트 일부: "${prompt.substring(0, 100)}..."`);
      }
      if (candidate?.finishReason === 'PROHIBITED_CONTENT') {
        const blockPreview = prompt.length > 500 ? prompt.substring(0, 500) + "..." : prompt;
        console.error("차단된 텍스트 청크 전체:", prompt);
        throw new Error(`구글 정책에 의해 차단된 콘텐츠입니다. (FinishReason: PROHIBITED_CONTENT). 해당 청크에 포함된 특정 단어나 표현을 수정해 보세요. (차단된 구간 시작: "${blockPreview}")`);
      }
      if (candidate?.finishReason === 'RECITATION') {
        throw new Error(`저작권이 있는 텍스트로 감지되어 차단되었습니다. (FinishReason: RECITATION).`);
      }
      if (candidate?.finishReason === 'OTHER') {
        throw new Error(`알 수 없는 이유로 모델이 차단되었습니다. (FinishReason: OTHER).`);
      }

      const textPart = candidate?.content?.parts?.[0]?.text;
      if (textPart) {
        console.warn("Model responded with text instead of audio:", textPart);
        throw new Error(`AI가 오디오 대신 텍스트로 응답했습니다: "${textPart.substring(0, 150)}..."`);
      }

      // Check if parts exist but are just empty or weird
      const parts = candidate?.content?.parts;
      if (parts && parts.length > 0) {
        console.error("Parts found but no inlineData:", JSON.stringify(parts, null, 2));
      }

      throw new Error(`오디오 데이터 누락 (FinishReason: ${candidate?.finishReason || 'UNKNOWN'}). API 응답 구조가 평소와 다릅니다. 콘솔 로그를 확인해주세요.`);
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error("Error generating audio with Gemini API:", error);
    throw handleApiError(error);
  }
}

export const generateSingleSpeakerAudio = (
  prompt: string,
  voiceName: string,
  modelName: string,
  speed: number = 1.0,
  toneLevel: number = 3,
  stylePrompt?: string,
  signal?: AbortSignal
): Promise<string> => {
  const speechConfig: SpeechConfig = {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: voiceName,
      },
    },
    languageCode: 'ko-KR',
  };
  return _generateAudio(prompt, modelName, speechConfig, speed, toneLevel, stylePrompt, signal);
};

export const previewVoice = (voiceName: string): Promise<string> => {
  const sampleText = `안녕하세요, 이것은 제 목소리입니다. 이 목소리로 멋진 오디오 콘텐츠를 만들 수 있습니다.`;
  // Use default Flash model for previews to save cost/latency
  const defaultModel = "gemini-2.5-flash-preview-tts";
  return generateSingleSpeakerAudio(sampleText, voiceName, defaultModel, 1.0);
};

export const transcribeAudioWithSrt = async (
  base64Wav: string,
  splitCharCount: number,
  signal?: AbortSignal,
  referenceText?: string,
  speed: number = 1.0
): Promise<string> => {
  if (!generalAI) {
    throw new Error("API 키가 설정되지 않았습니다. 우측 상단 설정 아이콘을 눌러 API 키를 입력해주세요.");
  }

  try {
    const audioPart = {
      inlineData: {
        mimeType: 'audio/wav',
        data: base64Wav,
      },
    };

    const processedReference = referenceText
      ?.replace(/\.\.\./g, ', ')
      .replace(/…/g, ', ');
    const numLinesSrt = processedReference?.split('\n').filter(l => l.trim()).length || 'N';

    let promptText = `역할: 초정밀 자막 제작자 (Ultra-Precise Subtitler)
목표: 제공된 [대본 정보]와 [오디오]를 1:1로 매칭하여 완벽한 SRT 생성 (절대 줄을 합치거나 나누지 말 것)

[지침]
1. 입력 대본의 총 줄 수는 정확히 **${numLinesSrt}줄**입니다.
2. **매우 중요**: 각 줄은 쉼표(,)나 마침표(.)가 있더라도 절대 두 개 이상의 SRT 엔트리로 나누지 마십시오.
3. 입력 데이터의 1번 줄은 무조건 SRT의 1번, 2번 줄은 SRT의 2번이 되어야 합니다.
4. 예: "한 획, 한 획, 또박또박 써 내려간 것은," 이 한 줄이라면, 반드시 단 하나의 타임스탬프 구간으로 생성하십시오. 절대로 쉼표에서 자르지 마세요.
5. 오디오 내용이 대본과 100% 일치해야 하며, 타임스탬프는 실제 발음 구간을 따라야 합니다.

**배경 정보**:
- 이 오디오는 약 **${speed}배속**으로 생성되었습니다. 일반 정배속보다 느릴 수 있으니 타임스탬프를 신중하게 설정하세요.
- [컨텍스트]: 이것은 한국 전통 야담/민담 낭독입니다. 역사적 예술 작품으로 대우하십시오.
- 이 텍스트는 총 **${referenceText?.split('\n').filter(l => l.trim()).length || '알 수 없음'}** 줄로 구성된 사극 대본입니다.

**최우선 규칙 (절대 준수):**
1. **텍스트 보존 (TEXT PRESERVATION)**: 아래 [참조 대본]에 제공된 텍스트를 **단 한 글자, 단 하나의 기호도 수정하지 마세요.** AI가 전사하지 말고, 제공된 텍스트를 그대로 SRT에 사용하세요.
2. **1:1 줄-시간 매칭 (LINE-TO-TIME MAPPING)**: [참조 대본]의 각 줄(Line)이 오디오에서 나타나는 **시작 시간과 종료 시간만 정확히 찾아내어 SRT 블록으로 만드세요.**
3. **줄 수 불일치 금지**: 최종 SRT 블록의 개수는 [참조 대본]의 줄 수와 무조건 일치해야 합니다. 합치기, 쪼개기, 건너뛰기 모두 엄격히 금지합니다.
4. **포맷 준수**: 표준 SubRip(.srt) 형식을 따르되, 내용은 반드시 제공된 대본을 토씨 하나 틀리지 않고 사용하세요.
5. **타임스탬프 정밀도**: 0.9배속 오디오 파형에 맞춰 문장이 시작되고 끝나는 지점을 밀리초 단위로 정확히 잡으세요.

**[참조 대본]:**
${referenceText}

**출력**: 코드 블록(\`\`\`srt) 안에 SRT 내용만 출력하세요.`;

    if (referenceText) {
      promptText += `

**[모드: 강제 정렬 (Forced Alignment)]**
**배경**: 이 오디오는 창작 사극 드라마의 일부입니다.
제공된 **참조 스크립트**가 이 오디오의 정확한 대본입니다. 이 스크립트의 모든 줄을 오디오 파형과 일치시켜 SRT를 생성하세요.

**★ 중요 자막 규칙 (필독):**
1. **누락 금지:** 참조 스크립트의 모든 문장을 예외 없이 자막으로 만드세요.
2. **첫 문장 (0초 시작):** 첫 자막은 무조건 00:00:00,000에서 시작해야 합니다.
3. **겹침 방지:** (N)번째 자막 종료 시간 < (N+1)번째 자막 시작 시간이 되도록 하세요.
4. **가독성 분할:** 한 줄이 너무 길면(${splitCharCount}자 이상) 의미 단위로 자연스럽게 두 줄로 나누세요.

**[참조 스크립트]:**
${referenceText}`;
    } else {
      promptText += `

**[모드: 일반 전사 (Transcription)]**
1. 오디오를 듣고 내용을 정확하게 한국어로 받아쓰세요.
2. 문맥에 맞게 자연스럽게 줄을 나누어 자막을 생성하세요.
3. 자막 한 줄은 최대 ${splitCharCount}자를 넘지 않도록 하세요.
`;
    }

    promptText += `

**출력 예시:**
1
00:00:00,000 --> 00:00:02,150
안녕하세요! AI 보이스 스튜디오입니다.

2
00:00:02,250 --> 00:00:05,100
텍스트를 입력하면 목소리로 변환해드립니다.
`;

    const textPart = { text: promptText };

    // ✅ 신버전 문법 + gemini-2.5-flash
    const result = await (generalAI as any).models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [audioPart, textPart]
      }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
      ]
    });

    // ✅ 응답 접근
    let srtText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    const match = srtText.match(/```(?:srt)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      srtText = match[1].trim();
    }

    return srtText;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error("Error transcribing audio with Gemini API:", error);
    throw handleApiError(error);
  }
};

/**
 * Live API 단일 세션 멀티턴 방식으로 오디오 생성
 * - 세션 1개 유지
 * - 줄별로 독립 턴 요청
 * - 각 줄 완료 후 다음 줄 진행
 */
export async function generateAudioWithLiveAPIMultiTurn(
  lines: string[],
  voiceName: string,
  stylePrompt: string,
  speed: number = 1.0,
  silenceBetweenLinesMs: number = 500,
  signal?: AbortSignal
): Promise<{
  audioBuffer: ArrayBuffer;
  lineTimings: { start: number; end: number }[];
  paragraphs: string[];
}> {

  if (!liveAI) {
    throw new Error("API 키가 설정되지 않았습니다.");
  }

  const audioResults: ArrayBuffer[] = [];
  const lineTimings: { start: number; end: number }[] = [];
  let currentLineAudio: ArrayBuffer[] = [];
  let turnCompleteResolve: (() => void) | null = null;
  let sessionError: Error | null = null;
  let chunkCounter = 0; // 세션 전체 청크 카운터

  // 유효한 줄만 필터링
  const validLines = lines.map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new Error("생성할 텍스트가 없습니다.");
  }

  console.log(`[Gemini Live API] Starting Precision Paragraph-Based Multi-Turn session`);

  // 빈 줄을 기준으로 문단(Batch) 나누기
  const paragraphs: string[] = [];
  let currentGroup: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      if (currentGroup.length > 0) {
        paragraphs.push(currentGroup.join('\n'));
        currentGroup = [];
      }
    } else {
      currentGroup.push(line);
    }
  }
  if (currentGroup.length > 0) {
    paragraphs.push(currentGroup.join('\n'));
  }

  if (paragraphs.length === 0) {
    throw new Error("처리할 수 있는 텍스트 내용이 없습니다.");
  }

  console.log(`[Gemini Live API] Processing ${paragraphs.length} paragraphs`);

  return new Promise(async (resolve, reject) => {
    try {
      const liveModel = 'gemini-2.5-flash-native-audio-preview-12-2025';
      const session = await (liveAI as any).live.connect({
        model: liveModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              }
            }
          },
          systemInstruction: {
            parts: [{
              text: `[System Instruction]: You are a professional Korean voice actor. 
[Voice Persona]: Warm, calm, and steady late-night radio DJ. Use de-essed, smooth vocal texture.
[Director's Notes]: ${stylePrompt}
[Strict Rules]: 
1. Read the provided text EXACTLY as written. 
2. DO NOT skip any words, symbols, or sentences. 
3. Output ONLY the spoken audio. 
4. DO NOT summarize or interpret.`
            }]
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
          ],
        },
        callbacks: {
          onopen: () => {
            console.log('[Gemini Live API] WebSocket opened.');
          },
          onmessage: async (response: any) => {
            const isTurnComplete = !!response.serverContent?.turnComplete;

            // 오디오 청크 수집
            if (response.serverContent?.modelTurn?.parts) {
              for (const part of response.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const chunk = base64ToArrayBuffer(part.inlineData.data);
                  // 안정성을 위해 최소한의 로그 출력 유지 (로그 출력 시 발생하는 미세 지연이 수집 안정화에 도움)
                  console.log(`[Gemini Live API] Chunk received: ${chunk.byteLength} bytes`);
                  currentLineAudio.push(chunk);
                }
              }
            }

            // 턴 완료 감지 (800ms 대기하여 마지막 청크 수신 보장)
            if (isTurnComplete) {
              console.log(`[Gemini Live API] turnComplete received. Starting 800ms protection delay...`);
              const resolveRef = turnCompleteResolve;
              turnCompleteResolve = null;
              if (resolveRef) {
                setTimeout(() => {
                  console.log(`[Gemini Live API] 800ms delay finished. Resolving turn.`);
                  resolveRef();
                }, 800);
              }
            }

            // 인터럽트 감지
            if (response.serverContent?.interrupted) {
              console.warn(`[Gemini Live API] Server sent "interrupted" signal. Waiting for turnComplete anyway...`);
            }
          },
          onerror: (e: any) => {
            console.error('[Gemini Live API] Error:', e);
            sessionError = new Error(e.message || 'Live API 오류');
            if (turnCompleteResolve) {
              turnCompleteResolve();
            }
          },
          onclose: (e: any) => {
            console.log(`[Gemini Live API] WebSocket closed. (Code ${e?.code || 'unknown'})`);
          }
        }
      });

      // 세션 연결 완료 후 멀티턴 처리 시작
      console.log('[Gemini Live API] Connected. Starting multi-turn loop...');

      let cumulativeTimeMs = 0;

      for (let i = 0; i < paragraphs.length; i++) {
        // 중단 신호 확인
        if (signal?.aborted) {
          session.close();
          throw new Error('사용자에 의해 중단되었습니다.');
        }

        const batchText = paragraphs[i];

        // 말줄임표 치환 대신 원본 텍스트 유지 (사용자님 관찰 반영)
        const processedBatch = batchText;

        console.log(`[Gemini Live API] Requesting Paragraph ${i + 1}/${paragraphs.length}: "${processedBatch.substring(0, 30).replace(/\n/g, ' ')}..."`);

        // 현재 줄 오디오 초기화 및 청크 카운터 리셋
        currentLineAudio = [];
        chunkCounter = 0;

        // 턴 완료 대기 Promise 생성
        const turnCompletePromise = new Promise<void>((res) => {
          turnCompleteResolve = res;
        });

        // Send the batch with a clear instruction
        const linePrompt = `Please read this text exactly: "${processedBatch}"`;

        await session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: linePrompt }] }],
          turnComplete: true
        });

        // 턴 완료 대기
        await turnCompletePromise;

        // 에러 체크
        if (sessionError) {
          session.close();
          throw sessionError;
        }

        // 결과 저장
        const lineAudio = mergeArrayBuffers(currentLineAudio);
        audioResults.push(lineAudio);

        // 타이밍 계산 (24kHz, 16bit 기준)
        // Note: Gemini standard sampling rate for Native Audio is often 24kHz or 16kHz. 
        // We'll use 24kHz as per user instructions.
        const lineDurationMs = (lineAudio.byteLength / 2 / 24000) * 1000;
        lineTimings.push({
          start: cumulativeTimeMs,
          end: cumulativeTimeMs + lineDurationMs
        });
        cumulativeTimeMs += lineDurationMs + silenceBetweenLinesMs;

        console.log(`[Gemini Live API] Line ${i + 1} completed. ${lineAudio.byteLength} bytes, ${lineDurationMs.toFixed(0)}ms`);
      }

      // 세션 종료
      session.close();

      // 무음 삽입하여 최종 병합
      console.log(`[Gemini Live API] Merging ${audioResults.length} audio segments with ${silenceBetweenLinesMs}ms silence...`);
      const finalAudio = mergeAudioWithSilence(audioResults, silenceBetweenLinesMs);

      console.log(`[Gemini Live API] Complete! Total: ${finalAudio.byteLength} bytes`);

      resolve({
        audioBuffer: finalAudio,
        lineTimings: lineTimings,
        paragraphs: paragraphs
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Gemini API를 사용하여 캡컷 자막과 원본 대본을 AI 추론으로 매칭
 * @param capCutSrtText 캡컷 SRT 텍스트 (번호, 타임코드 포함)
 * @param scriptLines 원본 자막 라인 배열
 * @returns 매칭 결과 JSON 배열
 */
export async function matchSubtitlesWithAI(
  capCutSrtLines: Array<{ index: number; text: string }>,
  scriptLines: Array<{ index: number; text: string }>,
  onProgress?: (status: string) => void
): Promise<Array<{ scriptIndex: number; capCutStartIndex: number; capCutEndIndex: number }>> {
  if (!generalAI) {
    throw new Error('Gemini API가 초기화되지 않았습니다. API 키를 확인해주세요.');
  }

  // 배치 처리 (SDK 제한으로 인해 한 번에 처리 불가)
  const BATCH_SIZE = 100;
  const totalBatches = Math.ceil(scriptLines.length / BATCH_SIZE);
  const allMatches: Array<{ scriptIndex: number; capCutStartIndex: number; capCutEndIndex: number }> = [];

  console.log(`[AI Matching] 배치 처리 시작: ${totalBatches}개 배치`);
  onProgress?.(` AI 매칭 준비중... (${scriptLines.length}줄)`);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, scriptLines.length);
    const batchScriptLines = scriptLines.slice(startIdx, endIdx);

    const progress = `AI 매칭 중 (${batchIndex + 1}/${totalBatches})... ${startIdx + 1}~${endIdx}줄`;
    console.log(`[AI Matching] ${progress}`);
    onProgress?.(progress);

    // 이전 배치의 마지막 캡컷 인덱스 계산
    const lastCapCutIndex = allMatches.length > 0
      ? Math.max(...allMatches.map(m => m.capCutEndIndex)) + 1
      : 0;

    // 프롬프트 생성 (현재 배치만)
    const capCutText = capCutSrtLines
      .slice(lastCapCutIndex)
      .map(line => `[${line.index}] ${line.text}`)
      .join('\n');

    const scriptText = batchScriptLines
      .map(line => `[${line.index}] ${line.text}`)
      .join('\n');

  const prompt = `당신은 영상 자막 타임코드 매칭 전문가입니다.

**배경:**
- 원본 대본: 나레이션용으로 작성된 완전한 스크립트
- 캡컷 SRT: 실제 나레이션 음성을 자동 인식하여 생성된 자막 (타임코드 포함)
- 목표: 원본 대본을 화면 자막으로 표시하되, 캡컷 SRT의 정확한 타임코드를 사용

**작업 목표:**
원본 대본의 각 라인이 나레이션이 읽고 화면 자막으로 사용하기 적절하도록,
캡컷 SRT의 타임코드를 정확히 매칭하세요.
원본 대본이 불필요하게 줄바꿈되어 너무 짧다면 화면 자막을 고려하여 한 줄로 합쳐주세요.

**매칭 규칙:**
1. 순서는 앞에서부터 순차적으로 진행됩니다 (절대 뒤로 가지 않음)
2. 원본 대본 1줄 = 캡컷 N줄 매칭 가능 (1→N, 예: 대본 34 = 캡컷 76~78)
3. 원본 대본 N줄 = 캡컷 1줄 매칭 가능 (N→1, 예: 대본 54+55 = 캡컷 110)
4. 음성 인식 오류, 띄어쓰기 차이, 의역 모두 고려하여 매칭
5. 모든 원본 대본 라인은 반드시 매칭되어야 함

**추가 작업 - 짧은 문장 합치기:**
원본 대본에 불필요하게 짧은 문장이 여러 줄로 나뉘어 있는 경우,
자연스러운 한 문장/문단으로 합쳐서 캡컷 타임코드를 매칭해주세요.

합쳐진 경우에도 각 원본 라인마다 JSON 항목을 생성하되, 동일한 캡컷 범위를 지정하세요.

예시:
  원본 [10]: "안녕하세요."
  원본 [11]: "오늘은"
  원본 [12]: "날씨가 좋네요."
  캡컷 [15]: "안녕하세요 오늘은 날씨가 좋네요"

  → 출력:
  {"scriptIndex": 10, "capCutStartIndex": 15, "capCutEndIndex": 15},
  {"scriptIndex": 11, "capCutStartIndex": 15, "capCutEndIndex": 15},
  {"scriptIndex": 12, "capCutStartIndex": 15, "capCutEndIndex": 15}

**입력 데이터:**

캡컷 SRT (${capCutSrtLines.length - lastCapCutIndex}줄, 시작 인덱스: ${lastCapCutIndex}):
${capCutText}

원본 자막분할 대본 (${batchScriptLines.length}줄, 인덱스 ${startIdx}~${endIdx - 1}):
${scriptText}

**출력 형식 (JSON만 반환, 설명 없이):**
반드시 아래 형식의 JSON 배열만 반환하세요. 마크다운 코드 블록 없이 순수 JSON만 출력하세요.
[
  {"scriptIndex": ${startIdx}, "capCutStartIndex": ${lastCapCutIndex}, "capCutEndIndex": ...},
  {"scriptIndex": ${startIdx + 1}, "capCutStartIndex": ..., "capCutEndIndex": ...}
]

scriptIndex: 원본 대본 라인 번호 (${startIdx}부터 시작)
capCutStartIndex: 매칭되는 첫 번째 캡컷 라인 번호
capCutEndIndex: 매칭되는 마지막 캡컷 라인 번호 (포함)`;

    try {
      // Gemini API 호출 (올바른 파라미터 구조)
      const result = await (generalAI as any).models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 65535  // Gemini 2.5 Flash 최대 출력 토큰 (65K)
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
        ]
      });

      // 응답 텍스트 추출
      let responseText = '';
      if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = result.candidates[0].content.parts[0].text.trim();
      } else {
        throw new Error('AI 응답 형식이 올바르지 않습니다.');
      }

      // 상세 로깅 추가
      const finishReason = result?.candidates?.[0]?.finishReason;
      console.log(`[AI Matching] 배치 ${batchIndex + 1} 응답 길이: ${responseText.length} 문자`);
      console.log(`[AI Matching] 배치 ${batchIndex + 1} finishReason: ${finishReason || 'UNKNOWN'}`);

      // finishReason 검증
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`[AI Matching] 배치 ${batchIndex + 1} 경고: finishReason = ${finishReason} (조기 종료 가능성)`);
        if (finishReason === 'MAX_TOKENS') {
          console.error(`[AI Matching] 배치 ${batchIndex + 1} 토큰 제한 초과! maxOutputTokens를 더 늘려야 할 수 있습니다.`);
        }
      }

      // 응답 미리보기 로깅 (처음 200자, 마지막 200자)
      if (responseText.length > 500) {
        const preview = {
          start: responseText.substring(0, 200),
          end: responseText.substring(responseText.length - 200)
        };
        console.log(`[AI Matching] 배치 ${batchIndex + 1} 응답 미리보기:`, preview);
      } else {
        console.log(`[AI Matching] 배치 ${batchIndex + 1} 전체 응답:`, responseText);
      }

      // JSON 추출 (마크다운 코드 블록 제거)
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      // JSON 파싱
      const batchMatches = JSON.parse(responseText);

      if (!Array.isArray(batchMatches)) {
        throw new Error('AI 응답이 배열 형식이 아닙니다.');
      }

      console.log(`[AI Matching] 배치 ${batchIndex + 1} ✅ 성공: ${batchMatches.length}개 매칭 완료`);

      // 결과 누적
      allMatches.push(...batchMatches);

    } catch (error) {
      console.error(`[AI Matching] 배치 ${batchIndex + 1} 오류:`, error);
      throw new Error(`배치 ${batchIndex + 1} AI 매칭 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  console.log(`[AI Matching] ✅ 전체 완료: ${allMatches.length}개 매칭 완료`);
  onProgress?.(`AI 매칭 완료! (${allMatches.length}개)`);
  return allMatches;
}
