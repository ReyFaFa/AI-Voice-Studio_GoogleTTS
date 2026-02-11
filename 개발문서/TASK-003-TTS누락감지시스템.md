# TASK-003: TTS 누락 감지 시스템 구현

## 🚨 ⚠️ 중요 경고 - 반드시 읽을 것! ⚠️ 🚨

### ❌ 절대 금지 사항
1. **이 지시서에 명시되지 않은 파일 수정 금지**
2. **이 지시서에 명시되지 않은 기능 추가 금지**
3. **import 구문 재정렬 금지** (라인 번호 변경 방지)
4. **뻘짓 금지**

### ✅ 허용된 작업 범위
**오직 이 1개 파일, 1개 함수만 수정 가능**:
- `components/MainContent.tsx`의 `handleCapCutSrtUpload` 함수 (현재 Line 523-589)

### 📋 작업 완료 기준
- 코드 수정 완료
- 테스트 시나리오 검증 완료
- **FEEDBACK-003-Gemini.md 작성 필수**
- TypeScript 타입 체크 통과
- 브라우저 콘솔 에러 0건

---

## 📖 배경 및 목표

### 현재 문제점
Gemini TTS API는 간헐적으로 일부 라인의 오디오 생성에 실패합니다. 현재 시스템은 이러한 누락을 감지하지 못하고, 사용자가 CapCut SRT 업로드 시점까지 알 수 없습니다.

### 해결 방안
CapCut SRT 업로드 시점에 **텍스트 기반 매칭**을 통해 누락된 라인을 정확히 감지하고 사용자에게 알립니다.

### 작업 목표
`handleCapCutSrtUpload` 함수를 개선하여:
1. **텍스트 유사도 기반 매칭** (현재: 단순 index 기반)
2. **누락 라인 정확히 감지**
3. **상세한 피드백 제공**

---

## 🔧 구현 상세

### 수정할 파일 및 함수

**파일**: `components/MainContent.tsx`
**함수**: `handleCapCutSrtUpload` (Line 523-589)
**작업**: 함수 내부 로직 전면 개선

---

## 📝 구현 로직

### 1. 텍스트 정규화 함수 추가

```typescript
// handleCapCutSrtUpload 함수 내부에 추가
const normalizeText = (text: string) => {
    return text
        .replace(/\s+/g, '')        // 공백 제거
        .replace(/[.,!?;:'"]/g, '') // 구두점 제거
        .toLowerCase();              // 소문자 변환
};
```

**목적**: 텍스트 비교 시 공백, 구두점 차이 무시

---

### 2. CapCut SRT Map 생성

```typescript
// 기존 Line 537-543 다음에 추가

// CapCut SRT를 Map으로 변환 (O(1) 검색 성능)
const capCutMap = new Map<string, SrtLine>();
capCutSrt.forEach(line => {
    const normalized = normalizeText(line.text);
    capCutMap.set(normalized, line);
});
```

**목적**: 빠른 텍스트 검색을 위한 Map 자료구조 활용

---

### 3. 텍스트 기반 매칭 + 누락 감지

**기존 코드 (Line 553-564) 완전 교체**:

```typescript
// ===== 기존 코드 삭제 시작 =====
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
// ===== 기존 코드 삭제 끝 =====

// ===== 새로운 코드 시작 =====
// 4. 텍스트 기반 매칭 + 누락 감지
const matchedSrt: SrtLine[] = [];
const missingLines: Array<{index: number, text: string}> = [];

currentSrt.forEach((line, index) => {
    const normalized = normalizeText(line.text);
    const capCutMatch = capCutMap.get(normalized);

    if (capCutMatch) {
        // 매칭 성공: CapCut 타임코드 사용
        matchedSrt.push({
            ...line,
            startTime: capCutMatch.startTime,
            endTime: capCutMatch.endTime
        });
    } else {
        // 누락 감지: 임시 타임코드 유지
        matchedSrt.push({
            ...line,
            startTime: "00:00:00,000",
            endTime: "00:00:00,000"
        });
        missingLines.push({
            index: index + 1,  // 1-based 인덱스
            text: line.text
        });
    }
});
// ===== 새로운 코드 끝 =====
```

---

### 4. 사용자 피드백 개선

**기존 코드 (Line 569-580) 완전 교체**:

