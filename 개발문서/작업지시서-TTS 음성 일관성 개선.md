# 작업지시서: TTS 음성 일관성 개선 (v2 - 코드 검증 완료)

## ⚠️ 작업 범위 제한

**수정 허용 파일 및 위치**:
- `services/geminiService.ts` - 명시된 함수만
- `App.tsx` - 명시된 라인만
- `components/MainContent.tsx` - 명시된 UI 요소만

**금지 사항**:
- 청크 사이즈 변경 금지 (기존 2500 유지)
- 명시되지 않은 함수 수정 금지
- 변수명/상수명 임의 변경 금지
- import 구문 임의 추가/삭제 금지
- 기존 로직 흐름 변경 금지
- NativeAudio 분기(isNativeAudio) 이후 API 호출 로직 변경 금지

---

## 1. 개요

**목적**:
- `toneLevel` 파라미터를 한국어/영어 이중언어 지시로 강화
- 청크 간 연속성 강화를 위한 `chunkInfo` 전달
- 하드코딩된 시스템 프롬프트 최소화 (Standard 모델용 `finalPrompt` 교체)
- Native Audio 모델 선택 UI 비활성화

**영향 범위**:
- `services/geminiService.ts` (상수 추가 + 함수 1개 추가 + 함수 2개 수정)
- `App.tsx` (1개 호출부)
- `components/MainContent.tsx` (1개 UI 요소)

**참고 자료**:
- Google Gemini TTS 프롬프팅 가이드
- 2025년 12월 TTS 업데이트 공지
- 커뮤니티 피드백: Reddit r/GoogleGeminiAI, Google AI Developer Forum

---

## 2. geminiService.ts 수정

### 2.1. 상수 및 인터페이스 추가

**위치**: 파일 상단, 기존 `getTonePrompt` 함수(145번 라인) 위

**작업**: 아래 코드 추가 (기존 코드 수정 없음)

```typescript
const TONE_LEVEL_MAP: Record<number, { ko: string; en: string }> = {
    1: {
        ko: '매우 차분하고 낮은 톤으로 읽으세요.',
        en: 'Read in a very calm and low tone.'
    },
    2: {
        ko: '차분하고 편안한 톤으로 읽으세요.',
        en: 'Read in a calm and relaxed tone.'
    },
    3: {
        ko: '자연스럽고 중립적인 톤으로 읽으세요.',
        en: 'Read in a natural and neutral tone.'
    },
    4: {
        ko: '밝고 활기찬 톤으로 읽으세요.',
        en: 'Read in a bright and lively tone.'
    },
    5: {
        ko: '매우 밝고 열정적인 톤으로 읽으세요.',
        en: 'Read in a very bright and enthusiastic tone.'
    }
};

interface ChunkInfo {
    chunkIndex: number;
    totalChunks: number;
}
```

**참고**: 기존 `getTonePrompt` 함수(145~157번 라인)는 삭제하지 않고 그대로 유지. `export`된 함수이므로 외부 참조 가능성 있음.

---

### 2.2. buildTtsPrompt 함수 추가

**위치**: `_generateAudio` 함수(326번 라인) 바로 위

**작업**: 아래 함수 추가 (기존 코드 수정 없음)

```typescript
function buildTtsPrompt(
    text: string,
    stylePrompt: string | undefined,
    speed: number,
    toneLevel: number,
    isKorean: boolean,
    chunkInfo?: ChunkInfo
): string {
    const systemInstructions: string[] = [];

    const tone = TONE_LEVEL_MAP[toneLevel] || TONE_LEVEL_MAP[3];
    systemInstructions.push(isKorean ? tone.ko : tone.en);

    if (speed !== 1.0) {
        systemInstructions.push(isKorean
            ? `속도: ${speed}x`
            : `Speed: ${speed}x`
        );
    }

    if (chunkInfo && chunkInfo.chunkIndex > 0) {
        systemInstructions.push(isKorean
            ? '이전과 동일한 톤 유지. 시작 에너지 높이지 말 것.'
            : 'Maintain same tone. Do not raise energy at start.'
        );
    }

    const userPromptSection = stylePrompt?.trim() ? `${stylePrompt.trim()}\n\n` : '';

    return `${userPromptSection}[System]
${systemInstructions.join('\n')}

[Transcript]
${text}`;
}
```

---

### 2.3. _generateAudio 함수 수정

