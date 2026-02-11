# 🚨 긴급 이슈 #002: UI 회귀 버그 긴급 수정

**보고자**: Claude PM
**심각도**: 🔴 **CRITICAL** (P0 - 즉시 수정 필요)
**보고 일시**: 2026-02-11 20:10

---

## 📋 문제 요약

사용자가 여러 UI 기능이 작동하지 않는다고 긴급 보고. 이전에는 정상 작동했던 기능들이 모두 먹통 상태.

### 긴급 상황 (현재 진행 중)
- ❌ **오디오 재생 멈출 수 없음**: 플레이 버튼 클릭 후 소리가 나는데 정지 불가
  - 사용자 보고: "플레이버튼 눌 소리 나오는데 멈출수가 없네 ㅋㅋㅋ"
  - 사용자 보고: "플레이되고 있는거부터 좀 소리 안나게 해봐.. 정지도 안되고 나참.."

---

## 🐛 발견된 버그 목록

### 1. 오디오 플레이어 버튼 작동 불가 ❌

**증상**:
- Play 버튼 클릭 시 소리는 나지만 Pause로 전환 안됨
- 정지 버튼이 작동하지 않아 오디오를 멈출 수 없음
- 원래는 플레이 시 정지 버튼으로 변경되었음

**파일**: `components/AudioPlayer.tsx`, `components/MainContent.tsx`

**근본 원인 분석 필요**:
- AudioPlayer 컴포넌트는 정상 코드 (togglePlayPause 함수 존재)
- MainContent에서 AudioPlayer 렌더링은 정상
- 상태 동기화 문제 또는 이벤트 핸들러 바인딩 문제 의심

**즉시 조치**:
1. 브라우저 개발자 도구 콘솔에서 에러 확인
2. `개발문서/EMERGENCY-STOP-AUDIO.js` 스크립트 실행하여 긴급 정지
3. 또는 페이지 새로고침 (F5)

---

### 2. 파형(Waveform) 표시 안됨 ❌

**증상**:
- 오디오 생성 후 파형 시각화가 표시되지 않음
- 원래는 오디오 아래에 파형이 표시되었음
- 스크린샷: `개발문서/Snipaste_2026-02-11_20-10-59.png`

**파일**: `components/Waveform.tsx`, `components/AudioPlayer.tsx`

**확인 사항**:
- AudioPlayer에서 Waveform 컴포넌트에 audioBuffer prop 제대로 전달되는지
- audioBuffer가 null이 아닌지
- Waveform 컴포넌트 렌더링 조건 확인

---

### 3. 타임라인/Duration 표시 안됨 ❌

**증상**:
- 생성된 클립의 재생 시간이 표시되지 않음
- 원래는 시간이 보였음 (formatTime으로 표시)

**파일**: `components/AudioPlayer.tsx`

**확인 사항**:
- duration 상태가 제대로 설정되는지
- audio element의 loadeddata 이벤트가 발생하는지
- src 속성이 제대로 설정되는지

---

### 4. 파형 클릭하여 구간 재생 불가 ❌

**증상**:
- 파형 좌우 구간 클릭 시 해당 구간 즉시 재생 기능이 작동하지 않음
- 원래는 클릭하면 해당 구간으로 즉시 재생되었음

**파일**: `components/Waveform.tsx`

**확인 사항**:
- onSeek prop이 제대로 전달되는지
- 클릭 이벤트 핸들러가 정상 작동하는지

---

### 5. 톤(Tone) 슬라이더 작동 안함 ❌

**증상**:
- 톤 슬라이더 (0-5 범위) 값 변경해도 음성에 반영 안됨
- 현재 값: 2

**파일**: `services/geminiService.ts:293`

**근본 원인**: **코드에서 의도적으로 비활성화됨**

```typescript
// Line 293
// instructions.push(getTonePrompt(toneLevel));
```

**주석 내용**: "Temporarily disabled due to API 500/Stop errors"

**문제**:
- UI에는 톤 슬라이더가 표시되지만 실제로는 작동하지 않음
- 사용자는 이 기능이 작동한다고 생각하고 사용 중
- UI와 백엔드 불일치

**해결 방안**:
1. **즉시**: UI에서 톤 슬라이더 비활성화 + 툴팁으로 "현재 톤 조절은 API 안정성 문제로 일시 비활성화됨" 표시
2. **장기**: Gemini API 500 에러 원인 파악하고 톤 기능 복원

---

### 6. 속도(Speed) 슬라이더 작동 안함 ❌

**증상**:
- 속도 슬라이더 값 변경해도 음성 속도에 반영 안됨
- 현재 값: 0.8

**파일**: `services/geminiService.ts:822`

**근본 원인**: **Pro TTS 모델은 speechSpeed 미지원**

