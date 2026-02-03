# 기술 명세서: 오디오 파형 시각화 및 자막 동기화 편집 시스템

이 문서는 "AI 보이스 스튜디오"에 구현된 오디오 재생, 파형 시각화, 그리고 자막 타임코드 편집(동기화 기능 포함) 로직을 다른 프로그램이나 플랫폼(Web, Desktop, Mobile 등)에서 구현하기 위한 상세 가이드입니다.

---

## 1. 데이터 구조 (Data Structures)

시스템에서 사용하는 핵심 데이터 모델입니다.

### 1.1. SRT 라인 (Subtitle Line)
SRT 파일의 한 줄을 나타내는 객체입니다.
```typescript
interface SrtLine {
  id: string;         // 고유 식별자 (UUID 등)
  index: number;      // SRT 순번 (1부터 시작)
  startTime: string;  // 시작 시간 포맷 (00:00:00,000)
  endTime: string;    // 종료 시간 포맷 (00:00:00,000)
  text: string;       // 자막 내용
}
```

---

## 2. 핵심 유틸리티 (Core Utilities)

시간 포맷 변환 및 파싱 로직입니다. 이 함수들은 편집 로직의 기초가 됩니다.

### 2.1. 시간 변환 (Time Conversion)
SRT 시간 포맷(`HH:MM:SS,ms`)과 밀리초(`ms`) 간의 양방향 변환입니다.

```typescript
// 문자열 -> 밀리초 (계산용)
function srtTimeToMs(time: string): number {
    const parts = time.split(/[:,]/); // 콜론이나 쉼표로 분리
    if (parts.length !== 4) return 0;
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    const milliseconds = parseInt(parts[3], 10);
    
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
}

// 밀리초 -> 문자열 (표시용)
function msToSrtTime(totalMs: number): string {
    const ms = Math.floor(totalMs % 1000);
    let totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // 패딩(Padding) 처리 중요: 01:02:03,040
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
```

---

## 3. 편집 및 동기화 로직 (Editing & Synchronization Logic)

이 시스템의 가장 핵심적인 기능인 **"타임코드 동기화(Ripple/Rolling Edit)"** 알고리즘입니다.

### 3.1. 업데이트 핸들러 알고리즘
사용자가 특정 자막의 시작/종료 시간을 변경했을 때 주변 자막들에 미치는 영향을 계산합니다.

**입력:**
- `lines`: 전체 자막 리스트
- `targetId`: 수정 중인 자막 ID
- `newValues`: 변경된 값 (startTime 또는 endTime)
- `isSyncEnabled`: 동기화 기능 활성화 여부 (Toggle)

**로직 구현 (의사 코드/Typescript):**

