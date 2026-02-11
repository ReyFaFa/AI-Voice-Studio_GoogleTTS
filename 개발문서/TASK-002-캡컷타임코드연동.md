# 📋 TASK-002: CapCut 타임코드 연동 시스템 구현

**작업자**: Gemini
**검토자**: Claude PM
**작성일**: 2026-02-11
**우선순위**: 🔴 HIGH

---

## 🚨 ⚠️ 중요 경고 - 반드시 읽을 것! ⚠️ 🚨

### ❌ 절대 금지 사항

1. **이 지시서에 명시되지 않은 파일 수정 금지**
   - 지시서에 없는 파일은 **절대** 건드리지 마세요
   - "더 좋게 만들려고" 다른 파일 수정하지 마세요
   - "리팩토링" 하지 마세요

2. **이 지시서에 명시되지 않은 기능 추가 금지**
   - "이것도 필요할 것 같아서" 추가 기능 구현하지 마세요
   - "더 편리하게" 만들려고 UI 변경하지 마세요
   - "성능 개선" 명목으로 코드 변경하지 마세요

3. **뻘짓 금지**
   - 지시서에 정확히 명시된 것만 하세요
   - 창의성 발휘하지 마세요
   - 추측하지 마세요
   - 알아서 판단하지 마세요

### ✅ 허용된 작업 범위

**오직 이 2개 파일만 수정 가능**:
1. `components/MainContent.tsx` - 지시서에 명시된 부분만
2. `App.tsx` - 지시서에 명시된 부분만

**작업 내용**:
- UI 버튼 2개 추가 (정확한 위치 지정됨)
- 함수 4개 구현 (코드 전체 제공됨)
- Props 연결 (정확한 인터페이스 제공됨)

**그 외 모든 것은 금지입니다!**

### 📏 작업 원칙

1. **지시서 = 성경**
   - 지시서에 쓰인 대로만 하세요
   - 한 글자도 벗어나지 마세요

2. **의심되면 하지 마세요**
   - "이것도 해야 하나?" → 지시서에 없으면 NO
   - "이게 더 나은데?" → 지시서와 다르면 NO
   - "추가로 이것도?" → 지시서에 없으면 NO

3. **완료 = 지시서 체크리스트 완료**
   - 체크리스트 항목만 완료하면 됨
   - 그 이상도, 그 이하도 아님

---

## 🎯 작업 목표

좌측 상세편집의 깔끔한 스크립트를 우측 자막 영역으로 복사하고, CapCut에서 생성한 SRT 파일의 정확한 타임코드를 매칭하는 시스템 구현.

---

## 📊 배경 및 문제 정의

### 현재 상황
1. **이 앱**: 자막분할25 + 자동줄바꿈으로 깔끔한 스크립트 생성 ✅
2. **CapCut 자동자막**: 타임코드는 정확하지만 텍스트 엉망 (오탈자, 띄어쓰기, 문단 구분) ❌

### 해결 방법
- **텍스트**: 이 앱의 깔끔한 스크립트 사용
- **타임코드**: CapCut의 정확한 타임코드 사용
- **결과**: 완벽한 SRT = 깔끔한 텍스트 + 정확한 타임코드

---

## 🔄 전체 워크플로우

```
1. [좌측 상세편집] 스크립트 작성 및 자막분할
   ↓
2. [캡컷 타임코드 연동] 버튼 클릭
   ↓
3. 스크립트 → [우측 자막 영역] 복사 (임시 타임코드 00:00:00,000)
   ↓
4. [오디오 생성] (언제든 가능 - 오늘/내일)
   ↓
5. CapCut에서 편집 + 자동자막 생성 → SRT 다운로드
   ↓
6. [우측 상단] "CapCut SRT 업로드" 버튼 클릭
   ↓
7. CapCut SRT 타임코드 추출 → 기존 텍스트와 매칭
   ↓
8. 완성! (깔끔한 텍스트 + 정확한 타임코드)
```

---

## 🎨 UI 변경사항

### 1. 좌측 패널 (상세편집 영역)

**위치**: `components/MainContent.tsx` Line ~170

**기존**:
```tsx
[자동 줄바꿈 설정]
```

**변경**:
```tsx
[캡컷 타임코드 연동] [자동 줄바꿈 설정]
```