**분석**:
- Claude PM이 Line 822에 `speechSpeed: speed` 추가했음
- 이 파라미터는 **Native Audio Dialog 모델에서만 작동**
- 사용자는 **Pro TTS 모델 (gemini-2.5-pro-preview-tts)** 사용 중
  - 증거: `app-logs-1770807996443.json:21,26,31,41,51,61,71,81`
  - 모든 로그가 "gemini-2.5-pro-preview-tts" 모델 사용

**문제**:
- Pro TTS 모델에서는 speechSpeed 파라미터가 무시됨
- UI는 속도 조절 가능한 것처럼 보이지만 실제로는 작동 안함

**해결 방안**:
1. **즉시**: Pro TTS 모델 선택 시 속도 슬라이더 비활성화 + 툴팁으로 "속도 조절은 Native Audio Dialog 모델에서만 지원됩니다" 표시
2. **장기**: Pro TTS 모델에서도 속도 조절 가능한 방법 연구 (AudioContext로 후처리 등)

---

### 7. 스타일/감정 프롬프트 (Director's Notes) 작동 안함 ❌

**증상**:
- 사용자가 상세한 스타일 프롬프트 입력해도 무시됨
- "말도 엄청빠르고 톤도 완전 무시"

**예시 프롬프트**:
```
Read in a calm, warm female narrator voice. Speak slowly and steadily,
like telling a bedtime story on a late-night radio show. Use a gentle,
comforting tone with smooth pacing. Avoid being too energetic or upbeat...
```

**파일**: `services/geminiService.ts:813-835`

**근본 원인 (이미 수정됨)**:
- 이전에는 하드코딩된 "late-night radio DJ" 페르소나가 사용자 프롬프트 덮어씀
- Claude PM이 이미 수정하여 사용자 stylePrompt를 우선 사용하도록 변경

**현재 상태**:
- ✅ stylePrompt가 systemInstruction에 제대로 들어감 (Line 827)
- ❌ 하지만 사용자가 여전히 작동 안한다고 보고

**추가 확인 필요**:
1. Pro TTS 모델이 systemInstruction을 제대로 따르는지 확인
2. Native Audio Dialog 모델과 비교 테스트
3. 프롬프트가 실제 API 요청에 포함되는지 로그 확인
4. 모델이 프롬프트를 무시하는지 여부 확인

---

### 8. "자막기로 보내기" 버튼 작동 안함 ❌

**증상**:
- "전용 자막기로 보내기" 버튼 클릭해도 자막이 전송되지 않음
- 사용자 보고: "자막기로 보내기 이버튼도 뭐 먹통이고 전용자막기쪽으로 분할된 자막 안보내짐"

**파일**: `components/AudioPlayer.tsx:219-227`, `components/MainContent.tsx`

**코드**:
```typescript
<button
  onClick={() =>
    onOpenInSubtitleEditor(item.audioBuffer, srtLines, `ai-voice-clip-${index + 1}.wav`)
  }
  className="flex items-center gap-2 bg-indigo-600..."
>
  <SparklesIcon className="w-4 h-4" />
  <span>전용 자막기로 보내기</span>
</button>
```

**확인 사항**:
1. `onOpenInSubtitleEditor` 함수가 MainContent에서 제대로 전달되는지
2. 함수 내부 로직이 정상인지
3. item.audioBuffer가 null이 아닌지
4. srtLines 배열이 제대로 전달되는지
5. 브라우저 콘솔에 에러가 있는지

---

## 🔍 근본 원인 분석

### 가능성 1: 컴포넌트 상태 동기화 문제
- AudioPlayer의 isPlaying 상태와 실제 audio element 상태 불일치
- React 리렌더링 이슈로 이벤트 핸들러 바인딩 누락

### 가능성 2: Props 전달 문제
- MainContent → AudioPlayer로 prop 제대로 전달 안됨
- item.src, item.audioBuffer 중 하나가 null

### 가능성 3: 최근 커밋에서 코드 손상
- Gemini의 오디오 병합 수정 작업(TASK-001) 중 실수로 다른 부분 손상
- Git diff 확인 필요

### 가능성 4: UI/백엔드 기능 불일치
- 톤/속도 슬라이더가 UI에는 있지만 백엔드에서 지원 안함 (또는 비활성화됨)
- 모델별 지원 기능이 다른데 UI가 이를 반영하지 못함

---

## 🎯 수정 작업 지시

### 우선순위 1: 오디오 정지 기능 복구 (즉시)

**목표**: 재생 중인 오디오를 멈출 수 있게 만들기

**작업**:
1. AudioPlayer.tsx의 togglePlayPause 함수 디버깅
2. isPlaying 상태와 audio element 상태 동기화 확인
3. 이벤트 핸들러 제대로 바인딩되는지 확인
4. 필요시 useEffect 의존성 배열 수정

