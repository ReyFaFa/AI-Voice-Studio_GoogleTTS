# 작업지시서: Google Cloud TTS Chirp3 HD 모델 통합

> **작업 대상 AI**: Gemini 3 Flash
> **감독자**: Claude Sonnet 4.6
> **프로젝트**: AI Voice Studio (`d:/01_Antigravity/12_AI-Voice-Studio/`)
> **작성일**: 2026-03-01
> **공식 문서 조사 완료**: ✅

---

## 목적 요약

Flash TTS / Pro TTS 버튼 옆에 **Chirp3 HD** 세 번째 버튼 추가.
기존 UI 구조를 최대한 유지하면서 자연스럽게 녹여 넣는다.

**핵심 장점**: Chirp3 HD 음성 이름(Kore, Zephyr 등)이 **Gemini TTS 음성 이름과 동일**하므로, 기존 음성 드롭다운을 거의 그대로 재활용 가능.

---

## ① 공식 API 완전 분석 (Claude 직접 조사 완료)

### API 엔드포인트

```
배치(동기) 요청:
POST https://texttospeech.googleapis.com/v1beta1/text:synthesize?key={API_KEY}

스트리밍 요청 (이 프로젝트에서는 사용 안 함):
POST https://texttospeech.googleapis.com/v1beta1/text:synthesize:serverStreaming
```

> **왜 v1beta1?** Chirp3 HD는 아직 v1 stable에 없음. v1beta1 필수.

---

### 요청 바디 전체 구조

```json
{
  "input": {
    "text": "변환할 텍스트 (일반 텍스트)"
  },
  "voice": {
    "languageCode": "ko-KR",
    "name": "ko-KR-Chirp3-HD-Kore"
  },
  "audioConfig": {
    "audioEncoding": "LINEAR16",
    "speakingRate": 1.0,
    "sampleRateHertz": 24000
  }
}
```

**또는 SSML 입력을 사용하는 경우:**
```json
{
  "input": {
    "ssml": "<speak>안녕하세요. <break time=\"500ms\"/> 반갑습니다.</speak>"
  },
  ...
}
```

---

### 지원 파라미터 상세

| 파라미터 | 타입 | 범위/옵션 | 비고 |
|---------|------|-----------|------|
| `audioEncoding` | enum | `LINEAR16`, `MP3`, `OGG_OPUS`, `MULAW`, `ALAW`, `PCM` | **LINEAR16 사용** (기존 파이프라인 호환) |
| `speakingRate` | float | `0.25 ~ 2.0` | **⚠️ Gemini(4.0)와 다름. 최대 2.0** |
| `sampleRateHertz` | int | `24000` 권장 | 기존 코드와 동일 |
| `pitch` | - | **지원 안 함** | Chirp3에서 pitch 파라미터 없음 |
| `volumeGainDb` | - | **지원 안 함** | Chirp3에서 미지원 |

---

### 응답 구조

```json
{
  "audioContent": "//NExAA...(base64 인코딩된 PCM 바이트)",
  "timepoints": [],
  "audioConfig": { "audioEncoding": "LINEAR16", "sampleRateHertz": 24000 }
}
```

`audioContent` = base64 인코딩된 **raw PCM 바이트** (24000Hz, mono, 16-bit, little-endian)
→ 기존 `createWavBlobFromBase64Pcm()` 함수와 **완벽 호환** ✅

---

### 지시어(Style Instruction) 전달 방식

> **⚠️ 중요**: Chirp3 HD는 Gemini처럼 텍스트 프롬프트에 스타일 지시어를 넣는 방식이 **불가능**.
> 음성 스타일은 음성 선택(voiceName)으로만 결정됨. 아래 방법들이 유일한 제어 수단.

#### 방법 1. 속도 제어 (`speakingRate`)
```json
"audioConfig": { "speakingRate": 0.8 }  // 느리게
"audioConfig": { "speakingRate": 1.2 }  // 빠르게
```

#### 방법 2. SSML `<prosody>` 태그
```xml
<speak>
  <prosody rate="slow">이 부분은 천천히 읽습니다.</prosody>
  <prosody rate="fast">이 부분은 빠르게 읽습니다.</prosody>
  <prosody volume="loud">이 부분은 크게 읽습니다.</prosody>
</speak>
```