**버튼 스펙**:
```tsx
<button
    onClick={handleCopyToCapCutSync}
    className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors flex items-center gap-1.5"
    title="좌측 스크립트를 우측 자막 영역으로 복사하여 CapCut 타임코드 연동 준비"
>
    <LinkIcon className="w-3.5 h-3.5" />
    캡컷 타임코드 연동
</button>
```

---

### 2. 우측 패널 (자막 영역 상단)

**위치**: `components/MainContent.tsx` Line ~1090 (자막 테이블 위)

**추가할 요소**:
```tsx
{/* CapCut SRT Upload Section */}
<div className="flex-shrink-0 flex justify-between items-center p-3 border-b border-gray-700 bg-gray-800/50">
    <h3 className="text-sm font-semibold text-gray-300">자막 목록</h3>
    <div className="flex items-center gap-2">
        <input
            ref={capCutFileInputRef}
            type="file"
            accept=".srt"
            onChange={handleCapCutSrtUpload}
            className="hidden"
        />
        <button
            onClick={() => capCutFileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors flex items-center gap-1.5"
            title="CapCut에서 다운로드한 SRT 파일을 업로드하여 타임코드 매칭"
        >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            CapCut SRT 업로드
        </button>
    </div>
</div>
```

---

## ⚙️ 기능 구현

### 1. handleCopyToCapCutSync 함수

**파일**: `components/MainContent.tsx`

**위치**: 다른 핸들러 함수들 근처 (Line ~520)

**구현**:
```typescript
// Ref 추가 (컴포넌트 상단)
const capCutFileInputRef = useRef<HTMLInputElement>(null);

// 함수 구현
const handleCopyToCapCutSync = useCallback(() => {
    // 1. 빈 스크립트 체크
    const validLines = scriptLines.filter(l => l.text.trim());

    if (validLines.length === 0) {
        alert('스크립트가 비어있습니다. 먼저 좌측에 텍스트를 입력해주세요.');
        return;
    }

    // 2. SRT 형식으로 변환 (임시 타임코드)
    const srtLines: SrtLine[] = validLines.map((line, index) => ({
        id: `capcutsync-${Date.now()}-${index + 1}`,
        index: index + 1,
        startTime: "00:00:00,000",  // 임시 플레이스홀더
        endTime: "00:00:00,000",    // 임시 플레이스홀더
        text: line.text
    }));

    // 3. 부모 컴포넌트(App.tsx)에 전달하여 상태 업데이트
    onCopyScriptToSrt(srtLines);

    // 4. 사용자 안내
    alert(
        `✅ ${srtLines.length}개 라인이 우측 자막 영역으로 복사되었습니다.\n\n` +
        `다음 단계:\n` +
        `1. 오디오 생성 (선택사항)\n` +
        `2. CapCut에서 편집 후 SRT 다운로드\n` +
        `3. 우측 상단 "CapCut SRT 업로드" 버튼으로 타임코드 매칭`
    );
}, [scriptLines, onCopyScriptToSrt]);
```

**필요한 Props 추가** (`MainContentProps` 인터페이스):
```typescript
export interface MainContentProps {
    // ... 기존 props ...

    // CapCut Sync Props (NEW)
    onCopyScriptToSrt: (srtLines: SrtLine[]) => void;
}
```

---

### 2. handleCapCutSrtUpload 함수

**파일**: `components/MainContent.tsx`

