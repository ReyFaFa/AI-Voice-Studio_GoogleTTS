# 작업 지시서: TTS 청크 관리 및 샘플 미리듣기 기능 구현

## 📋 TODO List

### Phase 1: 데이터 구조 수정
- [ ] `types.ts`에 `AudioChunkItem` 인터페이스 추가
- [ ] `App.tsx`에서 `AudioHistoryItem`에 `audioChunks` 필드 추가

### Phase 2: 청크 저장 로직
- [ ] Flash/Pro TTS 루프에서 청크 배열 저장 로직 추가
- [ ] `AudioHistoryItem` 생성 시 `audioChunks` 포함

### Phase 3: ZIP 다운로드
- [ ] `jszip` 패키지 설치
- [ ] `downloadChunksAsZip` 함수 구현
- [ ] UI에 ZIP 다운로드 버튼 추가

### Phase 4: 샘플 미리듣기
- [ ] 샘플 관련 상태 추가 (`sampleAudio`, `isSampleApproved`)
- [ ] `handleGenerateSample` 함수 구현
- [ ] `handleApproveSampleAndGenerate`, `handleRejectSample` 함수 구현

### Phase 5: UI 통합
- [ ] 샘플 미리듣기 UI 섹션 추가
- [ ] 상태별 조건부 렌더링 구현

### Phase 6: 테스트
- [ ] 샘플 생성 → 확인 → 전체 생성 플로우 테스트
- [ ] ZIP 다운로드 테스트

---

## 1. 개요

### 1.1 목적
- 생성된 오디오를 청크(문단) 단위로 개별 관리하여 문제 발생 시 부분 재생성 가능하게 함
- 전체 대본 생성 전 샘플(5줄) 미리듣기로 음성 스타일 확인 후 진행 여부 결정

### 1.2 적용 대상
- **Flash TTS** (`gemini-2.5-flash-preview-tts`)
- **Pro TTS** (`gemini-2.5-pro-preview-tts`)

> ⚠️ Native Audio 모델은 알려진 이슈(문장 중간 끊김 등) 해결 전까지 적용 제외

### 1.3 기대 효과

| 기능 | 효과 |
|------|------|
| 청크별 ZIP 다운로드 | 문제된 청크만 재생성/교체 가능, 외부 편집 용이 |
| 샘플 미리듣기 | API 비용 절감, 원하는 목소리 확인 후 전체 생성 |

---

## 2. 기능 A: 청크별 오디오 저장 및 ZIP 다운로드

### 2.1 데이터 구조 수정

#### 파일: `types.ts`

새로운 인터페이스 추가:

```typescript
export interface AudioChunkItem {
    id: string;
    index: number;
    buffer: AudioBuffer;
    text: string;
    durationMs: number;
}
```

#### 파일: `App.tsx`

`AudioHistoryItem` 인터페이스 수정:

```typescript
export interface AudioHistoryItem {
    id: string;
    src: string;
    scriptChunk: string;
    audioBuffer: AudioBuffer;
    audioChunks: AudioChunkItem[];  // ⭐ 새로 추가
    isTrimmed: boolean;
    contextDuration: number;
    status: 'full' | 'trimmed';
    srtLines: SrtLine[];
    originalSrtLines: SrtLine[];
}
```

### 2.2 Flash/Pro TTS 청크 저장 로직 수정

**파일**: `App.tsx` - `handleGenerateAudio` 함수

**수정 위치**: Flash/Pro TTS 청크 생성 루프 내부

**변경 전 (현재)**:
- 청크 생성 후 즉시 `mergedAudioBuffer`에 병합
- 원본 청크 버퍼는 버려짐

**변경 후**:

```typescript
// 청크 배열 선언 (루프 밖, 상단에 위치)
const audioChunkItems: AudioChunkItem[] = [];

// 루프 내에서 청크 저장 (병합 전에 추가)
audioChunkItems.push({
    id: `chunk-${i}-${Date.now()}`,
    index: i,
    buffer: chunkBuffer,
    text: chunkText,
    durationMs: chunkBuffer.duration * 1000
});

// 병합 로직은 기존대로 유지
if (!mergedAudioBuffer) {
    mergedAudioBuffer = chunkBuffer;
} else {
    // 기존 병합 로직...
}

// AudioHistoryItem 생성 시 청크 배열 포함
const newItem: AudioHistoryItem = {
    // ...기존 필드들,
    audioChunks: audioChunkItems,  // ⭐ 추가
};
```

### 2.3 ZIP 다운로드 기능 구현

#### 패키지 설치

```bash
npm install jszip
npm install @types/jszip --save-dev
```

#### 파일: `components/Header.tsx` (또는 새 유틸 파일)