#### 방법 3. SSML `<break>` (일시정지)
```xml
<speak>
  첫 번째 문장입니다. <break time="500ms"/> 잠시 멈춘 후 이어집니다.
  <break strength="strong"/> 더 긴 멈춤도 가능합니다.
</speak>
```

#### 방법 4. Chirp3 HD 전용 특수 마커 (Plain Text에서 사용 가능!)
```
[pause short]  → 짧은 일시정지
[pause long]   → 긴 일시정지
[pause]        → 기본 일시정지
```
예: `"안녕하세요. [pause short] 오늘의 뉴스를 전해드리겠습니다."`

#### 방법 5. SSML `<say-as>` (숫자/날짜 발음 제어)
```xml
<speak>
  <say-as interpret-as="date" format="ymd">2024-01-15</say-as>
  <say-as interpret-as="telephone">010-1234-5678</say-as>
  <say-as interpret-as="cardinal">1234567</say-as>
</speak>
```

#### Chirp3에서 지원되는 SSML 태그 전체 목록 (공식 문서 확인)
`<speak>`, `<say-as>`, `<p>`, `<s>`, `<phoneme>`, `<sub>`, `<break>`, `<audio>`, `<prosody>`, `<voice>`

---

### 한국어(ko-KR) 지원 Chirp3 HD 음성 목록

> 공식 문서 + 레퍼런스 HTML 코드 교차 확인 완료. ko-KR은 8개 음성 지원.

| 음성 ID | 성별 | Chirp3 full name | 현재 VOICES 배열 매핑 |
|---------|------|-------------------|----------------------|
| `Aoede` | 여 | `ko-KR-Chirp3-HD-Aoede` | ✅ 기존 `Aoede` 동일 |
| `Charon` | 남 | `ko-KR-Chirp3-HD-Charon` | ✅ 기존 `Charon` 동일 |
| `Fenrir` | 남 | `ko-KR-Chirp3-HD-Fenrir` | ✅ 기존 `Fenrir` 동일 |
| `Kore` | 여 | `ko-KR-Chirp3-HD-Kore` | ✅ 기존 `Kore` 동일 |
| `Leda` | 여 | `ko-KR-Chirp3-HD-Leda` | ✅ 기존 `Leda` 동일 |
| `Orus` | 남 | `ko-KR-Chirp3-HD-Orus` | ✅ 기존 `Orus` 동일 |
| `Puck` | 남 | `ko-KR-Chirp3-HD-Puck` | ✅ 기존 `Puck` 동일 |
| `Zephyr` | 여 | `ko-KR-Chirp3-HD-Zephyr` | ✅ 기존 `Zephyr` 동일 |

**→ 음성 이름이 기존과 동일하므로 드롭다운 값 그대로 재활용 가능!**

---

### 가격 정보

- **월 100만 자 무료** (Chirp3 HD 기준, 공식 페이지 별도 확인 권장)
- 초과 시 과금 → `cloud.google.com/text-to-speech/pricing`

---

## ② 현재 코드 구조

작업 전 반드시 이 파일들을 `Read` 도구로 읽은 후 작업할 것.

```
프로젝트 루트/
├── App.tsx                     ← 상태 관리, handleGenerateAudio, handlePreviewVoice
├── types.ts                    ← TtsApiKey 인터페이스
├── constants.tsx               ← VOICES 배열, 아이콘들
├── components/
│   └── MainContent.tsx         ← 모델 선택 버튼(1383~1436줄), 음성 드롭다운
└── services/
    └── geminiService.ts        ← Gemini TTS 로직 (수정 금지)
```

### 현재 모델 선택 버튼 구조 (`MainContent.tsx` 1388~1436줄)
```tsx
<div className="flex flex-wrap gap-2">
  <label /* Flash TTS - 인디고 */ >
    <input type="radio" value="gemini-2.5-flash-preview-tts" />
    <span>Flash TTS</span> <span>빠름</span>
  </label>
  <label /* Pro TTS - 퍼플 */ >
    <input type="radio" value="gemini-2.5-pro-preview-tts" />
    <span>Pro TTS</span> <span>고품질</span>
  </label>
  {/* ← 여기에 Chirp3 HD 버튼 추가 */}
</div>
```