**구현**:
```typescript
const handleCapCutSrtUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 확장자 체크
    if (!file.name.endsWith('.srt')) {
        alert('❌ SRT 파일만 업로드 가능합니다.');
        return;
    }

    try {
        // 1. 파일 읽기
        const text = await file.text();

        // 2. SRT 파싱 (parseSrt 함수 사용 - 이미 존재)
        const capCutSrt = parseSrt(text);

        if (capCutSrt.length === 0) {
            alert('❌ SRT 파일이 비어있거나 형식이 잘못되었습니다.');
            return;
        }

        // 3. 현재 우측 자막과 매칭
        const currentSrt = editableSrtLines;

        if (currentSrt.length === 0) {
            alert('❌ 먼저 "캡컷 타임코드 연동" 버튼을 클릭하여 스크립트를 복사해주세요.');
            return;
        }

        // 4. 타임코드 매칭 (줄 번호 기준 1:1 매칭)
        const matchedSrt: SrtLine[] = currentSrt.map((line, index) => {
            if (capCutSrt[index]) {
                return {
                    ...line,
                    startTime: capCutSrt[index].startTime,
                    endTime: capCutSrt[index].endTime
                    // text는 유지 (깔끔한 원본)
                };
            }
            return line; // CapCut SRT에 해당 줄이 없으면 그대로 유지
        });

        // 5. 부모 컴포넌트에 업데이트 전달
        onUpdateSrtFromCapCut(matchedSrt);

        // 6. 성공 알림
        alert(
            `✅ CapCut SRT 타임코드 매칭 완료!\n\n` +
            `매칭된 라인: ${Math.min(currentSrt.length, capCutSrt.length)}개\n` +
            `전체 라인: ${currentSrt.length}개`
        );

        console.log('[CapCut Sync] 타임코드 매칭 완료', {
            originalLines: currentSrt.length,
            capCutLines: capCutSrt.length,
            matched: Math.min(currentSrt.length, capCutSrt.length)
        });

    } catch (error) {
        console.error('[CapCut Sync] 업로드 실패:', error);
        alert('❌ SRT 파일 처리 중 오류가 발생했습니다.');
    } finally {
        // 파일 입력 초기화 (같은 파일 재업로드 가능하도록)
        e.target.value = '';
    }
}, [editableSrtLines, onUpdateSrtFromCapCut]);
```

**필요한 Props 추가** (`MainContentProps` 인터페이스):
```typescript
export interface MainContentProps {
    // ... 기존 props ...

    // CapCut Sync Props (NEW)
    onCopyScriptToSrt: (srtLines: SrtLine[]) => void;
    onUpdateSrtFromCapCut: (srtLines: SrtLine[]) => void;
}
```

---

### 3. App.tsx 핸들러 구현

**파일**: `App.tsx`

**위치**: 다른 핸들러 함수들 근처 (handleUpdateSrtLine 등)

**구현**:
```typescript
// 1. CapCut 연동: 스크립트 → 자막 영역 복사
const handleCopyScriptToSrt = useCallback((srtLines: SrtLine[]) => {
    // editableSrtLines 업데이트
    setEditableSrtLines(srtLines);

    // originalSrtLines도 업데이트 (리셋 기준점)
    setOriginalSrtLines(JSON.parse(JSON.stringify(srtLines)));

    // srtContent 생성
    const srtContent = stringifySrt(srtLines);

    // ttsResult 업데이트 (srtContent)
    setTtsResult(prev => ({
        ...prev,
        srtContent: srtContent
    }));

    // hasTimestampEdits 초기화
    setHasTimestampEdits(false);

    console.log('[CapCut Sync] 스크립트 복사 완료:', srtLines.length, '라인');
}, []);

// 2. CapCut SRT 업로드: 타임코드 매칭
const handleUpdateSrtFromCapCut = useCallback((matchedSrtLines: SrtLine[]) => {
    // editableSrtLines 업데이트
    setEditableSrtLines(matchedSrtLines);

    // originalSrtLines도 업데이트
    setOriginalSrtLines(JSON.parse(JSON.stringify(matchedSrtLines)));

    // srtContent 생성
    const srtContent = stringifySrt(matchedSrtLines);

    // ttsResult 업데이트
    setTtsResult(prev => ({
        ...prev,
        srtContent: srtContent
    }));

    // activeAudioId가 있다면 해당 audioHistory 아이템도 업데이트
    if (activeAudioId) {
        setTtsResult(prev => ({
            ...prev,
            audioHistory: prev.audioHistory.map(item =>
                item.id === activeAudioId
                    ? {
                        ...item,
                        srtLines: matchedSrtLines,
                        originalSrtLines: JSON.parse(JSON.stringify(matchedSrtLines))
                    }
                    : item
            )
        }));
    }

    // hasTimestampEdits 초기화
    setHasTimestampEdits(false);

    console.log('[CapCut Sync] 타임코드 매칭 완료:', matchedSrtLines.length, '라인');
}, [activeAudioId]);
```