**검증**:
- Play 버튼 클릭 → Pause 아이콘으로 변경
- Pause 버튼 클릭 → 오디오 즉시 정지
- 브라우저 콘솔에 에러 없음

---

### 우선순위 2: 파형/타임라인 표시 복구

**목표**: 오디오 파형과 재생 시간 다시 표시하기

**작업**:
1. item.audioBuffer가 null인지 확인
2. duration 상태가 제대로 설정되는지 확인
3. Waveform 컴포넌트 렌더링 조건 확인
4. audio element의 src 속성 확인

**검증**:
- 오디오 생성 후 파형이 시각적으로 표시됨
- 재생 시간 "00:00:00,000 / 00:00:XX,XXX" 형식으로 표시
- 파형 위에 자막 구간 표시됨

---

### 우선순위 3: 톤/속도 슬라이더 UI 수정

**목표**: 작동하지 않는 기능은 UI에서 명확히 표시

**작업**:

**톤 슬라이더**:
```tsx
<div className="flex items-center gap-2">
  <label>톤</label>
  <input
    type="range"
    min="0"
    max="5"
    value={toneLevel}
    disabled={true} // 비활성화
    className="opacity-50 cursor-not-allowed"
  />
  <span className="text-xs text-yellow-500" title="API 안정성 문제로 일시 비활성화됨">
    ⚠️ 일시 비활성화
  </span>
</div>
```

**속도 슬라이더**:
```tsx
<div className="flex items-center gap-2">
  <label>속도</label>
  <input
    type="range"
    min="0.5"
    max="2"
    step="0.1"
    value={speed}
    disabled={modelName.includes('pro-preview-tts')} // Pro TTS 모델에서 비활성화
    className={modelName.includes('pro-preview-tts') ? 'opacity-50 cursor-not-allowed' : ''}
  />
  {modelName.includes('pro-preview-tts') && (
    <span className="text-xs text-yellow-500" title="속도 조절은 Native Audio Dialog 모델에서만 지원">
      ℹ️ Native Audio 전용
    </span>
  )}
</div>
```

**검증**:
- Pro TTS 모델 선택 시 속도 슬라이더 비활성화됨
- 톤 슬라이더 항상 비활성화됨 (API 수정 전까지)
- 툴팁으로 사용자에게 명확한 안내

---

### 우선순위 4: stylePrompt 작동 여부 검증

**목표**: Director's Notes가 실제로 API에 전달되고 적용되는지 확인

**작업**:
1. Native Audio Dialog 모델로 테스트
2. Pro TTS 모델로 테스트
3. API 요청 로그에 systemInstruction 포함되는지 확인
4. 생성된 오디오가 프롬프트 지시사항 따르는지 청취 테스트

**로그 추가**:
```typescript
console.log('[Gemini API Request - Full Config]', {
  model: modelName,
  systemInstruction: config.systemInstruction?.parts[0]?.text,
  speechSpeed: config.speechConfig?.speechSpeed,
  voiceName: voiceName
});
```

**검증**:
- Native Audio 모델에서 stylePrompt가 반영됨
- Pro TTS 모델에서도 stylePrompt가 반영되는지 확인
- 로그에 전체 systemInstruction 내용 출력됨

---

### 우선순위 5: "자막기로 보내기" 버튼 수정

**목표**: 전용 자막 편집기로 데이터 전송 기능 복구

**작업**:
1. onOpenInSubtitleEditor 함수 정의 확인
2. 함수 호출 시 전달되는 파라미터 로그 출력
3. audioBuffer, srtLines, fileName이 올바른지 확인
4. 자막 편집기 탭이 제대로 열리는지 확인

**로그 추가**:
```typescript
const handleOpenInSubtitleEditor = () => {
  console.log('[자막기로 보내기]', {
    hasAudioBuffer: !!item.audioBuffer,
    srtLinesCount: srtLines.length,
    fileName: `ai-voice-clip-${index + 1}.wav`
  });
  onOpenInSubtitleEditor(item.audioBuffer, srtLines, `ai-voice-clip-${index + 1}.wav`);
};
```

**검증**:
- 버튼 클릭 시 자막 편집기 탭으로 전환됨
- 오디오 파일과 자막 데이터가 제대로 로드됨
- 콘솔에 에러 없음

---

## 🧪 테스트 계획

### 테스트 시나리오 1: 오디오 재생 제어
1. 텍스트 입력 → TTS 생성
2. Play 버튼 클릭 → 오디오 재생 시작 확인
3. 버튼이 Pause 아이콘으로 변경 확인
4. Pause 버튼 클릭 → 오디오 즉시 정지 확인
5. 버튼이 Play 아이콘으로 복귀 확인