---

## ③ 작업 목록 (순서대로 실행)

### Task 1. 새 파일 생성: `services/googleTtsService.ts`

**기존 `geminiService.ts`는 절대 수정 금지.**

```typescript
// ================================================================
// services/googleTtsService.ts
// Google Cloud TTS Chirp3 HD 서비스 (v1beta1 REST API)
// 공식 문서: https://cloud.google.com/text-to-speech/docs/chirp3-hd
// ================================================================

/**
 * Chirp3 HD 지원 음성 ID 목록 (ko-KR 기준, 8개)
 * voiceId 'Kore' → API 호출 시 'ko-KR-Chirp3-HD-Kore' 로 변환됨
 */
export const CHIRP3_VOICE_IDS = [
  'Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Orus', 'Puck', 'Zephyr'
] as const

export type Chirp3VoiceId = (typeof CHIRP3_VOICE_IDS)[number]

/**
 * Chirp3 HD로 텍스트를 음성으로 변환
 *
 * @param text  변환할 텍스트 (일반 텍스트 또는 SSML)
 * @param voiceId  음성 ID (예: 'Kore', 'Zephyr')
 * @param apiKey  Google Cloud TTS API 키
 * @param speakingRate  말하기 속도 (0.25 ~ 2.0, 기본 1.0)
 *                     ⚠️ Gemini와 달리 최대 2.0 (4.0 넘기면 API 오류)
 * @param isSSML  true이면 text를 SSML로 처리
 * @param signal  AbortSignal
 * @returns base64 인코딩된 LINEAR16 PCM 바이트 (24000Hz, mono, 16-bit)
 *          기존 createWavBlobFromBase64Pcm() 함수와 바로 호환됨
 */
export async function generateChirp3Audio(
  text: string,
  voiceId: string,
  apiKey: string,
  speakingRate: number = 1.0,
  isSSML: boolean = false,
  signal?: AbortSignal
): Promise<string> {
  if (!apiKey?.trim()) {
    throw new Error(
      'Google Cloud TTS API 키가 없습니다. 설정에서 Chirp3 API 키를 입력해주세요.'
    )
  }

  // 속도값 클램핑: Chirp3 HD는 0.25 ~ 2.0 만 지원
  const clampedRate = Math.max(0.25, Math.min(2.0, speakingRate))

  const voiceName = `ko-KR-Chirp3-HD-${voiceId}`
  const endpoint = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey.trim()}`

  // input: 일반 텍스트 또는 SSML
  const input = isSSML ? { ssml: text } : { text }

  const requestBody = {
    input,
    voice: {
      languageCode: 'ko-KR',
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: 'LINEAR16',  // raw PCM → createWavBlobFromBase64Pcm 호환
      speakingRate: clampedRate,
      sampleRateHertz: 24000,     // Gemini TTS와 동일
      // pitch: 미지원 (포함하면 API 무시 또는 오류)
      // volumeGainDb: 미지원
    },
  }

  console.log(`[Chirp3 HD] 요청: voice=${voiceName}, rate=${clampedRate}, ssml=${isSSML}`)
  console.log(`[Chirp3 HD] 텍스트 미리보기: ${text.slice(0, 80)}...`)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = (errorData as any)?.error?.message || '알 수 없는 오류'
    const code = response.status
    console.error('[Chirp3 HD] API 오류:', errorData)
    throw new Error(`Google Cloud TTS 오류 (HTTP ${code}): ${message}`)
  }

  const data = await response.json()

  if (!data.audioContent) {
    throw new Error('Google Cloud TTS가 오디오를 반환하지 않았습니다.')
  }

  console.log(`[Chirp3 HD] ✅ 성공: audioContent 길이 ${data.audioContent.length} chars`)
  return data.audioContent as string
}

/**
 * 재시도 로직 포함 Chirp3 생성 함수
 * Rate Limit(429) 발생 시 지수 백오프로 재시도
 */
