# 🎯 작업 지시서 #001: 오디오 병합 로직 개선 및 UI 버그 수정

**발행일**: 2026-02-11
**우선순위**: 🔴 HIGH
**담당**: Gemini
**검증자**: Claude PM

---

## 📌 작업 개요

### 문제 정의
1. **오디오 재생 속도 저하 (0.2배속 문제)**
   - 증상: 병합된 오디오가 매우 느리게 재생됨
   - 원인: 24kHz PCM 데이터를 단순 바이트 병합(Byte Concatenation)하여 44.1kHz/48kHz 재생 환경과 샘플 레이트 불일치

2. **"개별 청크 다운로드" 버튼 누락**
   - 증상: 병합 실패 시 청크 다운로드 버튼이 보이지 않음
   - 영향: 병합 실패 시 생성된 데이터를 살릴 수 없음

---

## 🔧 수정 범위

### 1️⃣ Header.tsx - 새로운 병합 함수 추가

**파일 경로**: `D:\01_Antigravity\12_AI-Voice-Studio\components\Header.tsx`

**위치**: `encodeAudioBufferToWavBlob` 함수 바로 다음에 추가

**함수 시그니처**:
```typescript
/**
 * AudioContext 기반 견고한 오디오 병합 (샘플 레이트 자동 통일)
 * @param buffers 병합할 AudioBuffer 배열
 * @param silenceMs 청크 간 무음 시간 (밀리초)
 * @returns 병합된 AudioBuffer
 */
export function mergeAudioBuffers(
  buffers: AudioBuffer[],
  silenceMs: number = 500
): AudioBuffer
```

**구현 요구사항**:
- ✅ AudioContext를 사용하여 모든 청크를 동일한 샘플 레이트로 통일
- ✅ 청크 간 무음(Silence) 정확히 삽입
- ✅ 에러 핸들링:
  - 빈 배열 입력 시 예외 발생
  - 샘플 레이트 불일치 자동 처리
  - 디코드 실패 시 명확한 에러 메시지

**구현 가이드**:
```typescript
// 1. AudioContext 생성 (시스템 기본 샘플 레이트 사용)
const audioContext = new AudioContext()
const sampleRate = audioContext.sampleRate // 보통 44100 또는 48000

// 2. 전체 길이 계산 (무음 포함)
const silenceSamples = Math.floor((silenceMs / 1000) * sampleRate)
const totalLength = buffers.reduce((sum, buf) => {
  return sum + buf.length + silenceSamples
}, 0) - silenceSamples // 마지막 무음 제거

// 3. 새로운 병합 버퍼 생성
const merged = audioContext.createBuffer(
  buffers[0].numberOfChannels,
  totalLength,
  sampleRate
)

// 4. 각 청크 복사 + 무음 삽입
let offset = 0
for (let i = 0; i < buffers.length; i++) {
  const buffer = buffers[i]

  // 채널별 데이터 복사
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    merged.getChannelData(ch).set(buffer.getChannelData(ch), offset)
  }

  offset += buffer.length

  // 마지막 청크가 아니면 무음 추가
  if (i < buffers.length - 1) {
    offset += silenceSamples
  }
}

return merged
```

---

### 2️⃣ geminiService.ts - 병합 로직 교체

**파일 경로**: `D:\01_Antigravity\12_AI-Voice-Studio\services\geminiService.ts`

**수정 대상 함수**: `generateAudioWithLiveAPIMultiTurn`

**현재 문제 코드**:
```typescript
// Line 944: 바이트 병합 (❌ 문제)
const lineAudio = mergeArrayBuffers(currentLineAudio)

// Line 962: 바이트 병합 (❌ 문제)
audioBuffer: mergeAudioWithSilence(audioResults, silenceBetweenLinesMs)
```

**수정 방안**:

#### Step 1: 상단에 import 추가
```typescript
import { mergeAudioBuffers, createWavBlobFromBase64Pcm } from '../components/Header'
```

#### Step 2: 청크 수집 시 즉시 디코딩
```typescript
// Line 850-858 수정 (onmessage 핸들러 내부)
if (response.serverContent?.modelTurn?.parts) {
  for (const part of response.serverContent.modelTurn.parts) {
    if (part.inlineData?.data) {
      // ❌ 기존: ArrayBuffer로 저장
      // const chunk = base64ToArrayBuffer(part.inlineData.data)

      // ✅ 수정: 즉시 AudioBuffer로 디코딩
      const pcmData = part.inlineData.data
      const wavBlob = createWavBlobFromBase64Pcm(pcmData)
      const arrayBuffer = await wavBlob.arrayBuffer()
      const audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      console.log(`[Gemini Live API] Chunk decoded: ${audioBuffer.duration.toFixed(2)}s`)
      currentLineAudio.push(audioBuffer) // AudioBuffer 배열로 저장
    }
  }
}
```

#### Step 3: 변수 타입 변경
```typescript
// Line 766-768 수정
const audioResults: AudioBuffer[] = [] // ArrayBuffer[] → AudioBuffer[]
let currentLineAudio: AudioBuffer[] = [] // ArrayBuffer[] → AudioBuffer[]
```

#### Step 4: 병합 로직 교체
```typescript
// Line 943-945 수정
const lineAudio = mergeAudioBuffers(currentLineAudio, 0) // 라인 내부는 무음 없음
audioResults.push(lineAudio)

// Line 947-952 수정 (타이밍 계산)
const lineDurationMs = lineAudio.duration * 1000 // AudioBuffer.duration 사용
lineTimings.push({
  start: cumulativeTimeMs,
  end: cumulativeTimeMs + lineDurationMs,
})
```