**⚡ 현재 코드 확인 (326~334번 라인)**:
```typescript
async function _generateAudio(
  prompt: string,
  modelName: string,
  speechConfig: SpeechConfig,
  speed: number,
  toneLevel: number = 3,    // ← 이미 존재함
  stylePrompt?: string,
  signal?: AbortSignal
): Promise<string> {
```

**수정 1 - 시그니처에 chunkInfo만 추가**:

변경:
```typescript
async function _generateAudio(
  prompt: string,
  modelName: string,
  speechConfig: SpeechConfig,
  speed: number,
  toneLevel: number = 3,
  stylePrompt?: string,
  signal?: AbortSignal,
  chunkInfo?: ChunkInfo          // ← 이것만 추가
): Promise<string> {
```

**수정 2 - 내부 프롬프트 구성 부분 교체 (Standard 모델용)**:

**⚡ 제거 대상 (실제 코드 358~424번 라인 전체)**:
```typescript
// === 제거 시작 (358번 라인부터) ===
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

    // 3. Tone instructions (Re-enabled)
    instructions.push(getTonePrompt(toneLevel));

    // ... (중간 코드 전체 포함) ...

    // 마지막: else { fallback if no instructions } 블록까지
      finalPrompt = `[초정밀 TTS 모드: 아래 대본 ${numLines}줄을 정확히 낭독하세요.]\n\n${processedPrompt}`;
    }
// === 제거 끝 (424번 라인까지) ===
```

**⚠️ 주의**: 위 블록에는 `koreanPrompt`, `englishPrompt`라는 변수가 **없습니다**. 실제로는 `instructions[]` 배열과 `finalPrompt` 조합 로직입니다. 358~424번 라인 전체를 아래로 교체하세요.

**추가할 코드** (제거한 위치에 삽입):
```typescript
    const isKorean = /[가-힣]/.test(prompt);

    const finalPrompt = buildTtsPrompt(
        processedPrompt,
        stylePrompt,
        speed,
        toneLevel,
        isKorean,
        chunkInfo
    );
```

**⚠️ 절대 금지**:
- `finalPrompt` 이후의 NativeAudio 분기(431번 라인 `if (isNativeAudio)`)와 Standard REST API 호출(448번 라인 이후) 로직은 **일절 수정하지 말 것**
- `processedPrompt` 변수(340~342번 라인)는 유지할 것

---

### 2.4. generateSingleSpeakerAudio 함수 수정

**⚡ 현재 코드 확인 - Arrow Function 형태 (532~550번 라인)**:
```typescript
export const generateSingleSpeakerAudio = (
  prompt: string,
  voiceName: string,
  modelName: string,
  speed: number = 1.0,
  toneLevel: number = 3,        // ← 이미 존재함
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
```

**⚠️ 주의**: 이 함수는 `export async function`이 아니라 `export const ... = () => {}` (Arrow Function) 형태입니다.

**수정 1 - 시그니처에 chunkInfo만 추가**:

변경:
```typescript
export const generateSingleSpeakerAudio = (
  prompt: string,
  voiceName: string,
  modelName: string,
  speed: number = 1.0,
  toneLevel: number = 3,
  stylePrompt?: string,
  signal?: AbortSignal,
  chunkInfo?: ChunkInfo          // ← 이것만 추가
): Promise<string> => {
```

**수정 2 - _generateAudio 호출부만 수정 (549번 라인)**:

기존:
```typescript
  return _generateAudio(prompt, modelName, speechConfig, speed, toneLevel, stylePrompt, signal);
```

변경:
```typescript
  return _generateAudio(prompt, modelName, speechConfig, speed, toneLevel, stylePrompt, signal, chunkInfo);
```

**⚠️ 주의**:
- 첫 번째 매개변수명은 `prompt`입니다 (`text`가 아님)
- speechConfig 설정 로직 등 다른 부분 수정 금지

---

## 3. App.tsx 수정

### 3.1. 청크 루프 내 호출부 수정

**위치**: `handleGenerateAudio` 함수 내, 675번 라인 `generateSingleSpeakerAudio` 호출부

**수정 전 (675~683번 라인)**:
```typescript
const base64Pcm = await generateSingleSpeakerAudio(
    chunkText,
    singleSpeakerVoice,
    selectedModel,
    speechSpeed,
    toneLevel,
    stylePrompt,
    abortControllerRef.current.signal
);
```