**MainContent 컴포넌트에 props 전달**:
```tsx
<MainContent
    // ... 기존 props ...

    // CapCut Sync Props (NEW)
    onCopyScriptToSrt={handleCopyScriptToSrt}
    onUpdateSrtFromCapCut={handleUpdateSrtFromCapCut}
/>
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 기본 워크플로우

1. **스크립트 작성**
   - 좌측 상세편집에 텍스트 입력
   - 자막분할25 적용
   - 자동 줄바꿈 적용
   - 결과: 3줄로 깔끔하게 분할됨

2. **캡컷 연동 준비**
   - `[캡컷 타임코드 연동]` 버튼 클릭
   - 알림: "✅ 3개 라인이 우측 자막 영역으로 복사되었습니다."
   - 우측 자막 영역 확인:
     ```
     1
     00:00:00,000 --> 00:00:00,000
     안녕하세요! AI 보이스 스튜디오입니다.

     2
     00:00:00,000 --> 00:00:00,000
     텍스트를 입력하고 줄 단위로...

     3
     00:00:00,000 --> 00:00:00,000
     원하는 목소리를 선택하여...
     ```

3. **오디오 생성** (선택사항)
   - `[생성]` 버튼 클릭
   - TTS 오디오 생성
   - WAV 파일 다운로드

4. **CapCut 편집**
   - WAV 파일을 CapCut으로 가져오기
   - 자동 자막 생성 클릭
   - SRT 파일 다운로드 (`capcutSRT.srt`)
   - 예상 내용:
     ```
     1
     00:00:01,234 --> 00:00:03,567
     안녕하세요여러분AI보이스스튜디오입니다

     2
     00:00:03,567 --> 00:00:07,890
     텍스트를입력하고줄단위로스타일을지정해보세요

     3
     00:00:07,890 --> 00:00:11,234
     원하는목소리를선택하여오디오를생성할수있습니다
     ```

5. **타임코드 매칭**
   - 우측 상단 `[CapCut SRT 업로드]` 버튼 클릭
   - `capcutSRT.srt` 파일 선택
   - 알림: "✅ CapCut SRT 타임코드 매칭 완료! 매칭된 라인: 3개"
   - 우측 자막 영역 확인:
     ```
     1
     00:00:01,234 --> 00:00:03,567
     안녕하세요! AI 보이스 스튜디오입니다.  ← 깔끔한 텍스트

     2
     00:00:03,567 --> 00:00:07,890
     텍스트를 입력하고 줄 단위로...  ← 깔끔한 텍스트

     3
     00:00:07,890 --> 00:00:11,234
     원하는 목소리를 선택하여...  ← 깔끔한 텍스트
     ```

6. **검증**
   - 텍스트: 이 앱의 깔끔한 원본 유지 ✅
   - 타임코드: CapCut의 정확한 타이밍 반영 ✅
   - SRT 다운로드 가능 ✅

---

### 시나리오 2: 에러 처리

**2-1. 빈 스크립트로 연동 시도**
- 좌측 스크립트 비어있음
- `[캡컷 타임코드 연동]` 클릭
- 알림: "스크립트가 비어있습니다. 먼저 좌측에 텍스트를 입력해주세요."

**2-2. 연동 전 SRT 업로드 시도**
- 우측 자막 영역 비어있음
- `[CapCut SRT 업로드]` 클릭
- 알림: "먼저 '캡컷 타임코드 연동' 버튼을 클릭하여 스크립트를 복사해주세요."

**2-3. 잘못된 파일 형식**
- `.txt` 파일 업로드 시도
- 알림: "❌ SRT 파일만 업로드 가능합니다."

**2-4. 빈 SRT 파일**
- 내용 없는 `.srt` 파일 업로드
- 알림: "❌ SRT 파일이 비어있거나 형식이 잘못되었습니다."

**2-5. 줄 수 불일치**
- 이 앱: 5줄
- CapCut SRT: 3줄
- 매칭 결과: 처음 3줄만 타임코드 업데이트, 나머지 2줄은 00:00:00,000 유지
- 알림: "매칭된 라인: 3개 / 전체 라인: 5개"

---

### 시나리오 3: 반복 워크플로우

1. 스크립트 작성 → 캡컷 연동 → 오디오 생성 (오늘)
2. CapCut 편집 → SRT 다운로드 (내일)
3. SRT 업로드 → 타임코드 매칭 (내일)
4. 최종 SRT 다운로드 → CapCut에서 재사용 (내일)

**검증**:
- 각 단계가 독립적으로 작동 ✅
- 시간차 작업 가능 ✅
- 여러 번 반복 가능 ✅

---

## 📝 주의사항

### 1. 기존 코드 보존
- ❌ `handleGenerateAudio` 수정 금지
- ❌ 기존 자막 생성 로직 변경 금지
- ✅ 새로운 기능만 추가

### 2. 상태 관리
- `editableSrtLines`: 편집 가능한 SRT
- `originalSrtLines`: 리셋 기준점
- `srtContent`: SRT 문자열
- 모두 동기화 필수!

### 3. 타임코드 형식
- SRT 표준: `00:00:00,000 --> 00:00:00,000`
- 쉼표(,) 사용 (마침표 아님)
- 밀리초 3자리

### 4. parseSrt 함수
- 이미 존재함 (`components/Header.tsx`)
- SRT 문자열 → SrtLine[] 변환
- 그대로 사용

### 5. stringifySrt 함수
- 이미 존재함 (`components/Header.tsx`)
- SrtLine[] → SRT 문자열 변환
- 그대로 사용

---

## ✅ 완료 체크리스트

### UI 구현
- [ ] `[캡컷 타임코드 연동]` 버튼 추가 (좌측 패널)
- [ ] `[CapCut SRT 업로드]` 버튼 추가 (우측 패널 상단)
- [ ] 파일 입력 숨김 처리 (`<input type="file" hidden>`)

### 함수 구현
- [ ] `handleCopyToCapCutSync` 구현 (MainContent.tsx)
- [ ] `handleCapCutSrtUpload` 구현 (MainContent.tsx)
- [ ] `handleCopyScriptToSrt` 구현 (App.tsx)
- [ ] `handleUpdateSrtFromCapCut` 구현 (App.tsx)

### Props 연결
- [ ] `MainContentProps` 인터페이스에 props 추가
- [ ] App.tsx → MainContent props 전달
- [ ] MainContent에서 props destructuring

### 테스트
- [ ] 시나리오 1: 기본 워크플로우 테스트
- [ ] 시나리오 2: 모든 에러 케이스 테스트
- [ ] 시나리오 3: 반복 워크플로우 테스트

### 검증
- [ ] TypeScript 타입 체크 통과
- [ ] ESLint 에러 없음
- [ ] 콘솔 에러 없음
- [ ] 기존 기능 정상 작동

---

## 📤 작업 완료 보고 (필수!)

### 🚨 중요: 피드백 문서 작성 필수!

**코드 수정 완료 ≠ 작업 완료**

**진짜 작업 완료 = 코드 수정 + 피드백 문서 작성**

---

### 피드백 문서 작성 방법

**파일명**: `개발문서/FEEDBACK-002-Gemini.md`

**필수 포함 내용**:

```markdown
# FEEDBACK-002: CapCut 타임코드 연동 구현 완료