```typescript
import JSZip from 'jszip';

export async function downloadChunksAsZip(
    chunks: AudioChunkItem[], 
    baseFilename: string
): Promise<void> {
    const zip = new JSZip();
    
    for (const chunk of chunks) {
        // WAV 파일
        const wavBlob = encodeAudioBufferToWavBlob(chunk.buffer);
        const wavFilename = `${String(chunk.index + 1).padStart(2, '0')}-chunk.wav`;
        zip.file(wavFilename, wavBlob);
        
        // 대본 텍스트 파일
        const txtFilename = `${String(chunk.index + 1).padStart(2, '0')}-script.txt`;
        zip.file(txtFilename, chunk.text);
    }
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseFilename}-chunks.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
```

### 2.4 다운로드 UI 수정

**파일**: `components/MainContent.tsx`

**현재**: `[다운로드 WAV]`

**수정**: `[WAV 다운로드]  [ZIP 다운로드 (청크별)]`

ZIP 버튼은 `audioChunks` 배열이 존재할 때만 활성화:

```tsx
<button 
    onClick={() => downloadChunksAsZip(activeItem.audioChunks, 'tts-audio')}
    disabled={!activeItem?.audioChunks?.length}
>
    ZIP 다운로드 (청크별)
</button>
```

---

## 3. 기능 B: 샘플 미리듣기 (5줄)

### 3.1 상태 추가

**파일**: `App.tsx`

```typescript
const [sampleAudio, setSampleAudio] = useState<{
    src: string;
    buffer: AudioBuffer;
} | null>(null);

const [isSampleApproved, setIsSampleApproved] = useState<boolean>(false);
```

### 3.2 샘플 생성 함수

**파일**: `App.tsx`

```typescript
const handleGenerateSample = async () => {
    // 처음 5줄만 추출
    const sampleLines = scriptLines.slice(0, 5);
    const sampleText = sampleLines.map(l => l.text).join('\n').trim();
    
    if (!sampleText) {
        setError("샘플 생성할 텍스트가 없습니다.");
        return;
    }
    
    if (!singleSpeakerVoice) {
        setError("음성을 선택해주세요.");
        return;
    }
    
    setIsLoading(true);
    setLoadingStatus('샘플 오디오 생성 중 (5줄)...');
    setError(null);
    setSampleAudio(null);
    setIsSampleApproved(false);
    abortControllerRef.current = new AbortController();
    
    try {
        const base64Pcm = await generateSingleSpeakerAudio(
            sampleText,
            singleSpeakerVoice,
            selectedModel,
            speechSpeed,
            stylePrompt,
            abortControllerRef.current.signal
        );
        
        const audioContext = new AudioContext();
        const wavBlob = createWavBlobFromBase64Pcm(base64Pcm);
        const buffer = await audioContext.decodeAudioData(await wavBlob.arrayBuffer());
        const url = URL.createObjectURL(wavBlob);
        
        setSampleAudio({ src: url, buffer });
        
    } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
            setError(e instanceof Error ? e.message : "샘플 생성 실패");
        }
    } finally {
        setIsLoading(false);
        setLoadingStatus('');
    }
};
```

### 3.3 샘플 승인 후 전체 생성

**파일**: `App.tsx`

```typescript
const handleApproveSampleAndGenerate = () => {
    // 샘플 오디오 URL 정리
    if (sampleAudio?.src) {
        URL.revokeObjectURL(sampleAudio.src);
    }
    
    setIsSampleApproved(true);
    setSampleAudio(null);
    handleGenerateAudio(); // 전체 생성 시작
};

const handleRejectSample = () => {
    // 샘플 오디오 URL 정리
    if (sampleAudio?.src) {
        URL.revokeObjectURL(sampleAudio.src);
    }
    
    setSampleAudio(null);
    // 다시 생성하거나 설정 변경 가능한 상태로
};
```

### 3.4 UI 플로우

**파일**: `components/MainContent.tsx`

상태별 UI 표시:

```
[상태 1: 초기 상태]
┌─────────────────────────────────────────┐
│  [🎧 샘플 미리듣기 (5줄)]               │
│                                         │
│  💡 전체 생성 전 음성 스타일을           │
│     미리 확인할 수 있습니다              │
└─────────────────────────────────────────┘

[상태 2: 샘플 생성 완료]
┌─────────────────────────────────────────┐
│  🔊 샘플 오디오                          │
│  ▶━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 0:15    │
│                                         │
│  이 목소리로 전체 대본을 생성할까요?     │
│                                         │
│  [✓ 확인, 전체 생성]   [↻ 다시 생성]    │
└─────────────────────────────────────────┘

[상태 3: 전체 생성 중]
┌─────────────────────────────────────────┐
│  ⏳ 전체 오디오 생성 중...               │
│  청크 2/5 처리 중                       │
│  ━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░ 40%     │
│                                         │
│  [중지]                                  │
└─────────────────────────────────────────┘
```

