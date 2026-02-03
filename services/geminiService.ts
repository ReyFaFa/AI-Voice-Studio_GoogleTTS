
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";

let ai: GoogleGenAI | null = null;

export const setApiKey = (apiKey: string) => {
    if (!apiKey) return;
    try {
        ai = new GoogleGenAI({ apiKey });
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
const transcriptionModelName = 'gemini-3-flash-preview';

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
    return new Error("API 사용량이 초과되었습니다. 무료 버전의 한도에 도달했으므로 1~5분 정도 기다린 후 다시 시도해주세요. 혹은 우측 상단 설정을 통해 개인 API 키를 등록하세요.");
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

async function _generateAudio(
    prompt: string, 
    modelName: string, 
    speechConfig: SpeechConfig, 
    speed: number, 
    stylePrompt?: string, 
    signal?: AbortSignal
): Promise<string> {
  if (!ai) {
    throw new Error("API 키가 설정되지 않았습니다. 우측 상단 설정 아이콘을 눌러 API 키를 입력해주세요.");
  }
  
  try {
    const config: {
        responseModalities: Modality[];
        speechConfig: SpeechConfig;
    } = {
        responseModalities: [Modality.AUDIO],
        speechConfig: speechConfig,
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

    // 3. Combine Instructions and Script
    if (instructions.length > 0) {
        finalPrompt = `[Instructions]\n${instructions.join('\n')}\n\n[Text to Read]\n${prompt}`;
    }

    // Use the passed modelName
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: finalPrompt }] },
      config: config,
    });

    const audioPart = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
    const data = audioPart?.inlineData?.data;

    if (!data) {
      console.error("API response did not contain audio data:", response);
      throw new Error('오디오 생성에 실패했습니다. AI의 응답이 불완전합니다.');
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
    referenceText?: string
): Promise<string> => {
  if (!ai) {
    throw new Error("API 키가 설정되지 않았습니다. 우측 상단 설정 아이콘을 눌러 API 키를 입력해주세요.");
  }

  try {
    const audioPart = {
      inlineData: {
        mimeType: 'audio/wav',
        data: base64Wav,
      },
    };

    let promptText = `역할: 전문 자막 제작자 (Professional Subtitler)
목표: 오디오 파일에 딱 맞는 정밀한 SRT 자막 생성

**기본 기술 규칙:**
1. **포맷 준수:** 표준 SubRip(.srt) 형식을 엄격히 따르세요.
2. **타임스탬프 정밀도:** 오디오 파형의 시작과 끝을 밀리초 단위로 정확히 포착하세요.
3. **출력:** 코드 블록(\`\`\`srt) 안에 SRT 내용만 출력하세요. 사족은 금지합니다.`;

    if (referenceText) {
        promptText += `

**[모드: 강제 정렬 (Forced Alignment)]**
제공된 **참조 스크립트**가 이 오디오의 정확한 대본(정답지)입니다.
당신의 임무는 받아쓰기가 아니라, **참조 스크립트의 각 줄이 오디오의 어느 시간대에 위치하는지 정확히 매핑**하는 것입니다.

**★ 중요 타임코드 지침 (반드시 준수):**
1. **첫 문장 시작 보정 (0초 시작):** 
   - 이 오디오는 TTS(음성 합성) 결과물이므로, **첫 번째 문장은 무조건 00:00:00,000에서 시작**해야 합니다.
   - 오디오 초반에 아주 미세한 무음이 있더라도, 첫 자막은 0초부터 시작하도록 강제하세요. 절대 첫 문장의 앞부분을 놓치거나 늦게 시작하지 마세요.

2. **문장 간 겹침 방지 (No Overlaps):**
   - **(N)번째 자막의 시작 시간**은 반드시 **(N-1)번째 자막의 종료 시간 이후**여야 합니다.
   - **문제가 되는 현상:** 다음 문장의 자막이 이전 문장의 음성이 끝나기도 전에 미리 나오는 현상을 절대적으로 방지하세요.
   - **해결책:** 문장 사이에 호흡이 있다면 그 구간은 자막을 비워두고, **확실하게 이전 음성이 끝난 후**에 다음 타임코드를 시작하세요. 필요하다면 0.1~0.2초 정도의 간격을 두어 분리하세요.

3. **텍스트 무결성:**
   - 참조 스크립트의 문장 구조와 내용을 그대로 사용하세요. (임의 수정 금지)
   - 단, 한 줄이 너무 길면(${splitCharCount}자 이상) 오디오 호흡에 맞춰 자연스럽게 두 줄로 나누세요.

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

    // Fix: Removed the second argument (signal) as generateContent only accepts a single GenerateContentParameters object.
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: transcriptionModelName,
      contents: { parts: [audioPart, textPart] },
    });
    
    let srtText = response.text?.trim() ?? '';
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