**수정 후**:
```typescript
const base64Pcm = await generateSingleSpeakerAudio(
    chunkText,
    singleSpeakerVoice,
    selectedModel,
    speechSpeed,
    toneLevel,
    stylePrompt,
    abortControllerRef.current.signal,
    { chunkIndex: i, totalChunks: totalChunks }
);
```

**⚠️ 주의**:
- 이 호출부만 수정 (675번 라인)
- 1203번 라인(샘플 생성)과 1257번 라인(청크 재생성) 호출부는 수정하지 않음 (단일 청크이므로 chunkInfo 불필요)
- 청크 사이즈(2500) 변경 금지
- 루프 로직 변경 금지

---

## 4. MainContent.tsx 수정

### 4.1. Native Audio 라디오 버튼 비활성화

**위치**: 모델 선택 라디오 버튼 그룹 (1226~1237번 라인)

**⚡ 현재 코드 확인 - `<label>` + hidden `<input type="radio">` 구조**:
```tsx
<label className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${selectedModel === 'gemini-2.5-flash-native-audio-dialog-preview' ? 'bg-emerald-900/50 border-emerald-500 text-emerald-200' : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
    <input
        type="radio"
        name="model"
        value="gemini-2.5-flash-native-audio-dialog-preview"
        checked={selectedModel === 'gemini-2.5-flash-native-audio-dialog-preview'}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="hidden"
    />
    <span className="text-sm font-medium">Native Audio</span>
    <span className="text-[10px] bg-emerald-700/30 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700">무제한</span>
</label>
```

**⚠️ 주의**: 이것은 `<button>`이 아니라 `<label>` + `<input type="radio">` 구조입니다.

**수정 후**:
```tsx
<label className="flex-1 min-w-[120px] flex items-center justify-center gap-2 p-2.5 rounded-md border bg-gray-700/30 border-gray-600/50 text-gray-500 cursor-not-allowed opacity-50"
    title="현재 사용 불가"
>
    <input
        type="radio"
        name="model"
        value="gemini-2.5-flash-native-audio-dialog-preview"
        disabled={true}
        className="hidden"
    />
    <span className="text-sm font-medium">Native Audio</span>
    <span className="text-[10px] bg-gray-700/50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-600">(비활성)</span>
</label>
```

**변경 요점**:
- `className`에서 동적 선택 스타일 제거 → 고정 비활성 스타일
- `<input>` 에 `disabled={true}` 추가, `checked`/`onChange` 제거
- 배지 텍스트 "무제한" → "(비활성)"
- `cursor-not-allowed opacity-50` 추가
- 다른 버튼(Flash TTS, Pro TTS) 수정 금지

---

## 5. 수정 체크리스트

| # | 파일 | 작업 | 라인 | 완료 |
|---|------|------|------|------|
| 1 | geminiService.ts | TONE_LEVEL_MAP 상수 추가 | ~144 위 | ☐ |
| 2 | geminiService.ts | ChunkInfo 인터페이스 추가 | ~144 위 | ☐ |
| 3 | geminiService.ts | buildTtsPrompt 함수 추가 | ~326 위 | ☐ |
| 4 | geminiService.ts | _generateAudio 시그니처에 chunkInfo 추가 | 326 | ☐ |
| 5 | geminiService.ts | _generateAudio 내부 프롬프트 교체 (358~424 → buildTtsPrompt 호출) | 358~424 | ☐ |
| 6 | geminiService.ts | generateSingleSpeakerAudio 시그니처에 chunkInfo 추가 | 532 | ☐ |
| 7 | geminiService.ts | generateSingleSpeakerAudio 내부 _generateAudio 호출에 chunkInfo 전달 | 549 | ☐ |
| 8 | App.tsx | 청크 루프 호출부에 chunkInfo 객체 추가 | 675 | ☐ |
| 9 | MainContent.tsx | Native Audio 라디오 버튼 비활성화 | 1226~1237 | ☐ |

---

## 6. 금지 사항 재확인

- ❌ 청크 사이즈 변경 (2500 유지)
- ❌ 명시되지 않은 함수 수정
- ❌ import 구문 변경
- ❌ 변수명 변경
- ❌ API 호출 로직 변경 (448번 라인 이후 REST API, 431번 라인 NativeAudio 분기)
- ❌ 에러 핸들링 로직 변경
- ❌ 오디오 처리 로직 변경
- ❌ Flash TTS, Pro TTS 버튼 수정
- ❌ Native Audio 관련 백엔드 로직 삭제 (UI만 비활성화)
- ❌ `getTonePrompt()` 함수 삭제 (export된 함수이므로 유지)
- ❌ `processedPrompt` 변수 (340~342번 라인) 변경
- ❌ Arrow Function을 일반 Function으로 변환