export async function generateChirp3AudioWithRetry(
  text: string,
  voiceId: string,
  apiKey: string,
  speakingRate: number = 1.0,
  signal?: AbortSignal,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 재시도 시 대기 (지수 백오프)
      if (attempt > 1) {
        const waitMs = 1000 * Math.pow(2, attempt - 1) // 2s, 4s
        console.log(`[Chirp3 HD] ${waitMs}ms 후 재시도 (${attempt}/${maxRetries})...`)
        await new Promise<void>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('중단됨', 'AbortError'))
            return
          }
          const timer = setTimeout(resolve, waitMs)
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new DOMException('중단됨', 'AbortError'))
            },
            { once: true }
          )
        })
      }

      return await generateChirp3Audio(text, voiceId, apiKey, speakingRate, false, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`[Chirp3 HD] ❌ 시도 ${attempt}/${maxRetries} 실패:`, lastError.message)
    }
  }

  throw lastError || new Error('Chirp3 HD 오디오 생성 실패')
}
```

---

### Task 2. `constants.tsx` 수정 — 상수 추가

파일 끝부분에 아래 상수 추가 (기존 코드 수정 없이 추가만):

```typescript
// ───────────────────────────────────────────────
// Google Cloud TTS Chirp3 HD 관련 상수
// ───────────────────────────────────────────────

/** Chirp3 HD 모델 식별자 (selectedModel 값으로 사용) */
export const MODEL_CHIRP3_HD = 'google-cloud-chirp3-hd'

/** Chirp3 HD 한국어(ko-KR) 지원 음성 ID 목록
 *  기존 VOICES 배열의 id와 동일한 값 → 드롭다운 필터링만 하면 됨 */