```typescript
// ===== 기존 코드 삭제 시작 =====
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
// ===== 기존 코드 삭제 끝 =====

// ===== 새로운 코드 시작 =====
// 6. 사용자 피드백 (누락 여부에 따라 분기)
if (missingLines.length > 0) {
    // 누락 발견 시
    const missingText = missingLines
        .slice(0, 5)  // 최대 5개만 표시
        .map(m => `  ${m.index}번: "${m.text.substring(0, 30)}${m.text.length > 30 ? '...' : ''}"`)
        .join('\n');

    const moreLines = missingLines.length > 5 ? `\n  ... 외 ${missingLines.length - 5}개` : '';

    alert(
        `⚠️ TTS 누락 감지!\n\n` +
        `총 ${currentSrt.length}개 라인 중:\n` +
        `✅ 매칭: ${currentSrt.length - missingLines.length}개\n` +
        `❌ 누락: ${missingLines.length}개\n\n` +
        `누락된 라인:\n${missingText}${moreLines}\n\n` +
        `💡 해결 방법:\n` +
        `1. 누락 라인만 개별 TTS 생성 (추천)\n` +
        `2. 전체 다시 생성\n\n` +
        `타임코드는 매칭된 부분만 업데이트되었습니다.`
    );

    console.log('[CapCut Sync] 누락 감지:', missingLines);
} else {
    // 완벽한 매칭 시
    alert(
        `✅ 완벽한 매칭!\n\n` +
        `총 ${currentSrt.length}개 라인 모두 매칭됨\n` +
        `누락: 0개\n\n` +
        `타임코드가 성공적으로 업데이트되었습니다.`
    );
}

console.log('[CapCut Sync] 타임코드 매칭 완료', {
    total: currentSrt.length,
    matched: currentSrt.length - missingLines.length,
    missing: missingLines.length,
    missingIndices: missingLines.map(m => m.index)
});
// ===== 새로운 코드 끝 =====
```

---

## 🧪 테스트 시나리오

### 시나리오 1: 완벽한 매칭 (누락 없음)

**준비**:
1. 스크립트 3개 라인 작성:
   ```
   안녕하세요
   반갑습니다
   좋은 아침입니다
   ```
2. "캡컷 타임코드 연동" 클릭
3. 오디오 생성 (3개 모두 성공)
4. CapCut에서 편집 후 SRT 다운로드 (3개 라인 모두 포함)

**실행**:
- "CapCut SRT 업로드" 클릭

**예상 결과**:
```
✅ 완벽한 매칭!

총 3개 라인 모두 매칭됨
누락: 0개

타임코드가 성공적으로 업데이트되었습니다.
```

**검증**:
- ✅ alert 창에 "완벽한 매칭!" 표시
- ✅ 우측 자막 목록에 정확한 타임코드 반영
- ✅ 콘솔에 `missing: 0` 로그

---

### 시나리오 2: 부분 누락 (중간 라인 누락)

**준비**:
1. 스크립트 5개 라인 작성:
   ```
   첫 번째 문장입니다
   두 번째 문장입니다
   세 번째 문장입니다
   네 번째 문장입니다
   다섯 번째 문장입니다
   ```
2. "캡컷 타임코드 연동" 클릭
3. 오디오 생성 (2번, 4번 라인 TTS 실패 - 실제로는 수동으로 해당 라인 삭제한 SRT 파일 생성)

**CapCut SRT 파일** (수동 생성):
```srt
1
00:00:00,000 --> 00:00:02,500
첫 번째 문장입니다

2
00:00:02,500 --> 00:00:05,000
세 번째 문장입니다

3
00:00:05,000 --> 00:00:07,500
다섯 번째 문장입니다
```

**실행**:
- "CapCut SRT 업로드" 클릭

**예상 결과**:
```
⚠️ TTS 누락 감지!

총 5개 라인 중:
✅ 매칭: 3개
❌ 누락: 2개

누락된 라인:
  2번: "두 번째 문장입니다"
  4번: "네 번째 문장입니다"

💡 해결 방법:
1. 누락 라인만 개별 TTS 생성 (추천)
2. 전체 다시 생성

타임코드는 매칭된 부분만 업데이트되었습니다.
```

**검증**:
- ✅ alert 창에 정확히 2번, 4번 라인 누락 표시
- ✅ 우측 자막 목록에서:
  - 1번: 타임코드 업데이트됨
  - 2번: `00:00:00,000` (누락)
  - 3번: 타임코드 업데이트됨
  - 4번: `00:00:00,000` (누락)
  - 5번: 타임코드 업데이트됨
- ✅ 콘솔에 `missing: 2, missingIndices: [2, 4]` 로그

---

### 시나리오 3: 전체 누락 (TTS 완전 실패)

**준비**:
1. 스크립트 3개 라인 작성
2. "캡컷 타임코드 연동" 클릭
3. 오디오 생성하지 않음 (또는 완전 실패)

**CapCut SRT 파일**: 빈 파일 또는 0개 라인

**실행**:
- "CapCut SRT 업로드" 클릭

**예상 결과**:
- Case 1 (빈 파일): `❌ SRT 파일이 비어있거나 형식이 잘못되었습니다.`
- Case 2 (0개 라인): 모든 라인이 누락으로 표시

**검증**:
- ✅ 빈 파일 시 적절한 에러 메시지
- ✅ 0개 라인 시 모든 라인 누락 표시

---

### 시나리오 4: 텍스트 유사도 매칭 (공백/구두점 차이)

**준비**:
1. 스크립트:
   ```
   안녕하세요, 반갑습니다!
   좋은   아침입니다.
   ```