### 테스트 시나리오 2: 파형 및 타임라인
1. TTS 생성 완료
2. 파형이 시각적으로 표시되는지 확인
3. 재생 시간 "00:00:00,000 / 00:XX:XX,XXX" 표시 확인
4. 재생 중 currentTime이 업데이트되는지 확인
5. 파형 위에 자막 구간 강조 표시되는지 확인

### 테스트 시나리오 3: 파형 클릭 재생
1. 파형의 중간 부분 클릭
2. 해당 시간으로 즉시 이동하는지 확인
3. 재생이 클릭한 위치부터 시작되는지 확인

### 테스트 시나리오 4: 톤/속도 슬라이더 UI
1. Pro TTS 모델 선택 시 속도 슬라이더 비활성화 확인
2. 톤 슬라이더 항상 비활성화 확인
3. 툴팁 마우스 오버 시 설명 표시 확인

### 테스트 시나리오 5: stylePrompt 반영
1. Native Audio Dialog 모델 선택
2. Director's Notes에 상세 스타일 입력
3. TTS 생성 후 청취하여 스타일 반영 확인
4. Pro TTS 모델로 동일 테스트 반복

### 테스트 시나리오 6: 자막기로 보내기
1. TTS 생성 완료 (자막 포함)
2. "전용 자막기로 보내기" 버튼 클릭
3. 자막 편집기 탭으로 전환 확인
4. 오디오 및 자막 데이터 로드 확인

---

## 📌 추가 조사 사항

### Git History 분석
```bash
git log --oneline --all -10
git diff 240cf90^..240cf90 components/AudioPlayer.tsx
git diff 240cf90^..240cf90 components/MainContent.tsx
git diff 240cf90^..240cf90 components/Waveform.tsx
```

### 브라우저 콘솔 에러 확인
- 개발자 도구 → Console 탭에서 빨간 에러 확인
- React 경고 메시지 확인
- Network 탭에서 API 요청/응답 확인

### 이전 작동 버전 식별
- 사용자: "깃허브 찾아보면 예전 동작방식 확인 가능할꺼야"
- 최근 5개 커밋 중 AudioPlayer가 정상 작동했던 커밋 찾기
- 해당 커밋과 현재 코드 비교

---

## 🚨 긴급 조치 사항

### 사용자에게 즉시 안내할 내용:

1. **오디오 정지 방법**:
   - 브라우저 개발자 도구 (F12) → Console 탭 열기
   - `개발문서/EMERGENCY-STOP-AUDIO.js` 파일 내용 복사하여 붙여넣기
   - 또는 페이지 새로고침 (F5)

2. **현재 버그 상태**:
   - 톤 슬라이더: API 안정성 문제로 일시 비활성화 상태
   - 속도 슬라이더: Pro TTS 모델에서 미지원 (Native Audio 모델 사용 필요)
   - Director's Notes: 작동 여부 검증 중
   - 오디오 플레이어: 긴급 수정 진행 중

3. **임시 해결책**:
   - Native Audio Dialog 모델 사용 권장 (속도 조절 지원)
   - 톤 조절은 현재 사용 불가
   - 오디오 재생 문제 시 페이지 새로고침

---

## 📅 예상 일정

- **긴급 수정 (오디오 정지)**: 즉시 (1시간 이내)
- **파형/타임라인 복구**: 2시간
- **UI 수정 (톤/속도)**: 1시간
- **stylePrompt 검증**: 3시간
- **자막기 버튼 수정**: 1시간
- **전체 테스트**: 2시간

**총 예상 시간**: 8-10시간

---

**Claude PM 코멘트**:

제미나이 작업 결과 검증 중 발견한 치명적인 회귀 버그입니다.

1. **오디오 재생 멈출 수 없는 문제**가 가장 긴급합니다. 사용자가 현재 매우 불편한 상태입니다.

2. **톤/속도 슬라이더가 UI에만 있고 실제로 작동하지 않는 문제**는 사용자 경험을 크게 해칩니다. UI와 백엔드 기능 일치시켜야 합니다.

3. **모델별 지원 기능 차이**를 UI에 반영해야 합니다:
   - Pro TTS: stylePrompt만 지원 (속도/톤 미지원)
   - Native Audio: stylePrompt + 속도 지원 (톤은 현재 비활성화)

4. AudioPlayer 컴포넌트 코드 자체는 정상입니다. 상태 동기화 또는 props 전달 문제로 보입니다.

제미나이, 위 지시사항에 따라 우선순위 순서대로 수정해주세요. 각 수정 후 검증 결과를 `FEEDBACK-002-Gemini.md`로 보고해주세요.