export const CHIRP3_COMPATIBLE_VOICE_IDS: string[] = [
  'Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Orus', 'Puck', 'Zephyr',
]
```

---

### Task 3. `App.tsx` 수정

#### 3-1. import 추가 (파일 상단에 추가)

```typescript
import { generateChirp3AudioWithRetry } from './services/googleTtsService'
import { MODEL_CHIRP3_HD, CHIRP3_COMPATIBLE_VOICE_IDS } from './constants'
```

#### 3-2. Google Cloud TTS API 키 상태 추가

`const [ttsApiKeys, setTtsApiKeys] = useState<TtsApiKey[]>` 선언 근처(237줄 부근)에 추가:

```typescript
/** Google Cloud TTS Chirp3 HD 전용 API 키 */
const [googleTtsApiKey, setGoogleTtsApiKey] = useState<string>(() => {
  return localStorage.getItem('google_tts_api_key') || ''
})
useEffect(() => {
  localStorage.setItem('google_tts_api_key', googleTtsApiKey)
}, [googleTtsApiKey])
```

#### 3-3. `handleGenerateAudio` 함수에 Chirp3 분기 추가

`const isNativeAudio = selectedModel.includes('native-audio-dialog')` 선언 바로 아래에 추가:

```typescript
// ─── Chirp3 HD 분기 ───────────────────────────────────────────
if (selectedModel === MODEL_CHIRP3_HD) {
  if (!googleTtsApiKey.trim()) {
    alert('Chirp3 HD를 사용하려면 Google Cloud TTS API 키가 필요합니다.\n모델 선택 영역 아래 입력란에 키를 입력해주세요.')
    setIsLoading(false)
    return
  }

  // Chirp3는 순차 처리 (Rate Limit 대응)
  // 청크 크기: Gemini와 동일하게 1200자 기준
  const textChunks = splitTextIntoChunks(fullText, 1200, 50, 200)
  const totalChunks = textChunks.length

  let mergedAudioBuffer: AudioBuffer | null = null
  const audioChunkItems: AudioChunkItem[] = []
  let currentTimeOffsetMs = 0
  const allParsedSrt: SrtLine[] = []

  for (let i = 0; i < totalChunks; i++) {
    if (abortControllerRef.current?.signal.aborted) {
      throw new DOMException('사용자에 의해 중단되었습니다.', 'AbortError')
    }
    const chunkText = textChunks[i]
    setLoadingStatus(`Chirp3 HD 생성 중... (${i + 1}/${totalChunks})`)

    // Chirp3 speakingRate는 max 2.0 → 초과 시 클램핑은 서비스 내부에서 처리됨
    const base64Pcm = await generateChirp3AudioWithRetry(
      chunkText,
      singleSpeakerVoice,
      googleTtsApiKey,
      speechSpeed,
      abortControllerRef.current?.signal
    )

    setLoadingStatus(`오디오 처리 중... (${i + 1}/${totalChunks})`)
    const chunkBlob = createWavBlobFromBase64Pcm(base64Pcm)
    let chunkBuffer = await audioContext.decodeAudioData(await chunkBlob.arrayBuffer())

    console.log(`[Chirp3 Chunk ${i + 1}] Before trim: ${chunkBuffer.duration.toFixed(2)}s`)
    chunkBuffer = trimTrailingSilence(chunkBuffer, 0.03, 0.3)
    console.log(`[Chirp3 Chunk ${i + 1}] After trim: ${chunkBuffer.duration.toFixed(2)}s`)

    // 청크 사이 0.8초 무음 추가
    const silenceBuffer = createSilenceBuffer(audioContext, 0.8)
    const combined = audioContext.createBuffer(
      1,
      chunkBuffer.length + silenceBuffer.length,
      chunkBuffer.sampleRate
    )
    combined.getChannelData(0).set(chunkBuffer.getChannelData(0), 0)
    combined.getChannelData(0).set(silenceBuffer.getChannelData(0), chunkBuffer.length)

    // SRT 생성 (줄별 균등 분배)
    const inputLines = chunkText.split('\n').filter(l => l.trim().length > 0)
    const speechDurationMs = chunkBuffer.duration * 1000
    const avgMs = speechDurationMs / Math.max(inputLines.length, 1)

    inputLines.forEach((line, idx) => {
      allParsedSrt.push({
        id: `srt-${allParsedSrt.length + 1}-${Date.now()}`,
        index: allParsedSrt.length + 1,
        startTime: msToSrtTime(currentTimeOffsetMs + idx * avgMs),
        endTime: msToSrtTime(currentTimeOffsetMs + (idx + 1) * avgMs),
        text: line,
      })
    })
    currentTimeOffsetMs += combined.duration * 1000

    audioChunkItems.push({
      id: `chunk-${i}`,
      index: i,
      buffer: combined,
      text: chunkText,
      durationMs: combined.duration * 1000,
    })

    // 청크 병합
    if (!mergedAudioBuffer) {
      mergedAudioBuffer = combined
    } else {
      const merged = audioContext.createBuffer(
        1,
        mergedAudioBuffer.length + combined.length,
        mergedAudioBuffer.sampleRate
      )
      merged.getChannelData(0).set(mergedAudioBuffer.getChannelData(0), 0)
      merged.getChannelData(0).set(combined.getChannelData(0), mergedAudioBuffer.length)
      mergedAudioBuffer = merged
    }
  }

  if (!mergedAudioBuffer) throw new Error('Chirp3 오디오 생성에 실패했습니다.')

  setLoadingStatus('최종 파일 처리 중...')
  const finalWavBlob = encodeAudioBufferToWavBlob(mergedAudioBuffer)
  const finalUrl = URL.createObjectURL(finalWavBlob)
  const adjustedSrt = adjustSrtGaps(allParsedSrt)
  const srtText = stringifySrt(adjustedSrt)

  const newItem: AudioHistoryItem = {
    id: `audio-${Date.now()}`,
    src: finalUrl,
    scriptChunk: fullText,
    audioBuffer: mergedAudioBuffer,
    isTrimmed: false,
    contextDuration: 0,
    status: 'full',
    srtLines: adjustedSrt,
    originalSrtLines: JSON.parse(JSON.stringify(adjustedSrt)),
    audioChunks: audioChunkItems,
  }

  setTtsResult(prev => ({
    audioHistory: [newItem, ...prev.audioHistory],
    srtContent: srtText,
  }))
  setActiveAudioId(newItem.id)
  setEditableSrtLines(adjustedSrt)
  return  // ← Chirp3 처리 완료, 이후 Gemini 코드 실행 안 함
}
// ─── Chirp3 분기 끝 ──────────────────────────────────────────
```

#### 3-4. `handlePreviewVoice` 함수에 Chirp3 분기 추가

`setIsPreviewLoading` 이후, `generateSingleSpeakerAudio` 호출 전에 추가:

```typescript
// Chirp3 미리듣기
if (selectedModel === MODEL_CHIRP3_HD) {
  if (!googleTtsApiKey.trim()) {
    alert('Chirp3 미리듣기를 위해 Google Cloud TTS API 키가 필요합니다.')
    setIsPreviewLoading(prev => ({ ...prev, [voiceId]: false }))
    return
  }
  try {
    const base64Pcm = await generateChirp3AudioWithRetry(
      '안녕하세요. 이 음성으로 텍스트를 읽어드립니다.',
      voiceId,
      googleTtsApiKey,
      speechSpeed
    )
    const blob = createWavBlobFromBase64Pcm(base64Pcm)
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    await audio.play()
  } catch (e) {
    console.error('Chirp3 미리듣기 실패:', e)
    alert('Chirp3 미리듣기 실패: ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    setIsPreviewLoading(prev => ({ ...prev, [voiceId]: false }))
  }
  return  // Gemini 미리듣기 코드 실행 안 함
}
```

#### 3-5. `<MainContent>` 컴포넌트에 props 전달

App.tsx에서 `<MainContent>` 렌더링 시 다음 props 추가:

```tsx
googleTtsApiKey={googleTtsApiKey}
setGoogleTtsApiKey={setGoogleTtsApiKey}
```

---

### Task 4. `components/MainContent.tsx` 수정

#### 4-1. import 추가 (파일 상단)

```typescript
import { MODEL_CHIRP3_HD, CHIRP3_COMPATIBLE_VOICE_IDS } from '../constants'
import { generateChirp3AudioWithRetry } from '../services/googleTtsService'
```

#### 4-2. Props 인터페이스에 추가

```typescript
// Google TTS Chirp3 HD
googleTtsApiKey: string
setGoogleTtsApiKey: (key: string) => void
```

#### 4-3. 모델 선택 버튼 영역에 Chirp3 HD 버튼 추가

기존 Pro TTS `</label>` 태그 바로 다음에 추가:

```tsx
{/* Chirp3 HD 버튼 */}
<label
  className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${
    selectedModel === MODEL_CHIRP3_HD
      ? 'bg-teal-900/50 border-teal-500 text-teal-200'
      : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'
  }`}
>
  <input
    type="radio"
    name="model"
    value={MODEL_CHIRP3_HD}
    checked={selectedModel === MODEL_CHIRP3_HD}
    onChange={e => setSelectedModel(e.target.value)}
    className="hidden"
  />
  <span className="text-sm font-medium">Chirp3 HD</span>
  <span className="text-[10px] bg-teal-900/50 text-teal-300 px-1.5 py-0.5 rounded border border-teal-700">
    한국어↑
  </span>
</label>
```

#### 4-4. Chirp3 선택 시 API 키 입력란 표시 (모델 선택 div 바로 아래)

```tsx
{/* Chirp3 HD API 키 입력: 버튼 바로 아래 조건부 표시 */}
{selectedModel === MODEL_CHIRP3_HD && (
  <div className="mt-2 flex flex-col gap-1.5 p-3 bg-teal-950/30 rounded-md border border-teal-800/50">
    <label className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
      Google Cloud TTS API 키
    </label>
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={googleTtsApiKey}
        onChange={e => setGoogleTtsApiKey(e.target.value)}
        placeholder="AIza..."
        className="flex-1 bg-gray-700 border border-gray-600 rounded-md py-1.5 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
      />
      {googleTtsApiKey.trim() ? (
        <span className="text-xs text-teal-400 font-medium whitespace-nowrap shrink-0">✓ 설정됨</span>
      ) : (
        <span className="text-xs text-red-400 font-medium whitespace-nowrap shrink-0">미입력</span>
      )}
    </div>
    <p className="text-[11px] text-gray-500 leading-relaxed">
      Google Cloud Console → Text-to-Speech API 활성화 후 API 키 발급.
      월 100만 자 무료 (Chirp3 HD 기준).
    </p>
  </div>
)}
```

#### 4-5. 음성 드롭다운 필터링

음성 드롭다운이 있는 곳에서 `voices.map(...)` 부분을 찾아 다음과 같이 수정:

```tsx
{/* 수정 전: voices.map(voice => ...) */}
{/* 수정 후: Chirp3 선택 시 8개만 표시 */}
{(selectedModel === MODEL_CHIRP3_HD
  ? voices.filter(v => CHIRP3_COMPATIBLE_VOICE_IDS.includes(v.id))
  : voices
).map(voice => (
  <option key={voice.id} value={voice.id}>
    {voice.name} ({voice.gender === 'male' ? '남' : '여'}) - {voice.description}
  </option>
))}
```

#### 4-6. 톤 컨트롤 Chirp3 선택 시 비활성화

Chirp3는 tone 미지원. 톤 컨트롤 버튼 그룹을 감싸는 div를 찾아 조건부 렌더링 추가:

```tsx
{/* 톤 컨트롤: Chirp3 선택 시 숨김 */}
{selectedModel !== MODEL_CHIRP3_HD && (
  <div className="flex items-center gap-1 bg-gray-700/30 px-2 py-1 rounded-full border border-gray-600/50">
    {/* 기존 톤 컨트롤 내용 그대로 */}
  </div>
)}
```

#### 4-7. 스타일 프롬프트 입력 영역 Chirp3 선택 시 안내 텍스트 표시

스타일 프롬프트 textarea가 있는 곳 근처에 조건부 안내 추가:

```tsx
{selectedModel === MODEL_CHIRP3_HD ? (
  <div className="w-full p-2 bg-gray-700/30 rounded-md border border-gray-600/50 text-xs text-gray-400 text-center">
    Chirp3 HD는 스타일 지시어를 지원하지 않습니다.
    음성 선택으로 스타일을 결정합니다.
  </div>
) : (
  /* 기존 스타일 프롬프트 textarea */
)}
```

---

## ④ 주의사항 (절대 금지)

| ❌ 하지 말 것 | 이유 |
|--------------|------|
| `geminiService.ts` 수정 | 기존 Gemini 로직 보호 |
| `audioEncoding: 'MP3'` 사용 | 기존 `createWavBlobFromBase64Pcm` 파이프라인과 비호환 |
| `pitch` 파라미터 포함 | Chirp3 HD API 오류 발생 |
| `speakingRate > 2.0` | Chirp3 최대 속도 제한 초과 (Gemini와 다름) |
| 병렬 청크 처리 | Google Cloud TTS Rate Limit 엄격함, 순차 처리 필수 |
| 기존 `VOICES` 배열 수정 | 필터링으로만 처리 |

---

## ⑤ TypeScript 검증

작업 완료 후 반드시 실행:

```bash
npx tsc --noEmit
```

오류 0개 확인 후 감독자(Claude)에게 보고.

---

## ⑥ 피드백 섹션 (Gemini Flash 작성)

작업 완료 후 이 섹션을 채워서 Claude에게 제출:

```markdown
### 완료 항목
- [ ] services/googleTtsService.ts 생성
- [ ] constants.tsx MODEL_CHIRP3_HD, CHIRP3_COMPATIBLE_VOICE_IDS 추가
- [ ] App.tsx: googleTtsApiKey 상태, Chirp3 분기, props 전달
- [ ] MainContent.tsx: 버튼, API 키 입력란, 음성 필터링, 톤 숨김

### tsc --noEmit 결과
```
(결과 붙여넣기)
```

### 특이사항 / 발생한 문제
(구현 중 문제가 있었다면 기술)
```

---

## ⑦ Claude 감독 절차

Gemini Flash가 피드백 섹션을 제출하면 Claude는 다음을 수행:

1. **파일 검증**: `services/googleTtsService.ts`, `constants.tsx`, `App.tsx`, `MainContent.tsx` 각각 Read
2. **체크리스트 확인**:
   - `v1beta1` 엔드포인트 사용 여부
   - `pitch` 파라미터 없음 확인
   - `LINEAR16` 인코딩 사용 확인
   - `speakingRate <= 2.0` 클램핑 확인
   - 기존 Flash/Pro 버튼 코드 보존 여부
3. **타입 검사**: `npx tsc --noEmit` 실행
4. **문제 발견 시**: 구체적 줄 번호와 수정 지시 제공

---

*공식 문서 참고: [Chirp 3: HD voices](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd) | [API v1beta1 Reference](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1beta1/text/synthesize)*