**작업자**: Gemini
**작업일**: 2026-02-11
**소요시간**: (작업 시간 기록)

---

## ✅ 작업 완료 항목

### UI 구현
- [x] `[캡컷 타임코드 연동]` 버튼 추가 (MainContent.tsx Line: ___)
- [x] `[CapCut SRT 업로드]` 버튼 추가 (MainContent.tsx Line: ___)
- [x] 파일 입력 숨김 처리

### 함수 구현
- [x] `handleCopyToCapCutSync` 구현 (MainContent.tsx Line: ___)
- [x] `handleCapCutSrtUpload` 구현 (MainContent.tsx Line: ___)
- [x] `handleCopyScriptToSrt` 구현 (App.tsx Line: ___)
- [x] `handleUpdateSrtFromCapCut` 구현 (App.tsx Line: ___)

### Props 연결
- [x] `MainContentProps` 인터페이스 수정 (MainContent.tsx Line: ___)
- [x] App.tsx → MainContent props 전달 (App.tsx Line: ___)
- [x] MainContent props destructuring (MainContent.tsx Line: ___)

---

## 🧪 테스트 결과

### 시나리오 1: 기본 워크플로우
- [x] 스크립트 작성 → ✅ 정상
- [x] 캡컷 연동 버튼 클릭 → ✅ 정상
- [x] 우측 자막 영역 복사 확인 → ✅ 정상
- [x] CapCut SRT 업로드 → ✅ 정상
- [x] 타임코드 매칭 확인 → ✅ 정상

