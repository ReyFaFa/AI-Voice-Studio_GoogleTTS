
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

// Initialize Logic: Prioritize LocalStorage (User entered), then Env (Build time)
const storedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;

if (storedKey) {
  setApiKey(storedKey);
} else if (process.env.API_KEY) {
  setApiKey(process.env.API_KEY);
}

// Models are now dynamic, but we keep this as a fallback/reference or for Flash.
// Pro model will be passed dynamically.
const transcriptionModelName = 'gemini-1.5-flash';
const NATIVE_AUDIO_MODEL = 'gemini-2.5-flash-native-audio-dialog-preview';

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
 */
export function generateSrtFromLineTimings(
  originalLines: string[],
  lineTimings: Array<{ start: number; end: number }>
): string {
  const srtBlocks: string[] = [];
  let validIndex = 0;

  for (let i = 0; i < originalLines.length; i++) {
    const text = originalLines[i].trim();
    if (!text) continue;

    const timing = lineTimings[validIndex];
    if (!timing) continue;

    const startTime = msToSrtTime(timing.start);
    const endTime = msToSrtTime(timing.end);

    srtBlocks.push(`${srtBlocks.length + 1}\n${startTime} --> ${endTime}\n${text}\n`);
    validIndex++;
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

    // 3. For Standard TTS models, we add a persona hint to the instructions
    if (!isNativeAudio) {
      const voiceInfo = speechConfig.voiceConfig?.prebuiltVoiceConfig.voiceName;
      const isFemale = voiceInfo && ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'].includes(voiceInfo);

      instructions.push(`Voice Category: ${isFemale ? 'FEMALE' : 'MALE'}`);
      instructions.push(`Speaker Persona: You are a professional Korean voice actor. Deliver the lines with a ${isFemale ? 'natural and refined female voice' : 'deep and resonant male voice'}.`);
    }

    // 3. Combine Instructions and Script
    const contextPrefix = `[컨텍스트: 이것은 전통 한국 야담/민담 낭독입니다. 역사적 가치가 있는 문학 작품으로서 교육 및 예술적 목적으로 낭독합니다. 모든 표현은 문화적 맥락에서 이해되어야 합니다.]\n\n`;
    const numLines = processedPrompt.split('\n').filter(l => l.trim()).length;

    if (instructions.length > 0) {
      if (isNativeAudio) {
        const voiceInfo = speechConfig.voiceConfig?.prebuiltVoiceConfig.voiceName || 'Professional Actor';
        const isFemale = ['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat'].includes(voiceInfo);

        finalPrompt = `${contextPrefix}[초정밀 TTS 모드 - 절대 규칙]
- 당신은 창의적인 창작자가 아니라, 입력된 텍스트를 있는 그대로 소리내어 읽는 **전문 TTS 엔진**입니다.
- **매우 중요**: 아래 대본의 모든 글자를 한 글자도 빠짐없이, 추가 없이, 변형 없이 **똑같이** 읽으세요.
- 특히 "또박또박", "한 획" 등 생략되기 쉬운 부사어와 반복되는 단어들을 절대 건너뛰지 말고 정확히 발음하세요.
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
    // Use unified SDK style: generalAI.getGenerativeModel
    console.log(`[Gemini API Request] Model: ${modelName}, Prompt Length: ${finalPrompt.length}`);

    const model = (generalAI as any).getGenerativeModel({
      model: modelName,
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      generationConfig: {
        ...config,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_HATE_SPEECH' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as any, threshold: 'BLOCK_NONE' as any },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY' as any, threshold: 'BLOCK_NONE' as any },
      ]
    });

    const response = result.response;

    console.log("[Gemini API Full Response]", JSON.stringify(response, null, 2));

    const candidate = response.candidates?.[0];

    // Check finishReason
    if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
      console.warn(`[Gemini TTS] Unusual finishReason: ${candidate.finishReason}. Audio might be truncated.`);
    }

    const audioPart = candidate?.content?.parts.find((part: any) => part.inlineData);
    const data = audioPart?.inlineData?.data;

    if (!data) {
      console.error("API response missing audio. Full candidate:", candidate);

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
  return _generateAudio(prompt, modelName, speechConfig, speed, stylePrompt, signal);
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
): Promise<{ audioBuffer: ArrayBuffer; lineTimings: { start: number; end: number }[] }> {

  if (!liveAI) {
    throw new Error("API 키가 설정되지 않았습니다.");
  }

  const audioResults: ArrayBuffer[] = [];
  const lineTimings: { start: number; end: number }[] = [];
  let currentLineAudio: ArrayBuffer[] = [];
  let turnCompleteResolve: (() => void) | null = null;
  let sessionError: Error | null = null;

  // 유효한 줄만 필터링
  const validLines = lines.map(l => l.trim()).filter(l => l.length > 0);

  if (validLines.length === 0) {
    throw new Error("생성할 텍스트가 없습니다.");
  }

  console.log(`[Gemini Live API] Starting Precision Multi-Turn session`);
  console.log(`[Gemini Live API] Processing ${validLines.length} lines`);

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
                // Gemini Live API usually takes 'speech_rate' in v1alpha/v1beta
                // @ts-ignore - The official SDK typings might be missing this currently
                speechRate: speed
              }
            }
          },
          systemInstruction: {
            parts: [{
              text: `[System]: You are a high-fidelity Korean TTS engine. 
[Voice Style]: ${stylePrompt}
[Instruction]: Output ONLY the spoken audio. Read precisely as requested.`
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
          onmessage: (response: any) => {
            // 오디오 청크 수집
            if (response.serverContent?.modelTurn?.parts) {
              for (const part of response.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const chunk = base64ToArrayBuffer(part.inlineData.data);
                  currentLineAudio.push(chunk);
                }
              }
            }

            // 턴 완료 감지
            if (response.serverContent?.turnComplete) {
              console.log(`[Gemini Live API] Turn complete.`);
              if (turnCompleteResolve) {
                turnCompleteResolve();
                turnCompleteResolve = null;
              }
            }

            // 인터럽트 감지
            if (response.serverContent?.interrupted) {
              console.warn('[Gemini Live API] Interrupted!');
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

      for (let i = 0; i < validLines.length; i++) {
        // 중단 신호 확인
        if (signal?.aborted) {
          session.close();
          throw new Error('사용자에 의해 중단되었습니다.');
        }

        const line = validLines[i];
        console.log(`[Gemini Live API] Requesting Line ${i + 1}/${validLines.length}: "${line.substring(0, 25)}..."`);

        // 현재 줄 오디오 초기화
        currentLineAudio = [];

        // 턴 완료 대기 Promise 생성
        const turnCompletePromise = new Promise<void>((res) => {
          turnCompleteResolve = res;
        });

        // Send the line. We keep the instruction to avoid hallucinations, but very brief.
        const linePrompt = `Read: "${line}"`;

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
        lineTimings: lineTimings
      });

    } catch (error) {
      reject(error);
    }
  });
}