```typescript
function updateSrtLineLogic(lines: SrtLine[], targetId: string, newValues: Partial<SrtLine>, isSyncEnabled: boolean): SrtLine[] {
    // 1. 타겟 인덱스 찾기
    const index = lines.findIndex(l => l.id === targetId);
    if (index === -1) return lines;

    const updatedLines = [...lines]; // 불변성 유지를 위한 복사
    const oldLine = updatedLines[index];
    
    // 변경된 라인 생성
    let currentLine = { ...oldLine, ...newValues };
    
    // 시간 계산을 위해 ms로 변환
    let startMs = srtTimeToMs(currentLine.startTime);
    let endMs = srtTimeToMs(currentLine.endTime);
    const oldStartMs = srtTimeToMs(oldLine.startTime);
    const oldEndMs = srtTimeToMs(oldLine.endTime);

    const prevLine = index > 0 ? updatedLines[index - 1] : null;

    if (isSyncEnabled) {
        // =========================================================
        // 모드 A: 동기화 활성 (Ripple / Rolling Edit)
        // =========================================================
        
        // 상황 1: 시작 시간(Start Time) 변경 시 -> Rolling Edit
        // 이전 자막의 종료 시간을 현재 자막의 시작 시간에 맞춰 자동으로 늘리거나 줄임.
        // 두 자막 사이의 공백 없이 "붙어서" 움직이는 효과.
        if (newValues.startTime !== undefined && prevLine) {
            const delta = startMs - oldStartMs; // 변화량
            const prevEndMs = srtTimeToMs(prevLine.endTime);
            
            // 이전 라인의 종료 시간을 변화량만큼 같이 이동
            const newPrevEndMs = prevEndMs + delta;
            
            updatedLines[index - 1] = {
                ...prevLine,
                endTime: msToSrtTime(newPrevEndMs)
            };
        }

        // 상황 2: 종료 시간(End Time) 변경 시 -> Ripple Edit
        // 현재 자막 길이가 변하면, 그 뒤에 있는 *모든* 자막을 변화량만큼 밀거나 당김.
        if (newValues.endTime !== undefined) {
            const delta = endMs - oldEndMs; // 변화량
            
            // 현재 라인 이후의 모든 라인 순회
            for (let i = index + 1; i < updatedLines.length; i++) {
                const l = updatedLines[i];
                const lStart = srtTimeToMs(l.startTime) + delta;
                const lEnd = srtTimeToMs(l.endTime) + delta;
                
                updatedLines[i] = {
                    ...l,
                    startTime: msToSrtTime(lStart),
                    endTime: msToSrtTime(lEnd)
                };
            }
        }
        
    } else {
        // =========================================================
        // 모드 B: 동기화 비활성 (Clamping)
        // =========================================================
        // 자막이 서로 겹치거나 순서가 뒤집히지 않도록 한계점(Boundary) 설정
        
        // 1. 이전 라인과의 충돌 방지
        if (prevLine) {
            const prevEndMs = srtTimeToMs(prevLine.endTime);
            if (startMs < prevEndMs) {
                startMs = prevEndMs; // 이전 종료 시간보다 앞으로 갈 수 없음
                currentLine.startTime = msToSrtTime(startMs);
            }
        } else {
            // 첫 번째 라인은 0초보다 작을 수 없음
            if (startMs < 0) {
                startMs = 0;
                currentLine.startTime = msToSrtTime(startMs);
            }
        }

        // 2. 다음 라인과의 충돌 방지
        const nextLine = index < updatedLines.length - 1 ? updatedLines[index + 1] : null;
        if (nextLine) {
            const nextStartMs = srtTimeToMs(nextLine.startTime);
            if (endMs > nextStartMs) {
                endMs = nextStartMs; // 다음 시작 시간보다 뒤로 갈 수 없음
                currentLine.endTime = msToSrtTime(endMs);
            }
        }
        
        // 3. 자가 충돌 방지 (종료 시간이 시작 시간보다 앞서는 경우)
        // 최소 100ms 간격을 유지하며 강제로 밀어냄
        if (startMs >= endMs) {
            if (newValues.startTime) {
                // 시작을 늦췄는데 종료를 넘어감 -> 종료도 같이 밈
                endMs = startMs + 100;
                currentLine.endTime = msToSrtTime(endMs);
            } 
            else if (newValues.endTime) {
                // 종료를 당겼는데 시작을 넘어감 -> 시작도 같이 당김
                startMs = Math.max(0, endMs - 100);
                currentLine.startTime = msToSrtTime(startMs);
            }
        }
    }

    updatedLines[index] = currentLine;
    return updatedLines;
}
```

---

## 4. 오디오 파형 시각화 (Audio Waveform Visualization)

HTML5 Canvas API를 사용하여 대용량 오디오 데이터를 효율적으로 그리는 방법입니다.

### 4.1. 피크 데이터 추출 (Peak Data Extraction)
오디오 버퍼의 모든 샘플을 그리면 성능 저하가 발생하므로, 픽셀 단위로 `min/max` 값을 추출하여 다운샘플링합니다.

```typescript
function processAudioBuffer(audioBuffer: AudioBuffer, resolution: number = 4000): Float32Array {
    const rawData = audioBuffer.getChannelData(0); // 첫 번째 채널(Mono) 사용
    const samples = rawData.length;
    const samplesPerPixel = Math.floor(samples / resolution); // 픽셀 당 샘플 수
    const peakData = new Float32Array(resolution * 2); // Min, Max 저장을 위해 2배 크기

    for (let i = 0; i < resolution; i++) {
        const startIndex = i * samplesPerPixel;
        const endIndex = startIndex + samplesPerPixel;
        let min = 1.0;
        let max = -1.0;
        
        // 해당 구간의 최소/최대값 찾기
        for (let j = startIndex; j < endIndex; j++) {
            const sample = rawData[j];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        
        peakData[i * 2] = min;
        peakData[i * 2 + 1] = max;
    }
    return peakData;
}
```

### 4.2. 렌더링 로직 (Rendering Strategy)
레이어 순서(Z-index)가 중요합니다.

1.  **배경 초기화:** `clearRect`
2.  **타임라인 (Timeline):** 상단에 시간 눈금 표시
3.  **파형 (Waveform):** 추출한 `peakData`를 이용해 그림.
4.  **자막 하이라이트 (Highlights):** 
    *   **중요:** 파형 **위에** 반투명(`rgba`)하게 그려야 파형이 가려지지 않고 색상이 입혀진 효과가 남.
    *   활성 자막(Active): 노란색 + 테두리
    *   비활성 자막: 파란색/회색