**스크린샷**:
(여기에 스크린샷 경로 또는 설명)

### 시나리오 2: 에러 처리
- [x] 빈 스크립트 에러 → ✅ 정상 (알림 표시됨)
- [x] 연동 전 업로드 에러 → ✅ 정상 (알림 표시됨)
- [x] 잘못된 파일 형식 → ✅ 정상 (알림 표시됨)
- [x] 빈 SRT 파일 → ✅ 정상 (알림 표시됨)
- [x] 줄 수 불일치 → ✅ 정상 (일부 매칭됨)

### 시나리오 3: 반복 워크플로우
- [x] 여러 번 반복 가능 → ✅ 정상

---

## 🔍 코드 검증

### TypeScript
```bash
npm run typecheck
```
**결과**: ✅ 통과 / ❌ 에러 (에러 내용)

### ESLint
```bash
npm run lint
```
**결과**: ✅ 통과 / ⚠️ 경고 (경고 내용)

### 브라우저 콘솔
**에러**: 없음 ✅ / 있음 ❌ (에러 내용)

---

## 📝 수정한 파일 목록

1. `components/MainContent.tsx`
   - Line ___-___: handleCopyToCapCutSync 추가
   - Line ___-___: handleCapCutSrtUpload 추가
   - Line ___: 캡컷 타임코드 연동 버튼 추가
   - Line ___-___: CapCut SRT 업로드 버튼 추가
   - Line ___: MainContentProps 인터페이스 수정

2. `App.tsx`
   - Line ___-___: handleCopyScriptToSrt 추가
   - Line ___-___: handleUpdateSrtFromCapCut 추가
   - Line ___: MainContent props 전달

---

## 🐛 발견된 이슈

(없으면 "없음" 작성)

---

## 💡 특이사항

(특별히 언급할 사항이 있으면 작성, 없으면 "없음")

---

## ⚠️ 주의사항

(사용자나 PM이 알아야 할 사항이 있으면 작성, 없으면 "없음")

---

**작업 완료 확인**: ✅

**Claude PM 검토 대기 중**
```

---

### 피드백 문서 작성 체크리스트

작성 전 반드시 확인:

- [ ] 모든 체크박스 ✅ 표시했는가?
- [ ] 각 함수의 정확한 라인 번호 기재했는가?
- [ ] 3개 시나리오 모두 테스트했는가?
- [ ] TypeScript / ESLint 검증 결과 기재했는가?
- [ ] 스크린샷 첨부 또는 설명 작성했는가?
- [ ] 수정한 파일의 라인 번호 모두 기재했는가?

**위 항목 하나라도 누락 시 작업 미완료로 간주됩니다!**

---

## 🔴 최종 확인 - 작업 시작 전 반드시 읽을 것!

### ✅ 내가 수정할 파일 (오직 2개)
1. `components/MainContent.tsx`
2. `App.tsx`

### ❌ 절대 건드리면 안 되는 것들
- `components/AudioPlayer.tsx` ❌
- `components/Header.tsx` ❌
- `components/Waveform.tsx` ❌
- `components/SubtitleGenerator.tsx` ❌
- `services/geminiService.ts` ❌
- `types.ts` ❌
- 기타 모든 파일 ❌

### 📋 내가 해야 할 일 (오직 이것만)
1. 버튼 2개 추가 (지시서 코드 복붙)
2. 함수 4개 추가 (지시서 코드 복붙)
3. Props 연결 (지시서 대로)
4. 테스트 (시나리오 대로)
5. 피드백 작성

### ⛔ 내가 하면 안 되는 일
- 코드 개선 ❌
- 리팩토링 ❌
- 최적화 ❌
- 추가 기능 ❌
- UI 변경 (지시서 외) ❌
- 다른 파일 수정 ❌
- 창의적 해석 ❌
- 알아서 판단 ❌

---

**Gemini, 이 지시서에 명시된 것만 정확히 구현하세요!**

**다시 한번: 뻘짓 금지! 지시서에 없으면 하지 마세요!** 🚫🎯
