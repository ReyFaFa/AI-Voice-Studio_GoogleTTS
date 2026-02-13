
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    adjustSrtGaps,
    analyzeScript,
    audioBufferToWavBase64,
    createWavBlobFromBase64Pcm,
    detectSilence,
    downloadChunksAsZip,
    encodeAudioBufferToWavBlob,
    msToSrtTime,
    parseSrt,
    spliceAudio,
    splitTextIntoChunks,
    srtTimeToMs,
    stringifySrt,
    trimTrailingSilence
} from './components/Header';
import { MainContent } from './components/MainContent';
import { SubtitleGenerator } from './components/SubtitleGenerator';
import { DocumentTextIcon, MicrophoneIcon, SettingsIcon, VOICES, XCircleIcon } from './constants';
import { generateAudioWithFallback, generateSingleSpeakerAudio, generateSrtFromParagraphTimings, previewVoice, setApiKey, transcribeAudioWithSrt, uint8ArrayToBase64 } from './services/geminiService';
import { AudioChunkItem, Preset, ScriptLine, SrtLine, TtsApiKey } from './types';

// Defines the structure for each generated audio clip in the history
export interface AudioHistoryItem {
    id: string;
    src: string;
    scriptChunk: string;
    audioBuffer: AudioBuffer;
    audioChunks?: AudioChunkItem[];  // 청크별 개별 오디오 저장
    failedChunks?: number[];  // 실패한 청크 인덱스 목록
    isTrimmed: boolean;
    contextDuration: number; // Duration of the prepended context in seconds
    status: 'full' | 'trimmed';
    srtLines: SrtLine[];
    originalSrtLines: SrtLine[];
}

interface TtsResult {
    audioHistory: AudioHistoryItem[];
    srtContent: string | null;
}

export interface AutoFormatOptions {
    period: boolean;
    question: boolean;
    exclamation: boolean;
    comma: boolean;
}

export const MAX_CHAR_LIMIT = 100000; // Expanded to support chunked processing

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 오디오 누락 감지 로직
 * - 각 SRT 라인이 실제 오디오 청크에 존재하는지 확인
 * - 의심스러운 타임코드 감지 (너무 짧음, 너무 김, 겹침 등)
 */
function detectMissingAudio(
    srtLines: SrtLine[],
    audioChunks: AudioChunkItem[],
    failedChunks?: number[]
): SrtLine[] {
    // 각 청크의 시작/종료 시간 계산
    const chunkTimeRanges: Array<{ start: number; end: number; index: number }> = [];
    let currentOffset = 0;

    audioChunks.forEach((chunk, idx) => {
        chunkTimeRanges.push({
            start: currentOffset,
            end: currentOffset + chunk.durationMs,
            index: idx
        });
        currentOffset += chunk.durationMs;
    });

    return srtLines.map((line, idx) => {
        const startMs = srtTimeToMs(line.startTime);
        const endMs = srtTimeToMs(line.endTime);
        const duration = endMs - startMs;

        // 의심스러운 타임코드 감지
        let isSuspicious = false;
        if (duration < 50) isSuspicious = true;           // 50ms 미만 (너무 짧음)
        if (duration > 30000) isSuspicious = true;        // 30초 초과 (너무 김)
        if (startMs >= endMs) isSuspicious = true;        // 시작≥종료 (오류)

        // 이전 라인과 겹침 확인
        if (idx > 0) {
            const prevEndMs = srtTimeToMs(srtLines[idx - 1].endTime);
            if (startMs < prevEndMs) {
                isSuspicious = true;
            }
        }

        // 소속 청크 찾기
        let belongsToChunk = -1;
        for (const range of chunkTimeRanges) {
            // 라인의 시작 시간이 청크 범위 내에 있는지 확인
            if (startMs >= range.start && startMs < range.end) {
                belongsToChunk = range.index;
                break;
            }
        }

        // 실패한 청크에 속하는지 확인
        const isInFailedChunk = failedChunks && failedChunks.includes(belongsToChunk);

        // 경고 타입 결정
        let warningType: 'no_audio' | 'suspicious_timecode' | null = null;
        if (isInFailedChunk || belongsToChunk < 0) {
            warningType = 'no_audio';
        } else if (isSuspicious) {
            warningType = 'suspicious_timecode';
        }

        return {
            ...line,
            hasAudio: belongsToChunk >= 0 && !isInFailedChunk,
            chunkIndex: belongsToChunk,
            warningType: warningType
        };
    });
}