2. "캡컷 타임코드 연동" 클릭

**CapCut SRT** (공백/구두점 다름):
```srt
1
00:00:00,000 --> 00:00:02,000
안녕하세요 반갑습니다

2
00:00:02,000 --> 00:00:04,000
좋은 아침입니다
```

**실행**:
- "CapCut SRT 업로드" 클릭

**예상 결과**:
```
✅ 완벽한 매칭!

총 2개 라인 모두 매칭됨
누락: 0개
```

**검증**:
- ✅ 공백/구두점 차이 무시하고 정상 매칭
- ✅ 누락 0개

---

### 시나리오 5: 다량 누락 (6개 이상)

**준비**:
1. 스크립트 10개 라인
2. CapCut SRT 3개만 포함 (7개 누락)

**예상 결과**:
```
⚠️ TTS 누락 감지!

총 10개 라인 중:
✅ 매칭: 3개
❌ 누락: 7개

누락된 라인:
  2번: "두 번째 문장..."
  3번: "세 번째 문장..."
  5번: "다섯 번째 문장..."
  7번: "일곱 번째 문장..."
  8번: "여덟 번째 문장..."
  ... 외 2개

💡 해결 방법:
...
```

**검증**:
- ✅ 최대 5개만 표시
- ✅ "... 외 2개" 메시지
- ✅ 전체 누락 개수 정확

---

## 📋 완료 체크리스트

### 코드 수정
- [ ] `normalizeText` 함수 추가
- [ ] `capCutMap` 생성 로직 추가
- [ ] 텍스트 기반 매칭 로직으로 교체
- [ ] `missingLines` 배열 추적
- [ ] 사용자 피드백 분기 처리 (누락 있음/없음)
- [ ] console.log 개선 (누락 정보 포함)

### 테스트 검증
- [ ] 시나리오 1: 완벽한 매칭 (Pass)
- [ ] 시나리오 2: 부분 누락 (Pass)
- [ ] 시나리오 3: 전체 누락 (Pass)
- [ ] 시나리오 4: 텍스트 유사도 매칭 (Pass)
- [ ] 시나리오 5: 다량 누락 (Pass)

### 코드 검증
- [ ] `npx tsc --noEmit` 통과 (TypeScript)
- [ ] 브라우저 콘솔 에러 0건
- [ ] 브라우저 콘솔 경고 0건

### 문서화
- [ ] **FEEDBACK-003-Gemini.md 작성 필수**
  - 수정한 함수 및 정확한 라인 번호
  - 5개 테스트 시나리오 결과 (Pass/Fail)
  - 코드 검증 결과
  - 스크린샷 또는 콘솔 로그 캡처

---

## ⚠️ 주의사항

### 1. import 구문 절대 수정 금지
- 기존 import 구문 순서 유지
- 새로운 import 추가 금지
- **이유**: 라인 번호 변경 방지

### 2. 함수 외부 수정 금지
- `handleCapCutSrtUpload` 함수 내부만 수정
- 다른 함수, 상태, props 수정 금지

### 3. 타입 안전성 유지
- `normalizeText`는 `string` → `string`
- `capCutMap`는 `Map<string, SrtLine>`
- `missingLines`는 `Array<{index: number, text: string}>`

### 4. 기존 동작 유지
- `onUpdateSrtFromCapCut(matchedSrt)` 호출 유지
- `e.target.value = ''` 파일 입력 초기화 유지
- try-catch-finally 구조 유지

---

## 📊 작업 완료 후 제출

### FEEDBACK-003-Gemini.md 필수 포함 내용

1. **수정한 함수 및 라인 번호**
   - `handleCapCutSrtUpload` 함수 수정 범위 (Line ___ - ___)
   - 추가한 로직별 라인 번호

2. **테스트 시나리오 결과표**
   ```markdown
   | 시나리오 | 테스트 항목 | 예상 결과 | 실제 결과 | 판정 |
   |---------|-----------|----------|----------|------|
   | 1 | 완벽한 매칭 | ... | ... | ✅ Pass |
   | 2 | 부분 누락 | ... | ... | ✅ Pass |
   ...
   ```

3. **코드 검증 결과**
   - TypeScript: `npx tsc --noEmit` 결과
   - 브라우저 콘솔: 에러/경고 개수

4. **스크린샷 또는 증거**
   - 시나리오 2 실행 시 alert 창 캡처
   - 콘솔 로그 캡처

---

## 🎯 성공 기준

1. ✅ 모든 테스트 시나리오 Pass
2. ✅ TypeScript 타입 체크 통과
3. ✅ 브라우저 콘솔 에러 0건
4. ✅ 누락 라인 정확히 감지 및 표시
5. ✅ FEEDBACK-003-Gemini.md 작성 완료

---

**작업 시작 전 이 지시서를 처음부터 끝까지 정독하세요!**

**뻘짓 금지! 명시된 작업만 수행하세요!**