5.  **재생 헤드 (Playhead):** 현재 재생 위치를 나타내는 빨간색 수직선.

```typescript
function drawWaveform(ctx: CanvasRenderingContext2D, peakData: Float32Array, width: number, height: number) {
    // ... 캔버스 스케일링 설정 (Retina 디스플레이 대응) ...

    const halfHeight = height / 2;
    
    // 파형 그리기
    ctx.fillStyle = '#4A5568'; // 파형 색상
    const len = peakData.length / 2;
    const step = len / width;

    for (let i = 0; i < width; i++) {
        const index = Math.floor(i * step) * 2;
        const min = peakData[index];
        const max = peakData[index + 1];
        
        // -1.0 ~ 1.0 범위를 캔버스 높이에 매핑
        const y1 = (1 + min) * halfHeight;
        const y2 = (1 + max) * halfHeight;
        const barHeight = Math.max(1, y2 - y1);
        
        ctx.fillRect(i, y1, 1, barHeight);
    }
}
```

---

## 5. UI 인터랙션 (UI Interaction)

### 5.1. 마우스 입력 -> 시간 변환
마우스 클릭이나 드래그 위치를 오디오 시간으로 변환하는 공식입니다.

```typescript
// zoom: 확대 배율 (1 ~ 100)
// scrollLeft: 컨테이너의 스크롤 위치
// clientX: 마우스 X 좌표
// rect.left: 컨테이너의 화면상 X 좌표
// duration: 오디오 전체 길이(초)
// width: 컨테이너의 원래 너비

function getAudioTimeFromMouse(mouseX: number, scrollLeft: number, width: number, zoom: number, duration: number): number {
    const totalContentWidth = width * zoom; // 전체 스크롤 영역 너비
    const absoluteX = scrollLeft + mouseX;  // 컨테이너 시작점 기준 절대 X 좌표
    
    // 비율 계산: (현재위치 / 전체너비) * 전체시간
    return (absoluteX / totalContentWidth) * duration;
}
```

### 5.2. 드래그로 타임코드 조절 (Drag Input)
`input` 필드 위에서 마우스를 드래그하여 값을 조절하는 UX 로직입니다.

1.  `onMouseDown`: 초기 마우스 X 좌표와 현재 시간 값을 저장. 커서를 `ew-resize`로 변경.
2.  `window.addEventListener('mousemove')`:
    *   `deltaX` (이동 거리) 계산.
    *   `감도(Sensitivity)` 적용 (예: 1px = 10ms).
    *   `새 시간 = 초기 시간 + (deltaX * 감도)`
    *   `updateSrtLineLogic` 호출하여 값 업데이트.
3.  `window.addEventListener('mouseup')`: 이벤트 리스너 제거 및 커서 초기화.

---

## 6. 오디오 재구성 (Audio Reconstruction / Splicing)

편집된 타임코드에 맞춰 원본 오디오를 잘라내고 이어붙여 새로운 오디오를 만드는 로직입니다. 무음 제거 및 편집 기능의 핵심입니다.

```typescript
function spliceAudio(originalBuffer: AudioBuffer, editedLines: SrtLine[]): AudioBuffer {
    const sampleRate = originalBuffer.sampleRate;
    const oldData = originalBuffer.getChannelData(0);
    
    // 1. 필요한 구간(Segment) 계산
    const segments = editedLines.map(line => ({
        startSample: Math.floor(srtTimeToMs(line.startTime) / 1000 * sampleRate),
        endSample: Math.floor(srtTimeToMs(line.endTime) / 1000 * sampleRate)
    }));

    // 2. 총 길이 계산
    const totalLength = segments.reduce((acc, seg) => acc + (seg.endSample - seg.startSample), 0);
    
    // 3. 새 버퍼 생성
    const newBuffer = new AudioContext().createBuffer(1, totalLength, sampleRate);
    const newData = newBuffer.getChannelData(0);
    
    // 4. 데이터 복사 (Copy)
    let offset = 0;
    for (const seg of segments) {
        const chunk = oldData.subarray(seg.startSample, seg.endSample);
        newData.set(chunk, offset);
        offset += chunk.length;
    }
    
    return newBuffer;
}
```

이 명세서의 로직들을 조합하면 웹, 데스크톱(Electron, WPF), 모바일(Flutter, React Native) 등 다양한 환경에서 동일한 기능을 구현할 수 있습니다.