export function App() {
    const [activeTab, setActiveTab] = useState<'tts' | 'subtitles'>('tts');

    const [singleSpeakerVoice, setSingleSpeakerVoice] = useState<string>('');
    const [speechSpeed, setSpeechSpeed] = useState<number>(0.8);
    const [toneLevel, setToneLevel] = useState<number>(2); // 1-5, 기본값 2 (심야 라디오 스타일)
    const [scriptLines, setScriptLines] = useState<ScriptLine[]>([]);

    // Advanced TTS Settings (Persistent)
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return localStorage.getItem('tts_selected_model') || 'gemini-2.5-flash-preview-tts';
    });

    const [stylePrompt, setStylePrompt] = useState<string>(() => {
        return localStorage.getItem('tts_style_prompt') || '';
    });

    const [favorites, setFavorites] = useState<string[]>(() => {
        const stored = localStorage.getItem('voice_favorites');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { return []; }
        }
        return [];
    });

    // Presets State (Persistent)
    const [presets, setPresets] = useState<Preset[]>(() => {
        const stored = localStorage.getItem('tts_presets');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { return []; }
        }
        return [];
    });

    const [ttsResult, setTtsResult] = useState<TtsResult>({ audioHistory: [], srtContent: null });
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

    const [editableSrtLines, setEditableSrtLines] = useState<SrtLine[]>([]);
    const [originalSrtLines, setOriginalSrtLines] = useState<SrtLine[]>([]);
    const [hasTimestampEdits, setHasTimestampEdits] = useState(false);
    const [isTimestampSyncEnabled, setIsTimestampSyncEnabled] = useState(true);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const [isPreviewLoading, setIsPreviewLoading] = useState<Record<string, boolean>>({});
    const [srtSplitCharCount, setSrtSplitCharCount] = useState<number>(25);

    const [activeSrtLineId, setActiveSrtLineId] = useState<string | null>(null);
    const [silentSegments, setSilentSegments] = useState<{ start: number; end: number }[]>([]);
    const [isAnalysisPanelOpen, setIsAnalysisPanelOpen] = useState(false);

    // Sample Preview State
    const [sampleAudio, setSampleAudio] = useState<{ src: string; text: string } | null>(null);
    const [isSampleApproved, setIsSampleApproved] = useState(false);
    const [sampleLoading, setSampleLoading] = useState(false);

    // API Key Settings State - Initialize from LocalStorage
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [userApiKey, setUserApiKey] = useState(() => {
        return localStorage.getItem('gemini_api_key') || '';
    });

    // TTS 전용 API 키 배열 (우선순위 순)
    const [ttsApiKeys, setTtsApiKeys] = useState<TtsApiKey[]>(() => {
        const saved = localStorage.getItem('tts_api_keys');
        return saved ? JSON.parse(saved) : [];
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Initial sample text
        if (scriptLines.length === 0) {
            setScriptLines([
                { id: 'line-1', speakerId: 'Speaker', text: '안녕하세요! AI 보이스 스튜디오입니다.' },
                { id: 'line-2', speakerId: 'Speaker', text: '텍스트를 입력하고 줄 단위로 스타일을 지정해보세요.' },
                { id: 'line-3', speakerId: 'Speaker', text: '원하는 목소리를 선택하여 오디오를 생성할 수 있습니다.' }
            ]);
        }

        // Sync API Key from state to service (redundant check but safe)
        if (userApiKey) {
            setApiKey(userApiKey);
        }
    }, []);

    // Save Settings when they change
    useEffect(() => {
        localStorage.setItem('tts_style_prompt', stylePrompt);
    }, [stylePrompt]);

    useEffect(() => {
        localStorage.setItem('tts_selected_model', selectedModel);
    }, [selectedModel]);

    const handleSaveApiKey = () => {
        localStorage.setItem('gemini_api_key', userApiKey);
        setApiKey(userApiKey);
        setIsApiKeyModalOpen(false);
        alert('API 키가 저장되었습니다.');
    };

    // TTS API 키 localStorage 저장
    useEffect(() => {
        localStorage.setItem('tts_api_keys', JSON.stringify(ttsApiKeys));
    }, [ttsApiKeys]);

    // TTS API 키 추가
    const handleAddTtsKey = () => {
        const newKey: TtsApiKey = {
            id: `tts-${Date.now()}`,
            key: ''
        };
        setTtsApiKeys([...ttsApiKeys, newKey]);
    };

    // TTS API 키 수정
    const handleUpdateTtsKey = (id: string, newKey: string) => {
        setTtsApiKeys(ttsApiKeys.map(item =>
            item.id === id ? { ...item, key: newKey } : item
        ));
    };

    // TTS API 키 삭제
    const handleRemoveTtsKey = (id: string) => {
        setTtsApiKeys(ttsApiKeys.filter(item => item.id !== id));
    };

    // TTS API 키 위/아래 이동
    const handleMoveTtsKey = (index: number, direction: 'up' | 'down') => {
        const newKeys = [...ttsApiKeys];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newKeys.length) return;

        [newKeys[index], newKeys[targetIndex]] = [newKeys[targetIndex], newKeys[index]];
        setTtsApiKeys(newKeys);
    };

    const toggleFavorite = (voiceId: string) => {
        setFavorites(prev => {
            const next = prev.includes(voiceId)
                ? prev.filter(id => id !== voiceId)
                : [...prev, voiceId];
            localStorage.setItem('voice_favorites', JSON.stringify(next));
            return next;
        });
    };

    // Preset Handlers
    const handleSavePreset = (name: string) => {
        if (!name.trim()) return;
        const newPreset: Preset = {
            id: Date.now().toString(),
            name,
            voiceId: singleSpeakerVoice,
            stylePrompt,
            model: selectedModel,
            speed: speechSpeed
        };
        const updated = [...presets, newPreset];
        setPresets(updated);
        localStorage.setItem('tts_presets', JSON.stringify(updated));
    };

    const handleDeletePreset = (id: string) => {
        const updated = presets.filter(p => p.id !== id);
        setPresets(updated);
        localStorage.setItem('tts_presets', JSON.stringify(updated));
    };

    const handleLoadPreset = (presetId: string) => {
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;

        setSingleSpeakerVoice(preset.voiceId);
        setStylePrompt(preset.stylePrompt);
        setSelectedModel(preset.model);
        setSpeechSpeed(preset.speed);
    };

    const handleExportPreset = () => {
        const currentPreset: Preset = {
            id: Date.now().toString(),
            name: `Preset-${new Date().toLocaleTimeString()}`,
            voiceId: singleSpeakerVoice,
            stylePrompt,
            model: selectedModel,
            speed: speechSpeed
        };

        const jsonString = JSON.stringify(currentPreset, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `preset-${new Date().getTime()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImportPreset = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const importedPreset: Preset = JSON.parse(content);

                // Simple validation
                if (importedPreset.voiceId && importedPreset.model) {
                    setSingleSpeakerVoice(importedPreset.voiceId);
                    setStylePrompt(importedPreset.stylePrompt || '');
                    setSelectedModel(importedPreset.model);
                    setSpeechSpeed(importedPreset.speed || 1.0);
                    alert("프리셋을 불러왔습니다.");
                } else {
                    alert("올바르지 않은 프리셋 파일입니다.");
                }
            } catch (err) {
                console.error("Failed to parse preset file", err);
                alert("프리셋 파일을 읽는 중 오류가 발생했습니다.");
            }
        };
        reader.readAsText(file);
    };

    const scriptAnalysis = useMemo(() => {
        const fullText = scriptLines.map(l => l.text).join('\n');
        return analyzeScript(fullText);
    }, [scriptLines]);

    const totalEstimatedTime = useMemo(() => {
        const baseTime = scriptLines.reduce((acc, line) => acc + (line.estimatedTime || 0), 0);
        return baseTime / speechSpeed;
    }, [scriptLines, speechSpeed]);

    const handleScriptChange = (newFullScript: string) => {
        const lines = newFullScript.split('\n');
        setScriptLines(prev => {
            return lines.map((text, index) => {
                const charCount = text.replace(/\s/g, '').length;
                const estimatedTime = charCount * 0.25;

                if (index < prev.length) {
                    return {
                        ...prev[index],
                        text: text,
                        estimatedTime: estimatedTime
                    };
                } else {
                    return {
                        id: `line-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
                        speakerId: 'Speaker',
                        text: text,
                        estimatedTime: estimatedTime,
                        style: ''
                    };
                }
            });
        });
    };

    const handleUpdateScriptLine = (id: string, newValues: Partial<Omit<ScriptLine, 'id'>>) => {
        setScriptLines(prev => prev.map(line => {
            if (line.id === id) {
                const updated = { ...line, ...newValues };
                if (newValues.text !== undefined) {
                    const charCount = updated.text.replace(/\s/g, '').length;
                    updated.estimatedTime = charCount * 0.25;
                }
                return updated;
            }
            return line;
        }));
    };

    const handleRemoveScriptLine = (id: string) => {
        if (scriptLines.length <= 1) {
            setScriptLines([{ id: `line-${Date.now()}`, speakerId: 'Speaker', text: '' }]);
        } else {
            setScriptLines(prev => prev.filter(l => l.id !== id));
        }
    };

    const handleAddScriptLine = () => {
        setScriptLines(prev => [
            ...prev,
            { id: `line-${Date.now()}`, speakerId: 'Speaker', text: '' }
        ]);
    };

    const handleRemoveEmptyScriptLines = () => {
        setScriptLines(prev => {
            const filtered = prev.filter(line => line.text.trim().length > 0);
            return filtered.length > 0 ? filtered : [{ id: `line-${Date.now()}`, speakerId: 'Speaker', text: '' }];
        });
    };

    const handleSplitScriptLine = (index: number, cursorPosition: number) => {
        setScriptLines(prev => {
            const newLines = [...prev];
            const line = newLines[index];
            const text = line.text;

            const firstPart = text.slice(0, cursorPosition);
            const secondPart = text.slice(cursorPosition);

            const calcTime = (t: string) => t.replace(/\s/g, '').length * 0.25;

            // Update current line
            newLines[index] = {
                ...line,
                text: firstPart,
                estimatedTime: calcTime(firstPart)
            };

            // Insert new line after
            newLines.splice(index + 1, 0, {
                id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                speakerId: line.speakerId,
                text: secondPart,
                estimatedTime: calcTime(secondPart),
                style: line.style // Inherit style
            });

            return newLines;
        });
    };

    const handleMergeScriptLine = (index: number, direction: 'up' | 'down') => {
        setScriptLines(prev => {
            const newLines = [...prev];

            if (direction === 'up') {
                if (index <= 0) return prev;
                const prevLine = newLines[index - 1];
                const currLine = newLines[index];

                const combinedText = (prevLine.text.trim() + ' ' + currLine.text.trim()).trim();
                prevLine.text = combinedText;
                prevLine.estimatedTime = combinedText.replace(/\s/g, '').length * 0.25;

                newLines.splice(index, 1);
            } else {
                if (index >= newLines.length - 1) return prev;
                const currLine = newLines[index];
                const nextLine = newLines[index + 1];

                const combinedText = (currLine.text.trim() + ' ' + nextLine.text.trim()).trim();
                currLine.text = combinedText;
                currLine.estimatedTime = combinedText.replace(/\s/g, '').length * 0.25;

                newLines.splice(index + 1, 1);
            }

            return newLines;
        });
    };

    const handleAutoFormatScript = (options: AutoFormatOptions) => {
        setScriptLines(prev => {
            // Combine existing lines into one string, handling existing newlines as spaces to reflow
            const fullText = prev.map(l => l.text).join(' ');

            const triggers = [];
            if (options.period) triggers.push('\\.');
            if (options.question) triggers.push('\\?');
            if (options.exclamation) triggers.push('!');
            if (options.comma) triggers.push(',');

            if (triggers.length === 0) return prev;

            const pattern = `([${triggers.join('')}])`;
            // Regex to match trigger char followed by whitespace(s)
            const splitRegex = new RegExp(`${pattern}\\s+`, 'g');
            // Regex to match trigger char at the very end of string
            const endRegex = new RegExp(`${pattern}$`, 'g');

            const newText = fullText
                .replace(splitRegex, '$1\n')
                .replace(endRegex, '$1\n');

            const newLines = newText.split('\n')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            if (newLines.length === 0) return [{ id: `line-${Date.now()}`, speakerId: 'Speaker', text: '' }];

            return newLines.map((text, index) => {
                const charCount = text.replace(/\s/g, '').length;
                return {
                    id: `line-${Date.now()}-${index}`,
                    speakerId: 'Speaker',
                    text: text,
                    estimatedTime: charCount * 0.25,
                    style: ''
                };
            });
        });
    };

    const handlePreviewVoice = async (voiceId: string) => {
        if (isPreviewLoading[voiceId]) return;

        setIsPreviewLoading(prev => ({ ...prev, [voiceId]: true }));
        try {
            // Preview always uses normal speed
            const base64Pcm = await previewVoice(voiceId);
            const blob = createWavBlobFromBase64Pcm(base64Pcm);
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
        } catch (e) {
            console.error("Preview failed", e);
            alert("음성 미리듣기에 실패했습니다.");
        } finally {
            setIsPreviewLoading(prev => ({ ...prev, [voiceId]: false }));
        }
    };

    const handleGenerateAudio = async () => {
        const fullText = scriptLines.map(l => l.text).join('\n').trim();
        if (!fullText) {
            setError("변환할 텍스트를 입력해주세요.");
            return;
        }
        if (fullText.length > MAX_CHAR_LIMIT) {
            setError(`글자 수는 ${MAX_CHAR_LIMIT.toLocaleString()}자를 초과할 수 없습니다.`);
            return;
        }
        if (!singleSpeakerVoice) {
            alert("음성을 선택해주세요. 좌측 설정에서 목소리를 선택한 후 다시 시도해주세요.");
            setError("음성을 선택해주세요.");
            return;
        }

        setIsLoading(true);
        setLoadingStatus('대본 분석 및 분할 중...');
        setError(null);
        abortControllerRef.current = new AbortController();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            // Dual-Limit Strategy: 1800 chars OR 40 lines, whichever comes first.
            // This prevents AI from hallucinating or collapsing many short lines.
            const isNativeAudio = selectedModel.includes('native-audio-dialog');

            if (isNativeAudio) {
                // --- NEW STRATEGY: Single-Session Multi-Turn ---
                console.log("[App] Using Single-Session Multi-Turn Strategy for Native Audio.");
                setLoadingStatus('멀티 턴 정밀 낭독 세션 시작 중...');

                const lines = fullText.split('\n');

                // TTS 전용 API 키 준비
                const ttsKeys = ttsApiKeys
                    .filter(item => item.key.trim() !== '')
                    .map(item => item.key);

                const result = await generateAudioWithFallback(
                    lines,
                    singleSpeakerVoice,
                    stylePrompt,
                    speechSpeed, // Pass the speed correctly
                    500, // 500ms silence between lines
                    ttsKeys,  // TTS 전용 API 키 배열
                    userApiKey,  // 기본 API 키 (fallback)
                    abortControllerRef.current.signal
                );

                setLoadingStatus('오디오 및 자막 데이터 처리 중...');

                const uint8Pcm = new Uint8Array(result.audioBuffer);
                const base64Pcm = uint8ArrayToBase64(uint8Pcm);
                const finalWavBlob = createWavBlobFromBase64Pcm(base64Pcm);
                const finalUrl = URL.createObjectURL(finalWavBlob);

                // --- KEY CHANGE: Generate SRT directly from paragraphs + calculated timings ---
                const srtText = generateSrtFromParagraphTimings(result.paragraphs, result.lineTimings);
                const finalSrtLines = parseSrt(srtText);

                const mergedAudioBuffer = await audioContext.decodeAudioData(await finalWavBlob.arrayBuffer());

                const newItem: AudioHistoryItem = {
                    id: `audio-${Date.now()}`,
                    src: finalUrl,
                    scriptChunk: fullText,
                    audioBuffer: mergedAudioBuffer,
                    isTrimmed: false,
                    contextDuration: 0,
                    status: 'full',
                    srtLines: finalSrtLines,
                    originalSrtLines: JSON.parse(JSON.stringify(finalSrtLines)),
                };

                setTtsResult(prev => ({
                    audioHistory: [newItem, ...prev.audioHistory],
                    srtContent: srtText
                }));

                setActiveAudioId(newItem.id);
                setEditableSrtLines(finalSrtLines);
                setOriginalSrtLines(JSON.parse(JSON.stringify(finalSrtLines)));
                setHasTimestampEdits(false);

            } else {
                // --- LEGACY STRATEGY: Standard Chunk-based TTS + Transcription ---
                const textChunks = splitTextIntoChunks(fullText, 2500, 50);
                const totalChunks = textChunks.length;

                let mergedAudioBuffer: AudioBuffer | null = null;
                const allParsedSrt: SrtLine[] = [];
                let currentTimeOffsetMs = 0;

                // 청크별 개별 오디오 저장 배열
                const audioChunkItems: AudioChunkItem[] = [];
                // 실패한 청크 추적
                const failedChunkIndices: number[] = [];

                for (let i = 0; i < totalChunks; i++) {
                    // 중단 신호 확인
                    if (abortControllerRef.current?.signal.aborted) {
                        throw new DOMException('사용자에 의해 중단되었습니다.', 'AbortError');
                    }

                    const chunkText = textChunks[i];

                    try {
                        // Add a small delay between requests to avoid 429 Too Many Requests
                        if (i > 0) {
                            await new Promise<void>((resolve, reject) => {
                                const signal = abortControllerRef.current?.signal;
                                if (signal?.aborted) { reject(new DOMException('중단됨', 'AbortError')); return; }
                                const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 5000);
                                const onAbort = () => { clearTimeout(timer); reject(new DOMException('중단됨', 'AbortError')); };
                                signal?.addEventListener('abort', onAbort, { once: true });
                            });
                        }

                        console.log(`[Chunk Loop] Starting chunk ${i + 1}/${totalChunks}...`);
                        setLoadingStatus(`오디오 생성 중 (${i + 1}/${totalChunks})...`);

                        // Step 2: Generate Audio for this chunk
                        const base64Pcm = await generateSingleSpeakerAudio(
                            chunkText,
                            singleSpeakerVoice,
                            selectedModel,
                            speechSpeed,
                            toneLevel,
                            stylePrompt,
                            abortControllerRef.current.signal
                        );

                        setLoadingStatus(`오디오 처리 중 (${i + 1}/${totalChunks})...`);
                        const chunkBlob = createWavBlobFromBase64Pcm(base64Pcm);
                        let chunkBuffer = await audioContext.decodeAudioData(await chunkBlob.arrayBuffer());

                        // ✅ 청크 끝 무음 제거 (Gemini API가 추가하는 패딩 제거)
                        console.log(`[Chunk ${i + 1}] Before trim: ${chunkBuffer.duration.toFixed(2)}s`);
                        chunkBuffer = trimTrailingSilence(chunkBuffer, 0.03, 0.3);
                        console.log(`[Chunk ${i + 1}] After trim: ${chunkBuffer.duration.toFixed(2)}s`);

                        // Step 3: Direct Script-to-SRT Mapping (No AI transcription)
                        const inputLines = chunkText.split('\n').filter(line => line.trim().length > 0);
                        const totalDurationMs = chunkBuffer.duration * 1000;
                        const avgLineDurationMs = totalDurationMs / inputLines.length;

                        const parsedChunkSrt: SrtLine[] = inputLines.map((line, idx) => {
                            const lineStartMs = idx * avgLineDurationMs;
                            const lineEndMs = (idx + 1) * avgLineDurationMs;
                            const globalIndex = allParsedSrt.length + idx + 1;
                            return {
                                id: `srt-${globalIndex}-${Date.now()}`,
                                index: globalIndex,
                                startTime: msToSrtTime(lineStartMs),
                                endTime: msToSrtTime(lineEndMs),
                                text: line
                            };
                        });

                        // Step 4: Apply total time offset to this chunk's timing
                        parsedChunkSrt.forEach(line => {
                            const shiftedStartMs = srtTimeToMs(line.startTime) + currentTimeOffsetMs;
                            const shiftedEndMs = srtTimeToMs(line.endTime) + currentTimeOffsetMs;
                            allParsedSrt.push({
                                ...line,
                                startTime: msToSrtTime(shiftedStartMs),
                                endTime: msToSrtTime(shiftedEndMs)
                            });
                        });

                        // Step 5: Merge Audio Buffers
                        if (!mergedAudioBuffer) {
                            mergedAudioBuffer = chunkBuffer;
                        } else {
                            const combined = audioContext.createBuffer(
                                mergedAudioBuffer.numberOfChannels,
                                mergedAudioBuffer.length + chunkBuffer.length,
                                mergedAudioBuffer.sampleRate
                            );
                            for (let channel = 0; channel < mergedAudioBuffer.numberOfChannels; channel++) {
                                const combinedData = combined.getChannelData(channel);
                                combinedData.set(mergedAudioBuffer.getChannelData(channel), 0);
                                combinedData.set(chunkBuffer.getChannelData(channel), mergedAudioBuffer.length);
                            }
                            mergedAudioBuffer = combined;
                        }

                        // Step 6: 청크별 개별 저장 (병합 전)
                        audioChunkItems.push({
                            id: `chunk-${i}-${Date.now()}`,
                            index: i,
                            buffer: chunkBuffer,
                            text: chunkText,
                            durationMs: chunkBuffer.duration * 1000
                        });

                        currentTimeOffsetMs += (chunkBuffer.duration * 1000);
                        console.log(`[Chunk Loop] Successfully finished chunk ${i + 1}/${totalChunks}.`);

                    } catch (chunkError) {
                        // 사용자 중단은 즉시 전파
                        if (chunkError instanceof DOMException && chunkError.name === 'AbortError') {
                            throw chunkError;
                        }

                        console.error(`[Chunk Loop] Error in chunk ${i + 1}:`, chunkError);

                        // 첫 번째 청크 실패는 치명적 오류
                        if (i === 0) throw chunkError;

                        // 실패 청크 기록 후 계속 진행
                        failedChunkIndices.push(i);
                        setError(`청크 ${i + 1} 생성 실패. 다음 청크 계속 진행 중...`);
                        console.log(`[Chunk Loop] Chunk ${i + 1} failed, continuing to next chunk...`);
                    }
                }

                if (!mergedAudioBuffer) throw new Error("오디오 생성 결과가 비어있습니다.");

                setLoadingStatus('최종 결과 정리 중...');
                const adjustedSrt = adjustSrtGaps(allParsedSrt);
                const finalWavBlob = encodeAudioBufferToWavBlob(mergedAudioBuffer);
                const finalUrl = URL.createObjectURL(finalWavBlob);

                const newItem: AudioHistoryItem = {
                    id: `audio-${Date.now()}`,
                    src: finalUrl,
                    scriptChunk: fullText,
                    audioBuffer: mergedAudioBuffer,
                    audioChunks: audioChunkItems,  // 청크별 개별 오디오 저장
                    failedChunks: failedChunkIndices.length > 0 ? failedChunkIndices : undefined,  // 실패 청크 기록
                    isTrimmed: false,
                    contextDuration: 0,
                    status: 'full',
                    srtLines: adjustedSrt,
                    originalSrtLines: JSON.parse(JSON.stringify(adjustedSrt)),
                };

                setTtsResult(prev => ({
                    audioHistory: [newItem, ...prev.audioHistory],
                    srtContent: stringifySrt(adjustedSrt)
                }));

                setActiveAudioId(newItem.id);
                setEditableSrtLines(adjustedSrt);
                setOriginalSrtLines(JSON.parse(JSON.stringify(adjustedSrt)));
                setHasTimestampEdits(false);

                // 실패한 청크가 있으면 사용자에게 알림
                if (failedChunkIndices.length > 0) {
                    const successCount = totalChunks - failedChunkIndices.length;
                    const failedChunkNumbers = failedChunkIndices.map(i => i + 1).join(', ');
                    setTimeout(() => {
                        alert(`⚠️ 오디오 생성 완료\n\n` +
                            `✅ 성공: ${successCount}/${totalChunks} 청크\n` +
                            `❌ 실패: 청크 ${failedChunkNumbers}\n\n` +
                            `우측 패널에서 실패한 청크를 개별 재생성할 수 있습니다.\n` +
                            `또는 [자막 재생성] 후 오류 라인을 확인하세요.`);
                    }, 500);
                }
            }

        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') {
                setError("작업이 취소되었습니다.");
            } else {
                console.error("Audio generation error:", e);
                setError(e instanceof Error ? e.message : "오디오 생성 중 오류가 발생했습니다.");
            }
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
            abortControllerRef.current = null;
        }
    };

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleRegenerateSrt = async (targetId?: string) => {
        // If a specific ID is provided, use it. Otherwise default to the active one, or the latest one.
        const idToUse = targetId || activeAudioId || ttsResult.audioHistory[0]?.id;
        const targetItem = ttsResult.audioHistory.find(item => item.id === idToUse);

        if (!targetItem) return;

        setIsLoading(true);
        setLoadingStatus('자막 재생성 중...');
        setError(null);
        abortControllerRef.current = new AbortController();

        try {
            // audioChunks가 있으면 청크별 처리 (Flash/Pro 모델)
            if (targetItem.audioChunks && targetItem.audioChunks.length > 0) {
                console.log('[Regenerate SRT] Using chunk-based transcription for', targetItem.audioChunks.length, 'chunks');

                const allSrtLines: SrtLine[] = [];
                let currentOffsetMs = 0;

                for (let i = 0; i < targetItem.audioChunks.length; i++) {
                    const chunk = targetItem.audioChunks[i];

                    // 청크 크기 확인
                    const chunkSizeBytes = chunk.buffer.length * chunk.buffer.numberOfChannels * 2;
                    const chunkSizeMB = chunkSizeBytes / (1024 * 1024);

                    console.log(`[Regenerate SRT] Chunk ${i + 1}/${targetItem.audioChunks.length}: ${chunkSizeMB.toFixed(1)}MB, duration: ${chunk.durationMs.toFixed(0)}ms`);

                    if (chunkSizeMB > 20) {
                        console.warn(`[Chunk ${i + 1}] Too large (${chunkSizeMB.toFixed(1)}MB), skipping transcription`);
                        setError(`청크 ${i + 1}이 너무 큽니다 (${chunkSizeMB.toFixed(1)}MB). 청크 분할 크기를 줄여주세요.`);
                        continue;
                    }

                    setLoadingStatus(`자막 생성 중 (${i + 1}/${targetItem.audioChunks.length})...`);

                    try {
                        console.log(`[Regenerate SRT] Step ${i + 1}.1: Converting chunk to WAV base64...`);
                        const wavBase64 = await audioBufferToWavBase64(chunk.buffer);
                        console.log(`[Regenerate SRT] Step ${i + 1}.1 Complete: WAV size:`, wavBase64.length, 'chars');

                        console.log(`[Regenerate SRT] Step ${i + 1}.2: Calling Gemini transcription...`);
                        const chunkSrt = await transcribeAudioWithSrt(
                            wavBase64,
                            srtSplitCharCount,
                            abortControllerRef.current.signal,
                            chunk.text
                        );
                        console.log(`[Regenerate SRT] Step ${i + 1}.2 Complete: SRT length:`, chunkSrt.length);

                        const parsedChunkSrt = parseSrt(chunkSrt);
                        console.log(`[Regenerate SRT] Step ${i + 1}.3: Parsed ${parsedChunkSrt.length} SRT lines`);

                        // 타임스탬프 오프셋 적용
                        parsedChunkSrt.forEach(line => {
                            const startMs = srtTimeToMs(line.startTime) + currentOffsetMs;
                            const endMs = srtTimeToMs(line.endTime) + currentOffsetMs;
                            allSrtLines.push({
                                ...line,
                                index: allSrtLines.length + 1,
                                startTime: msToSrtTime(startMs),
                                endTime: msToSrtTime(endMs)
                            });
                        });

                        currentOffsetMs += chunk.durationMs;
                        console.log(`[Regenerate SRT] Chunk ${i + 1} complete, total lines: ${allSrtLines.length}, next offset: ${currentOffsetMs}ms`);

                    } catch (chunkError) {
                        console.error(`[Regenerate SRT] Chunk ${i + 1} failed:`, chunkError);
                        // 청크 실패 시 계속 진행 (일부 자막이라도 생성)
                        if (chunkError instanceof Error && chunkError.name === 'AbortError') {
                            throw chunkError; // 사용자 중단은 즉시 전파
                        }
                        // 다른 오류는 로그만 남기고 계속
                        console.warn(`[Regenerate SRT] Continuing despite chunk ${i + 1} failure`);
                        currentOffsetMs += chunk.durationMs; // 오프셋은 유지
                    }
                }

                if (allSrtLines.length === 0) {
                    throw new Error('모든 청크에서 자막 생성에 실패했습니다.');
                }

                console.log('[Regenerate SRT] All chunks processed, adjusting gaps...');
                const adjustedSrt = adjustSrtGaps(allSrtLines);
                console.log('[Regenerate SRT] Gaps adjusted, first 3 lines:', adjustedSrt.slice(0, 3).map(l => `${l.index}: ${l.startTime} --> ${l.endTime}`));

                // ✅ 오디오 누락 감지 적용
                const srtWithWarnings = detectMissingAudio(
                    adjustedSrt,
                    targetItem.audioChunks || [],
                    targetItem.failedChunks
                );
                console.log('[Regenerate SRT] Applied warnings, lines with issues:', srtWithWarnings.filter(l => l.warningType).length);

                setTtsResult(prev => ({
                    ...prev,
                    audioHistory: prev.audioHistory.map(item =>
                        item.id === idToUse ? { ...item, srtLines: srtWithWarnings, originalSrtLines: JSON.parse(JSON.stringify(srtWithWarnings)) } : item
                    ),
                    srtContent: stringifySrt(srtWithWarnings)
                }));

                setEditableSrtLines(srtWithWarnings);
                setOriginalSrtLines(JSON.parse(JSON.stringify(srtWithWarnings)));
                setHasTimestampEdits(false);
                setActiveAudioId(idToUse);

                // ✅ 오디오 누락 라인 알림
                const missingCount = srtWithWarnings.filter(l => l.warningType === 'no_audio').length;
                const suspiciousCount = srtWithWarnings.filter(l => l.warningType === 'suspicious_timecode').length;

                if (missingCount > 0 || suspiciousCount > 0) {
                    const affectedChunks = [...new Set(
                        srtWithWarnings
                            .filter(l => l.warningType === 'no_audio')
                            .map(l => l.chunkIndex)
                            .filter(i => i !== undefined && i >= 0)
                    )];

                    setTimeout(() => {
                        let alertMsg = `⚠️ 자막 분석 완료\n\n`;
                        if (missingCount > 0) {
                            alertMsg += `🔴 오디오 누락: ${missingCount}개 라인\n`;
                            if (affectedChunks.length > 0) {
                                alertMsg += `   영향받는 청크: ${affectedChunks.map(i => i! + 1).join(', ')}\n`;
                            }
                        }
                        if (suspiciousCount > 0) {
                            alertMsg += `🟡 의심스러운 타임코드: ${suspiciousCount}개 라인\n`;
                        }
                        alertMsg += `\n우측 자막 목록에서 오류 라인을 확인하세요.\n`;
                        if (affectedChunks.length > 0) {
                            alertMsg += `해당 청크를 개별 재생성할 수 있습니다.`;
                        }
                        alert(alertMsg);
                    }, 500);
                }

            } else {
                // Native Audio 모델 - 기존 방식 유지 (전체 오디오 한 번에 처리)
                console.log('[Regenerate SRT] Using single-pass transcription (Native Audio model)');

                console.log('[Regenerate SRT] Step 1: Converting audio to WAV base64...');
                const wavBase64 = await audioBufferToWavBase64(targetItem.audioBuffer);
                console.log('[Regenerate SRT] Step 1 Complete: WAV size:', wavBase64.length, 'chars');

                console.log('[Regenerate SRT] Step 2: Calling Gemini transcription...');
                console.log('[Regenerate SRT] Step 2 Params: srtSplitCharCount =', srtSplitCharCount, ', scriptChunk length =', targetItem.scriptChunk.length);

                const srt = await transcribeAudioWithSrt(wavBase64, srtSplitCharCount, abortControllerRef.current.signal, targetItem.scriptChunk);
                console.log('[Regenerate SRT] Step 3: Received SRT, length:', srt.length);

                const parsedSrt = parseSrt(srt);
                console.log('[Regenerate SRT] Step 4: Parsed SRT lines:', parsedSrt.length);

                const adjustedSrt = adjustSrtGaps(parsedSrt);
                console.log('[Regenerate SRT] Step 5: Adjusted gaps, first 3 lines:', adjustedSrt.slice(0, 3).map(l => `${l.index}: ${l.startTime} --> ${l.endTime}`));

                // ✅ 오디오 누락 감지 적용
                const srtWithWarnings = detectMissingAudio(
                    adjustedSrt,
                    targetItem.audioChunks || [],
                    targetItem.failedChunks
                );
                console.log('[Regenerate SRT] Step 6: Applied warnings, lines with issues:', srtWithWarnings.filter(l => l.warningType).length);

                setTtsResult(prev => ({
                    ...prev,
                    audioHistory: prev.audioHistory.map(item =>
                        item.id === idToUse ? { ...item, srtLines: srtWithWarnings, originalSrtLines: JSON.parse(JSON.stringify(srtWithWarnings)) } : item
                    ),
                    srtContent: stringifySrt(srtWithWarnings)
                }));

                setEditableSrtLines(srtWithWarnings);
                setOriginalSrtLines(JSON.parse(JSON.stringify(srtWithWarnings)));
                setHasTimestampEdits(false);
                setActiveAudioId(idToUse);

                // ✅ 오디오 누락 라인 알림
                const missingCount = srtWithWarnings.filter(l => l.warningType === 'no_audio').length;
                const suspiciousCount = srtWithWarnings.filter(l => l.warningType === 'suspicious_timecode').length;

                if (missingCount > 0 || suspiciousCount > 0) {
                    const affectedChunks = [...new Set(
                        srtWithWarnings
                            .filter(l => l.warningType === 'no_audio')
                            .map(l => l.chunkIndex)
                            .filter(i => i !== undefined && i >= 0)
                    )];

                    setTimeout(() => {
                        let alertMsg = `⚠️ 자막 분석 완료\n\n`;
                        if (missingCount > 0) {
                            alertMsg += `🔴 오디오 누락: ${missingCount}개 라인\n`;
                            if (affectedChunks.length > 0) {
                                alertMsg += `   영향받는 청크: ${affectedChunks.map(i => i! + 1).join(', ')}\n`;
                            }
                        }
                        if (suspiciousCount > 0) {
                            alertMsg += `🟡 의심스러운 타임코드: ${suspiciousCount}개 라인\n`;
                        }
                        alertMsg += `\n우측 자막 목록에서 오류 라인을 확인하세요.\n`;
                        if (affectedChunks.length > 0) {
                            alertMsg += `해당 청크를 개별 재생성할 수 있습니다.`;
                        }
                        alert(alertMsg);
                    }, 500);
                }
            }

        } catch (e) {
            console.error('[Regenerate SRT] ERROR:', e);
            if (e instanceof Error && e.name !== 'AbortError') {
                console.error('[Regenerate SRT] Error name:', e.name);
                console.error('[Regenerate SRT] Error message:', e.message);
                console.error('[Regenerate SRT] Error stack:', e.stack);

                // 상세한 에러 정보 제공
                let userMessage = e.message;
                if (e.message.includes('quota') || e.message.includes('429')) {
                    userMessage = 'API 할당량 초과. 잠시 후 다시 시도해주세요.';
                } else if (e.message.includes('timeout')) {
                    userMessage = '요청 시간 초과. 오디오가 너무 깁니다.';
                } else if (e.message.includes('base64')) {
                    userMessage = '오디오 파일이 너무 큽니다. 청크 분할 크기를 줄여주세요.';
                }

                setError(userMessage);
                alert(`자막 재생성 오류:\n\n${userMessage}`);
            }
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
            abortControllerRef.current = null;
        }
    };

    // CapCut 연동: 스크립트 → 자막 영역 복사
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

    // CapCut SRT 업로드: 타임코드 매칭
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

    const handleClearAudioHistory = () => {
        ttsResult.audioHistory.forEach(item => URL.revokeObjectURL(item.src));
        setTtsResult({ audioHistory: [], srtContent: null });
        setEditableSrtLines([]);
        setOriginalSrtLines([]);
        setSilentSegments([]);
        setActiveAudioId(null);
    };

    const handleTrimAudio = async (id: string) => {
        alert("이 기능은 현재 구현 중입니다.");
    };

    const handleDetectSilence = (targetId?: string) => {
        const idToUse = targetId || activeAudioId || ttsResult.audioHistory[0]?.id;
        const targetItem = ttsResult.audioHistory.find(item => item.id === idToUse);

        if (!targetItem) return;
        const segments = detectSilence(targetItem.audioBuffer);
        setSilentSegments(segments);
    };

    const handleRemoveSilenceSegments = async (segmentsToRemove: { start: number; end: number }[]) => {
        alert("오디오 무음 제거 기능은 자막 편집기 탭에서 오디오 파일을 업로드하여 사용할 수 있습니다.");
        setSilentSegments([]);
    };

    // 청크별 ZIP 다운로드 핸들러
    const handleDownloadChunksAsZip = async (targetId?: string) => {
        const idToUse = targetId || activeAudioId || ttsResult.audioHistory[0]?.id;
        const targetItem = ttsResult.audioHistory.find(item => item.id === idToUse);

        if (!targetItem?.audioChunks?.length) {
            setError("다운로드할 청크가 없습니다. Flash/Pro TTS로 생성된 오디오만 청크별 다운로드를 지원합니다.");
            return;
        }

        try {
            await downloadChunksAsZip(targetItem.audioChunks, `tts-${Date.now()}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "ZIP 다운로드 중 오류가 발생했습니다.");
        }
    };

    // 샘플 미리보기 생성 (처음 5줄만)
    const handleGenerateSample = async () => {
        if (scriptLines.length === 0) {
            setError("스크립트를 입력해주세요.");
            return;
        }

        const sampleLines = scriptLines.slice(0, 5);
        const sampleText = sampleLines.map(line => line.text).join('\n');

        if (sampleText.trim().length === 0) {
            setError("미리보기할 텍스트가 없습니다.");
            return;
        }

        setSampleLoading(true);
        setSampleAudio(null);
        setIsSampleApproved(false);
        setError(null);

        try {
            const audioData = await generateSingleSpeakerAudio(
                sampleText,
                singleSpeakerVoice,
                selectedModel,
                speechSpeed,
                toneLevel,
                stylePrompt
            );

            const wavBlob = createWavBlobFromBase64Pcm(audioData);
            const url = URL.createObjectURL(wavBlob);

            setSampleAudio({ src: url, text: sampleText });
        } catch (e) {
            setError(e instanceof Error ? e.message : "샘플 생성 중 오류가 발생했습니다.");
        } finally {
            setSampleLoading(false);
        }
    };

    // 샘플 승인 후 전체 생성
    const handleApproveSampleAndGenerate = () => {
        if (sampleAudio) {
            URL.revokeObjectURL(sampleAudio.src);
        }
        setSampleAudio(null);
        setIsSampleApproved(true);
        handleGenerateAudio();
    };

    // 샘플 거부 (초기화)
    const handleRejectSample = () => {
        if (sampleAudio) {
            URL.revokeObjectURL(sampleAudio.src);
        }
        setSampleAudio(null);
        setIsSampleApproved(false);
    };

    // 청크 재생성: 특정 청크만 다시 생성하여 교체
    const handleRegenerateChunk = async (audioItemId: string, chunkIndex: number) => {
        const targetItem = ttsResult.audioHistory.find(item => item.id === audioItemId);
        if (!targetItem?.audioChunks || !targetItem.audioChunks[chunkIndex]) {
            setError('재생성할 청크를 찾을 수 없습니다.');
            return;
        }

        const chunk = targetItem.audioChunks[chunkIndex];
        setIsLoading(true);
        setLoadingStatus(`청크 ${chunkIndex + 1} 재생성 중...`);
        setError(null);
        abortControllerRef.current = new AbortController();

        try {
            const base64Pcm = await generateSingleSpeakerAudio(
                chunk.text,
                singleSpeakerVoice,
                selectedModel,
                speechSpeed,
                toneLevel,
                stylePrompt,
                abortControllerRef.current.signal
            );

            const audioContext = new AudioContext();
            const wavBlob = createWavBlobFromBase64Pcm(base64Pcm);
            const newBuffer = await audioContext.decodeAudioData(await wavBlob.arrayBuffer());

            // 청크 교체
            const updatedChunks = [...targetItem.audioChunks];
            updatedChunks[chunkIndex] = {
                ...chunk,
                id: `chunk-${chunkIndex}-${Date.now()}`,
                buffer: newBuffer,
                durationMs: newBuffer.duration * 1000,
            };

            // 전체 오디오 재병합
            let mergedBuffer: AudioBuffer | null = null;
            for (const c of updatedChunks) {
                if (!mergedBuffer) {
                    mergedBuffer = c.buffer;
                } else {
                    const combined = audioContext.createBuffer(
                        mergedBuffer.numberOfChannels,
                        mergedBuffer.length + c.buffer.length,
                        mergedBuffer.sampleRate
                    );
                    for (let ch = 0; ch < mergedBuffer.numberOfChannels; ch++) {
                        const data = combined.getChannelData(ch);
                        data.set(mergedBuffer.getChannelData(ch), 0);
                        data.set(c.buffer.getChannelData(ch), mergedBuffer.length);
                    }
                    mergedBuffer = combined;
                }
            }

            if (!mergedBuffer) throw new Error('오디오 병합 실패');

            // SRT 재계산
            const allSrtLines: SrtLine[] = [];
            let timeOffsetMs = 0;
            for (const c of updatedChunks) {
                const lines = c.text.split('\n').filter(l => l.trim().length > 0);
                const avgMs = c.durationMs / lines.length;
                lines.forEach((line, idx) => {
                    const globalIdx = allSrtLines.length + 1;
                    allSrtLines.push({
                        id: `srt-${globalIdx}-${Date.now()}`,
                        index: globalIdx,
                        startTime: msToSrtTime(timeOffsetMs + idx * avgMs),
                        endTime: msToSrtTime(timeOffsetMs + (idx + 1) * avgMs),
                        text: line,
                    });
                });
                timeOffsetMs += c.durationMs;
            }

            const adjustedSrt = adjustSrtGaps(allSrtLines);
            const finalWavBlob = encodeAudioBufferToWavBlob(mergedBuffer);
            URL.revokeObjectURL(targetItem.src);
            const finalUrl = URL.createObjectURL(finalWavBlob);

            // 히스토리 업데이트
            setTtsResult(prev => ({
                ...prev,
                audioHistory: prev.audioHistory.map(item =>
                    item.id === audioItemId
                        ? {
                            ...item,
                            audioChunks: updatedChunks,
                            audioBuffer: mergedBuffer!,
                            src: finalUrl,
                            srtLines: adjustedSrt,
                            originalSrtLines: JSON.parse(JSON.stringify(adjustedSrt)),
                        }
                        : item
                ),
                srtContent: stringifySrt(adjustedSrt),
            }));

            setEditableSrtLines(adjustedSrt);
            setOriginalSrtLines(JSON.parse(JSON.stringify(adjustedSrt)));

        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') {
                setError('재생성이 취소되었습니다.');
            } else {
                setError(e instanceof Error ? e.message : '청크 재생성 중 오류 발생');
            }
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
            abortControllerRef.current = null;
        }
    };


    const handleActiveAudioChange = useCallback((id: string) => {
        const item = ttsResult.audioHistory.find(i => i.id === id);
        if (item) {
            setActiveAudioId(id);
            setEditableSrtLines(item.srtLines);
            setOriginalSrtLines(item.originalSrtLines);
            setTtsResult(prev => ({ ...prev, srtContent: stringifySrt(item.srtLines) }));
            setSilentSegments([]); // Reset UI specific states
        }
    }, [ttsResult.audioHistory]);

    const handleUpdateSrtLine = useCallback((id: string, newValues: Partial<Omit<SrtLine, 'id' | 'index'>>) => {
        setEditableSrtLines(prev => {
            const index = prev.findIndex(l => l.id === id);
            if (index === -1) return prev;

            const updatedLines = [...prev];
            const oldLine = updatedLines[index];
            let currentLine = { ...oldLine, ...newValues };

            let startMs = srtTimeToMs(currentLine.startTime);
            let endMs = srtTimeToMs(currentLine.endTime);
            const oldStartMs = srtTimeToMs(oldLine.startTime);
            const oldEndMs = srtTimeToMs(oldLine.endTime);

            updatedLines[index] = currentLine;

            const prevLine = index > 0 ? updatedLines[index - 1] : null;

            if (isTimestampSyncEnabled) {
                // === RIPPLE / ROLLING EDIT MODE (SYNC ON) ===
                // 1. Changing START time -> Adjust PREVIOUS END time (Rolling Edit)
                //    Only if we have a previous line.
                if (newValues.startTime !== undefined && prevLine) {
                    const delta = startMs - oldStartMs;
                    const prevEndMs = srtTimeToMs(prevLine.endTime);
                    const newPrevEndMs = prevEndMs + delta;

                    updatedLines[index - 1] = {
                        ...prevLine,
                        endTime: msToSrtTime(newPrevEndMs)
                    };
                }

                // 2. Changing END time -> Adjust ALL SUBSEQUENT lines (Ripple Edit)
                if (newValues.endTime !== undefined) {
                    const delta = endMs - oldEndMs;
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
                // === CLAMPING MODE (SYNC OFF) ===
                if (prevLine) {
                    const prevEndMs = srtTimeToMs(prevLine.endTime);
                    if (startMs < prevEndMs) {
                        startMs = prevEndMs; // 이전 종료 시간보다 앞으로 갈 수 없음
                        currentLine.startTime = msToSrtTime(startMs);
                    }
                } else {
                    if (startMs < 0) {
                        startMs = 0;
                        currentLine.startTime = msToSrtTime(startMs);
                    }
                }

                const nextLine = index < updatedLines.length - 1 ? updatedLines[index + 1] : null;
                if (nextLine) {
                    const nextStartMs = srtTimeToMs(nextLine.startTime);
                    if (endMs > nextStartMs) {
                        endMs = nextStartMs; // 다음 시작 시간보다 뒤로 갈 수 없음
                        currentLine.endTime = msToSrtTime(endMs);
                    }
                }

                if (startMs >= endMs) {
                    if (newValues.startTime) {
                        endMs = startMs + 100;
                        currentLine.endTime = msToSrtTime(endMs);
                    }
                    else if (newValues.endTime) {
                        startMs = Math.max(0, endMs - 100);
                        currentLine.startTime = msToSrtTime(startMs);
                    }
                }

                updatedLines[index] = currentLine;
            }

            // Sync with history
            setTtsResult(prevTts => ({
                ...prevTts,
                audioHistory: prevTts.audioHistory.map(item =>
                    item.id === activeAudioId ? { ...item, srtLines: updatedLines } : item
                )
            }));

            return updatedLines;
        });

        // Only set flag if timestamp changed (text edit doesn't count for reconstruction disable)
        if (newValues.startTime !== undefined || newValues.endTime !== undefined) {
            setHasTimestampEdits(true);
        }
    }, [isTimestampSyncEnabled, activeAudioId]);

    const handleRemoveSrtLine = useCallback((id: string) => {
        setEditableSrtLines(prev => {
            const newLines = prev.filter(l => l.id !== id);
            setTtsResult(prevTts => ({
                ...prevTts,
                audioHistory: prevTts.audioHistory.map(item =>
                    item.id === activeAudioId ? { ...item, srtLines: newLines } : item
                )
            }));
            return newLines;
        });
        setHasTimestampEdits(true);
    }, [activeAudioId]);

    const handleSplitSrtLine = useCallback((index: number, cursorPosition: number) => {
        setEditableSrtLines(prev => {
            const line = prev[index];
            const text = line.text;
            const firstPartText = text.slice(0, cursorPosition).trim();
            const secondPartText = text.slice(cursorPosition).trim();

            if (!secondPartText) return prev;

            const startMs = srtTimeToMs(line.startTime);
            const endMs = srtTimeToMs(line.endTime);
            const duration = endMs - startMs;

            const totalLen = text.length;
            const splitRatio = totalLen > 0 ? cursorPosition / totalLen : 0.5;
            const splitTimeMs = startMs + Math.floor(duration * splitRatio);

            const newFirstLine = {
                ...line,
                text: firstPartText,
                endTime: msToSrtTime(splitTimeMs)
            };

            const newSecondLine: SrtLine = {
                id: `srt-${Date.now()}`,
                index: line.index + 1,
                startTime: msToSrtTime(splitTimeMs),
                endTime: line.endTime,
                text: secondPartText
            };

            const newLines = [...prev];
            newLines.splice(index, 1, newFirstLine, newSecondLine);

            const reindexedLines = newLines.map((l, i) => ({ ...l, index: i + 1 }));

            setTtsResult(prevTts => ({
                ...prevTts,
                audioHistory: prevTts.audioHistory.map(item =>
                    item.id === activeAudioId ? { ...item, srtLines: reindexedLines } : item
                )
            }));

            return reindexedLines;
        });
        setHasTimestampEdits(true);
    }, [activeAudioId]);

    const handleResetSrt = () => {
        setEditableSrtLines(JSON.parse(JSON.stringify(originalSrtLines)));
        setTtsResult(prevTts => ({
            ...prevTts,
            audioHistory: prevTts.audioHistory.map(item =>
                item.id === activeAudioId ? { ...item, srtLines: JSON.parse(JSON.stringify(originalSrtLines)) } : item
            )
        }));
        setHasTimestampEdits(false);
    };

    const handleBulkTimeShift = (shiftMs: number) => {
        setEditableSrtLines(prev => {
            const newLines = prev.map(line => {
                const start = Math.max(0, srtTimeToMs(line.startTime) + shiftMs);
                const end = Math.max(0, srtTimeToMs(line.endTime) + shiftMs);
                return {
                    ...line,
                    startTime: msToSrtTime(start),
                    endTime: msToSrtTime(end)
                };
            });

            setTtsResult(prevTts => ({
                ...prevTts,
                audioHistory: prevTts.audioHistory.map(item =>
                    item.id === activeAudioId ? { ...item, srtLines: newLines } : item
                )
            }));
            return newLines;
        });
        setHasTimestampEdits(true);
    };

    const handleReconstructAudio = async () => {
        // Find the audio item that matches the current editing context
        // Defaults to the latest if activeAudioId is somehow null
        const targetItem = activeAudioId
            ? ttsResult.audioHistory.find(item => item.id === activeAudioId)
            : ttsResult.audioHistory[0];

        if (!targetItem) return;

        setIsLoading(true);
        setLoadingStatus('오디오 재구성 중...');
        try {
            const { newBuffer, newSrtLines } = spliceAudio(targetItem.audioBuffer, editableSrtLines, originalSrtLines);
            const blob = encodeAudioBufferToWavBlob(newBuffer);
            const url = URL.createObjectURL(blob);

            const newItem: AudioHistoryItem = {
                id: `audio-reconstructed-${Date.now()}`,
                src: url,
                scriptChunk: targetItem.scriptChunk,
                audioBuffer: newBuffer,
                isTrimmed: true,
                contextDuration: 0,
                status: 'trimmed',
                srtLines: newSrtLines,
                originalSrtLines: JSON.parse(JSON.stringify(newSrtLines)),
            };

            setTtsResult(prev => ({
                ...prev,
                audioHistory: [newItem, ...prev.audioHistory],
                srtContent: stringifySrt(newSrtLines)
            }));

            setActiveAudioId(newItem.id);
            setEditableSrtLines(newSrtLines);
            setOriginalSrtLines(JSON.parse(JSON.stringify(newSrtLines)));
            setHasTimestampEdits(false);

        } catch (e) {
            setError(e instanceof Error ? e.message : "오디오 재구성 실패");
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans selection:bg-indigo-500 selection:text-white flex flex-col">
            <div className="max-w-[1800px] mx-auto p-4 lg:p-6 space-y-6 pb-4 w-full flex-grow flex flex-col">
                <header className="relative w-full pb-0 pt-2 flex-shrink-0">
                    {/* Settings Button */}
                    <div className="absolute top-0 right-0 z-10">
                        <button
                            onClick={() => setIsApiKeyModalOpen(true)}
                            className="p-2 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-full transition-colors"
                            title="API 키 설정"
                        >
                            <SettingsIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center gap-4 pt-2">
                        <h1 className="text-3xl font-extrabold tracking-tight text-white whitespace-nowrap">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">AI 보이스 스튜디오</span>
                        </h1>
                        <p className="text-gray-400 text-sm text-center">텍스트를 입력하고 전문 성우급의 고품질 보이스를 생성하세요.</p>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex justify-center mt-6 border-b border-gray-700">
                        <button
                            onClick={() => setActiveTab('tts')}
                            className={`px-6 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'tts'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                                }`}
                        >
                            <MicrophoneIcon className="w-4 h-4" />
                            TTS 스튜디오
                        </button>
                        <button
                            onClick={() => setActiveTab('subtitles')}
                            className={`px-6 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'subtitles'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                                }`}
                        >
                            <DocumentTextIcon className="w-4 h-4" />
                            자막 편집기
                        </button>
                    </div>
                </header>

                {activeTab === 'tts' ? (
                    <MainContent
                        singleSpeakerVoice={singleSpeakerVoice}
                        setSingleSpeakerVoice={setSingleSpeakerVoice}
                        speechSpeed={speechSpeed}
                        setSpeechSpeed={setSpeechSpeed}
                        toneLevel={toneLevel}
                        setToneLevel={setToneLevel}
                        voices={VOICES}
                        onPreviewVoice={handlePreviewVoice}
                        isPreviewLoading={isPreviewLoading}
                        srtSplitCharCount={srtSplitCharCount}
                        setSrtSplitCharCount={setSrtSplitCharCount}

                        // New Props
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        stylePrompt={stylePrompt}
                        setStylePrompt={setStylePrompt}
                        favorites={favorites}
                        toggleFavorite={toggleFavorite}

                        presets={presets}
                        onSavePreset={handleSavePreset}
                        onDeletePreset={handleDeletePreset}
                        onLoadPreset={handleLoadPreset}
                        onExportPreset={handleExportPreset}
                        onImportPreset={handleImportPreset}

                        isLoading={isLoading}
                        loadingStatus={loadingStatus}
                        error={error}
                        audioHistory={ttsResult.audioHistory}
                        srtContent={ttsResult.srtContent}
                        activeSrtLineId={activeSrtLineId}
                        setActiveSrtLineId={setActiveSrtLineId}
                        onGenerateAudio={handleGenerateAudio}
                        onStopGeneration={handleStopGeneration}
                        onClearAudioHistory={handleClearAudioHistory}
                        onTrimAudio={handleTrimAudio}
                        onActiveAudioChange={handleActiveAudioChange}

                        scriptLines={scriptLines}
                        onScriptChange={handleScriptChange}
                        onUpdateScriptLine={handleUpdateScriptLine}
                        onRemoveScriptLine={handleRemoveScriptLine}
                        onAddScriptLine={handleAddScriptLine}
                        onRemoveEmptyScriptLines={handleRemoveEmptyScriptLines}
                        onAutoFormatScript={handleAutoFormatScript}
                        onMergeScriptLine={handleMergeScriptLine}
                        onSplitScriptLine={handleSplitScriptLine}

                        onRegenerateSrt={handleRegenerateSrt}
                        onDetectSilence={handleDetectSilence}
                        silentSegments={silentSegments}
                        onRemoveSilenceSegments={handleRemoveSilenceSegments}
                        scriptAnalysis={scriptAnalysis}
                        totalEstimatedTime={totalEstimatedTime}

                        editableSrtLines={editableSrtLines}
                        originalSrtLines={originalSrtLines}
                        onUpdateSrtLine={handleUpdateSrtLine}
                        onRemoveSrtLine={handleRemoveSrtLine}
                        onSplitSrtLine={handleSplitSrtLine}
                        onResetSrt={handleResetSrt}
                        onBulkTimeShift={handleBulkTimeShift}
                        onReconstructAudio={handleReconstructAudio}
                        hasTimestampEdits={hasTimestampEdits}
                        isTimestampSyncEnabled={isTimestampSyncEnabled}
                        setIsTimestampSyncEnabled={setIsTimestampSyncEnabled}
                        isAnalysisPanelOpen={isAnalysisPanelOpen}
                        setIsAnalysisPanelOpen={setIsAnalysisPanelOpen}
                        onDownloadChunksAsZip={handleDownloadChunksAsZip}
                        sampleAudio={sampleAudio}
                        sampleLoading={sampleLoading}
                        onGenerateSample={handleGenerateSample}
                        onApproveSample={handleApproveSampleAndGenerate}
                        onRejectSample={handleRejectSample}
                        onRegenerateChunk={handleRegenerateChunk}
                        onCopyScriptToSrt={handleCopyScriptToSrt}
                        onUpdateSrtFromCapCut={handleUpdateSrtFromCapCut}
                    />
                ) : (
                    <SubtitleGenerator />
                )}

                {/* API Key Modal */}
                {isApiKeyModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">
                            <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900/50">
                                <h3 className="text-lg font-bold text-white">API 키 설정</h3>
                                <button onClick={() => setIsApiKeyModalOpen(false)} className="text-gray-400 hover:text-white">
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto">
                                <p className="text-sm text-gray-300">
                                    Gemini API 키를 입력하세요. 입력한 키는 브라우저에만 저장되며 서버로 전송되지 않습니다.
                                </p>

                                {/* 기본 API 키 (대본 분석용) */}
                                <div className="space-y-2">
                                    <label htmlFor="api-key-input" className="block text-sm font-medium text-gray-300">
                                        기본 API 키 (대본 분석/자막 생성용)
                                    </label>
                                    <input
                                        id="api-key-input"
                                        type="password"
                                        value={userApiKey}
                                        onChange={(e) => setUserApiKey(e.target.value)}
                                        placeholder="AIza..."
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                {/* TTS 전용 API 키 리스트 */}
                                <div className="space-y-3 pt-4 border-t border-gray-700">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-gray-300">
                                            TTS 전용 API 키 (우선순위 순)
                                        </label>
                                        <button
                                            onClick={handleAddTtsKey}
                                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md font-medium transition-colors flex items-center gap-1"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            추가
                                        </button>
                                    </div>

                                    {ttsApiKeys.length === 0 ? (
                                        <p className="text-xs text-gray-500 bg-gray-900/50 p-3 rounded-md">
                                            TTS 전용 API 키를 추가하면 음성 생성 시 기본 키 대신 우선 사용됩니다.<br />
                                            Rate Limit 에러 시 자동으로 다음 키로 전환됩니다.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {ttsApiKeys.map((item, index) => (
                                                <div key={item.id} className="flex items-center gap-2 bg-gray-900/30 p-2 rounded-md">
                                                    {/* 우선순위 표시 */}
                                                    <span className="text-xs font-mono text-gray-500 w-8 text-center flex-shrink-0">
                                                        #{index + 1}
                                                    </span>

                                                    {/* API 키 입력 */}
                                                    <input
                                                        type="password"
                                                        value={item.key}
                                                        onChange={(e) => handleUpdateTtsKey(item.id, e.target.value)}
                                                        placeholder={`TTS API 키 ${index + 1}`}
                                                        className="flex-grow bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />

                                                    {/* 위/아래 이동 버튼 */}
                                                    <button
                                                        onClick={() => handleMoveTtsKey(index, 'up')}
                                                        disabled={index === 0}
                                                        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                                                        title="위로 이동"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveTtsKey(index, 'down')}
                                                        disabled={index === ttsApiKeys.length - 1}
                                                        className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                                                        title="아래로 이동"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>

                                                    {/* 삭제 버튼 */}
                                                    <button
                                                        onClick={() => handleRemoveTtsKey(item.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="삭제"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end pt-2">
                                    <button
                                        onClick={handleSaveApiKey}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium text-sm transition-colors"
                                    >
                                        저장하기
                                    </button>
                                </div>
                                <div className="pt-4 border-t border-gray-700">
                                    <p className="text-xs text-gray-500">
                                        * 무료 쿼터 제한(429 Error)이 발생할 경우, 개인 API 키를 사용하면 해결될 수 있습니다.<br />
                                        * API 키는 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a>에서 발급받을 수 있습니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