---

## 7. 검증 방법

작업 완료 후 아래 항목을 반드시 확인:

1. **빌드 확인**: `npm run build` 에러 없이 통과
2. **TypeScript 확인**: `chunkInfo?: ChunkInfo` 타입이 3개 함수 시그니처에 일관 적용
3. **기능 테스트**:
   - Flash TTS로 2청크 이상 텍스트 생성 → 청크 간 톤 연속성 확인
   - Pro TTS로 동일 테스트
   - Native Audio 버튼 클릭 불가 확인
   - 톤 레벨 1~5 각각 한국어/영어 텍스트로 테스트
4. **회귀 테스트**:
   - 기존 프리셋 로드 후 정상 생성 확인
   - 청크 재생성 (1257번 라인) 정상 동작 확인
   - 보이스 프리뷰 (552번 라인) 정상 동작 확인

---

## 8. 작업 완료 후 필수: 완료보고서 작성

**모든 코드 수정을 마친 뒤, 반드시 아래 보고서를 `개발문서/완료보고서-TTS 음성 일관성 개선.md` 파일에 작성하세요.**

이 파일은 이미 템플릿이 준비되어 있습니다. 아래 절차를 따라 채워주세요:

### 8.1. 체크리스트 채우기 (섹션 2)
- 9개 작업 항목 각각에 대해 ☐ → ✅ 변경
- 완료하지 못한 항목이 있으면 ☐ 유지하고 비고란에 사유 기록

### 8.2. 금지사항 준수 확인 (섹션 3)
- 12개 금지 항목 각각 "준수" 또는 "위반" 체크
- 위반한 항목이 있으면 비고란에 사유와 영향 범위 기록

### 8.3. 빌드 결과 (섹션 4)
- `npm run build` 실행 후 결과 붙여넣기
- TypeScript 컴파일, Vite 빌드 성공/실패 체크
- 경고/에러 수 기록

### 8.4. 기능 테스트 (섹션 5)
- `npm run dev`로 개발 서버 실행
- Flash TTS, Pro TTS, UI, 회귀 테스트 각 항목 실행
- 성공/실패 체크 및 비고 기록
- **다중 청크 테스트는 반드시 수행** (chunkInfo 전달 확인용)

### 8.5. 변경 전후 비교 (섹션 6)
- 콘솔 로그에서 실제 전송된 프롬프트 구조를 캡처하여 붙여넣기
- 변경 전/후 프롬프트 비교가 작업지시서 의도와 일치하는지 확인

### 8.6. 작업자 메모 (섹션 7)
- 작업 중 발견한 이슈, 우려사항, 추가 개선 제안을 자유롭게 기록
- 작업지시서와 실제 코드가 다른 부분이 있었으면 반드시 기록

### 8.7. 감독 검토 영역 (섹션 8)
- **이 영역은 비워두세요** - 감독(Claude)이 직접 작성합니다

---

## 부록: v1 대비 v2 수정사항 (감독 검토 내역)

| 항목 | v1 (원본) | v2 (수정) | 사유 |
|------|-----------|-----------|------|
| _generateAudio 기존 시그니처 | toneLevel 없음 | toneLevel 이미 존재 명시 | 실제 코드 326~334번 라인과 불일치 |
| 제거 대상 코드 | koreanPrompt/englishPrompt 변수 | instructions[] + finalPrompt 조합 (358~424) | 해당 변수 존재하지 않음 |
| generateSingleSpeakerAudio 형태 | async function | const ... = () => {} (Arrow Function) | 실제 코드 532번 라인과 불일치 |
| generateSingleSpeakerAudio 호출부 | toneLevel 누락 | toneLevel 이미 전달됨 (549번) | 실제 코드와 불일치 |
| Native Audio 버튼 | `<button>` 엘리먼트 | `<label>` + `<input type="radio">` | 실제 코드 1226번 라인과 불일치 |
| 라인 번호 | 미명시 | 전체 라인 번호 명시 | 작업자 혼동 방지 |
| 수정하면 안 되는 호출부 | 미명시 | 1203, 1257번 라인 명시 | 회귀 버그 방지 |
