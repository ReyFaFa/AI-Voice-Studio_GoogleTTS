# AI Voice Studio 기술 고도화 로드맵 (Instructions)

이 문서는 Gemini 2.5 TTS를 활용하여 보이스 스튜디오의 기능을 극대화하기 위한 상세 지침을 담고 있습니다.

## 1. 핵심 개선 목표
1. **모델 선택**: `Gemini 2.5 Pro` (고품질)와 `Flash` (가성비) 선택 기능.
2. **스타일 제어**: "사극 톤", "차분한 60대" 등 프롬프트를 통한 음성 스타일링.
3. **대용량 순차 처리**: 15,000자 이상의 긴 대본을 3,000자 단위로 자동 분할 및 병합하여 브라우저 크래시 방지.
4. **보이스 즐겨찾기**: 자주 사용하는 목소리를 별표(★)로 표시하고 최상단 정렬.

## 2. 주요 구현 가이드

### 2.1. 서비스 레이어 (geminiService.ts)
`generateSingleSpeakerAudio` 함수가 `modelName`과 `stylePrompt`를 인자로 받도록 수정합니다.

```typescript
// 프롬프트 구성 예시
let finalPrompt = `[Instructions]\nStyle: ${stylePrompt}\nSpeed: ${speed}x\n\n[Text]\n${prompt}`;

const response = await ai.models.generateContent({
  model: modelName,
  contents: [{ parts: [{ text: finalPrompt }] }],
  config: { responseModalities: ["AUDIO"], speechConfig }
});
```

### 2.2. 대용량 순차 생성 로직
대본을 쪼개서 순차적으로 호출한 뒤 `Blob`을 하나로 합칩니다.

```typescript
const chunks = chunkText(fullText, 2500);
const audioBlobs = [];
for (const chunk of chunks) {
    const data = await generateSingleSpeakerAudio(chunk, ...);
    audioBlobs.push(new Blob([data], { type: 'audio/wav' }));
}
const mergedAudio = new Blob(audioBlobs, { type: 'audio/wav' });
```

### 2.3. 즐겨찾기 정렬
`localStorage`에 별표 친 보이스 ID를 저장하고 `useMemo`를 써서 정렬합니다.

```typescript
const sortedVoices = voices.sort((a, b) => 
    (favorites.includes(b.id) ? 1 : 0) - (favorites.includes(a.id) ? 1 : 0)
);
```

## 3. 실행 방법
프로젝트 루트 폴더에서 다음을 실행하세요:
1. `npm install`
2. `.env.local` 파일에 `GEMINI_API_KEY` 설정
3. `npm run dev`