#### Step 5: 최종 반환값 변경
```typescript
// Line 961-965 수정
const finalMerged = mergeAudioBuffers(audioResults, silenceBetweenLinesMs)

// AudioBuffer를 WAV ArrayBuffer로 변환
const wavBlob = encodeAudioBufferToWavBlob(finalMerged)
const wavArrayBuffer = await wavBlob.arrayBuffer()

resolve({
  audioBuffer: wavArrayBuffer, // WAV 형식 ArrayBuffer 반환
  lineTimings,
  paragraphs,
})
```

---

### 3️⃣ MainContent.tsx - UI 버튼 조건 수정

**파일 경로**: `D:\01_Antigravity\12_AI-Voice-Studio\components\MainContent.tsx`

**수정 대상**: "개별 청크 Zip 다운로드" 버튼 표시 조건

**현재 코드 찾기**:
```typescript
// "개별 청크" 또는 "Zip 다운로드" 버튼 조건 검색
```

**수정 방안**:
```typescript
{/* ✅ 수정: audioChunks가 있으면 무조건 표시 */}
{item.audioChunks && item.audioChunks.length > 0 && (
  <button
    onClick={() => onDownloadChunksAsZip?.(item.id)}
    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-colors"
    title="청크별 오디오를 ZIP으로 다운로드"
  >
    📦 개별 청크 Zip 다운로드
  </button>
)}
```

---

## ✅ 검증 기준

### 자동 검증
```bash
npm run typecheck  # 타입 오류 없어야 함
npm run lint       # 린트 오류 없어야 함
```

### 수동 검증

#### 1. 오디오 속도 테스트
- [ ] Native Audio 모델로 멀티라인 스크립트 생성
- [ ] 생성된 오디오가 정상 속도(1.0x)로 재생됨
- [ ] 병합 전/후 duration이 예상 범위 내 (±5%)
- [ ] 브라우저 개발자 도구에서 샘플 레이트 확인 (44.1kHz 또는 48kHz)

#### 2. UI 버튼 테스트
- [ ] 오디오 생성 성공 시 "Zip 다운로드" 버튼 즉시 보임
- [ ] 병합 실패 시에도 "Zip 다운로드" 버튼 보임
- [ ] 버튼 클릭 시 모든 청크가 포함된 Zip 다운로드됨
- [ ] Zip 내부 파일 개수 = 청크 개수 * 2 (WAV + TXT)

#### 3. 에러 핸들링 테스ト
- [ ] 빈 스크립트 입력 시 명확한 에러 메시지
- [ ] 네트워크 오류 시 적절한 에러 처리
- [ ] 청크 디코딩 실패 시 에러 메시지 출력

---

## 🚫 금지 사항

- ❌ 기존 함수 시그니처 변경 금지 (호출부 영향 최소화)
- ❌ App.tsx 수정 금지 (호출부는 그대로 유지)
- ❌ 기존 `mergeArrayBuffers` / `mergeAudioWithSilence` 함수 삭제 금지 (다른 곳에서 사용 가능성)
- ❌ 타입 정의 변경 금지 (types.ts는 건드리지 말 것)

---

## 📤 작업 완료 후 제출 형식

작업 완료 후 아래 템플릿으로 `개발문서/FEEDBACK-001-Gemini.md` 파일 생성:

```markdown
# 피드백 #001: 오디오 병합 수정 완료

**작업자**: Gemini
**작업 완료 시간**: YYYY-MM-DD HH:MM

## ✅ 완료 항목
- [ ] Header.tsx - mergeAudioBuffers 함수 추가
- [ ] geminiService.ts - 병합 로직 교체
- [ ] MainContent.tsx - UI 버튼 조건 수정

## 📝 수정 내용 요약
### Header.tsx
- 추가한 코드 라인 수: XXX
- 주요 변경 사항: ...

### geminiService.ts
- 수정한 코드 라인 수: XXX
- 주요 변경 사항: ...

### MainContent.tsx
- 수정한 코드 라인 수: XXX
- 주요 변경 사항: ...

## 🧪 자체 검증 결과
- [ ] npm run typecheck 통과
- [ ] npm run lint 통과
- [ ] 오디오 재생 속도 정상 확인
- [ ] 버튼 표시 확인

## ⚠️ 발견된 이슈
(없으면 "없음")

## 💬 추가 코멘트
(특이사항이나 개선 제안)
```

---

## 📞 질문/이슈 발생 시

문제 발생 시 `개발문서/ISSUE-001-Gemini.md` 파일 생성하여 보고:

```markdown
# 🚨 이슈 보고

**발생 시간**: YYYY-MM-DD HH:MM
**심각도**: LOW / MEDIUM / HIGH / CRITICAL

## 문제 설명
(구체적으로 무엇이 문제인지)

## 재현 방법
1. ...
2. ...

## 에러 메시지
```
(에러 로그 붙여넣기)
```

## 시도한 해결 방법
- ...

## 도움 요청 사항
(PM에게 요청할 내용)
```

---

## 🎯 예상 작업 시간
- Header.tsx: 30분
- geminiService.ts: 1시간
- MainContent.tsx: 15분
- 테스트: 30분
- **총 예상**: 2시간 15분

---

**화이팅! 🚀**

Claude PM이 검증 대기 중입니다.