### 3.5 UI 컴포넌트 구현

**파일**: `components/MainContent.tsx`

```tsx
{/* 샘플 미리듣기 섹션 */}
<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
    
    {/* 상태 1: 샘플 미생성 */}
    {!sampleAudio && !isLoading && (
        <div className="text-center">
            <button 
                onClick={handleGenerateSample}
                disabled={!singleSpeakerVoice || scriptLines.length === 0}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 
                           disabled:bg-gray-600 rounded-lg font-medium
                           transition-colors"
            >
                🎧 샘플 미리듣기 (5줄)
            </button>
            <p className="text-gray-400 text-sm mt-2">
                전체 생성 전 음성 스타일을 미리 확인할 수 있습니다
            </p>
        </div>
    )}
    
    {/* 상태 2: 샘플 생성 완료 */}
    {sampleAudio && !isLoading && (
        <div className="space-y-4">
            <div className="text-center">
                <p className="text-gray-300 mb-2">🔊 샘플 오디오</p>
                <audio 
                    src={sampleAudio.src} 
                    controls 
                    className="w-full max-w-md mx-auto"
                />
            </div>
            
            <p className="text-center text-gray-300">
                이 목소리로 전체 대본을 생성할까요?
            </p>
            
            <div className="flex justify-center gap-4">
                <button 
                    onClick={handleApproveSampleAndGenerate}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 
                               rounded-lg font-medium transition-colors"
                >
                    ✓ 확인, 전체 생성
                </button>
                <button 
                    onClick={handleGenerateSample}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-500 
                               rounded-lg font-medium transition-colors"
                >
                    ↻ 다시 생성
                </button>
            </div>
        </div>
    )}
    
    {/* 상태 3: 로딩 중 */}
    {isLoading && (
        <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 
                            border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-300">{loadingStatus}</p>
            <button 
                onClick={handleStopGeneration}
                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 
                           rounded-lg font-medium transition-colors"
            >
                중지
            </button>
        </div>
    )}
    
</div>
```

---

## 4. 파일별 수정 요약

| 파일 | 수정 내용 |
|------|----------|
| `package.json` | `jszip` 의존성 추가 |
| `types.ts` | `AudioChunkItem` 인터페이스 추가 |
| `App.tsx` | `AudioHistoryItem`에 `audioChunks` 필드 추가 |
| `App.tsx` | 샘플 관련 상태 추가 (`sampleAudio`, `isSampleApproved`) |
| `App.tsx` | `handleGenerateSample` 함수 추가 |
| `App.tsx` | `handleApproveSampleAndGenerate` 함수 추가 |
| `App.tsx` | `handleRejectSample` 함수 추가 |
| `App.tsx` | Flash/Pro TTS 루프에서 청크 배열 저장 로직 추가 |
| `components/Header.tsx` | `downloadChunksAsZip` 함수 추가 |
| `components/MainContent.tsx` | 다운로드 버튼 UI 수정 (ZIP 추가) |
| `components/MainContent.tsx` | 샘플 미리듣기 UI 섹션 추가 |

---

## 5. 주의사항

| 항목 | 내용 |
|------|------|
| API 비용 | 샘플(5줄)은 전체 대비 약 1/10~1/20 비용 |
| 메모리 | 청크 배열 추가 저장으로 메모리 사용량 약 2배 (50분 기준 문제없음) |
| 기존 기능 | 통합 WAV 다운로드, SRT 생성 등 기존 기능 영향 없도록 유지 |
| 호환성 | `audioChunks`는 optional 필드로 처리하여 기존 데이터와 호환 |
| URL 정리 | 샘플 오디오 교체/삭제 시 `URL.revokeObjectURL()` 호출 필수 |

---

## 6. 테스트 시나리오

### 6.1 샘플 미리듣기 테스트

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 10줄 이상 대본 입력 | 대본 표시됨 |
| 2 | 음성, 스타일 설정 | 설정 적용됨 |
| 3 | [샘플 미리듣기] 클릭 | 로딩 표시, 5줄 오디오 생성 |
| 4 | 샘플 재생 | 설정한 음성/스타일로 5줄 재생 |
| 5 | [다시 생성] 클릭 | 새 샘플 생성 |
| 6 | [확인, 전체 생성] 클릭 | 전체 대본 생성 시작 |

### 6.2 ZIP 다운로드 테스트

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 전체 오디오 생성 완료 | 오디오 히스토리에 추가됨 |
| 2 | [ZIP 다운로드] 클릭 | ZIP 파일 다운로드 |
| 3 | ZIP 압축 해제 | 청크 개수만큼 WAV + TXT 파일 존재 |
| 4 | 각 WAV 재생 | 해당 청크 텍스트 내용과 일치 |
| 5 | 각 TXT 확인 | 해당 청크 대본 텍스트 포함 |
