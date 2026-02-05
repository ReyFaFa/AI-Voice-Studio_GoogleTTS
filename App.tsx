
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ScriptLine, SrtLine, Preset } from './types';
import { VOICES, LANGUAGES, XCircleIcon, SettingsIcon, MicrophoneIcon, DocumentTextIcon } from './constants';
import { generateSingleSpeakerAudio, generateAudioWithLiveAPIMultiTurn, generateSrtFromParagraphTimings, uint8ArrayToBase64, previewVoice, transcribeAudioWithSrt, setApiKey } from './services/geminiService';
import { MainContent } from './components/MainContent';
import { SubtitleGenerator } from './components/SubtitleGenerator';
import {
    createWavBlobFromBase64Pcm,
    encodeAudioBufferToWavBlob,
    sliceAudioBuffer,
    analyzeScript,
    msToSrtTime,
    stringifySrt,
    audioBufferToWavBase64,
    parseSrt,
    adjustSrtGaps,
    srtTimeToMs,
    spliceAudio,
    detectSilence,
    splitTextIntoChunks
} from './components/Header';

// Defines the structure for each generated audio clip in the history
export interface AudioHistoryItem {
    id: string;
    src: string;
    scriptChunk: string;
    audioBuffer: AudioBuffer;
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

export function App() {
    const [activeTab, setActiveTab] = useState<'tts' | 'subtitles'>('tts');

    const [singleSpeakerVoice, setSingleSpeakerVoice] = useState<string>('');
    const [speechSpeed, setSpeechSpeed] = useState<number>(0.8);
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

    // API Key Settings State - Initialize from LocalStorage
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [userApiKey, setUserApiKey] = useState(() => {
        return localStorage.getItem('gemini_api_key') || '';
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

                const result = await generateAudioWithLiveAPIMultiTurn(
                    lines,
                    singleSpeakerVoice,
                    stylePrompt,
                    speechSpeed, // Pass the speed correctly
                    500, // 500ms silence between lines
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
                const textChunks = splitTextIntoChunks(fullText, 3000, 60);
                const totalChunks = textChunks.length;

                let mergedAudioBuffer: AudioBuffer | null = null;
                const allParsedSrt: SrtLine[] = [];
                let currentTimeOffsetMs = 0;

                for (let i = 0; i < totalChunks; i++) {
                    const chunkText = textChunks[i];

                    try {
                        // Add a small delay between requests to avoid 429 Too Many Requests
                        if (i > 0) {
                            await sleep(5000);
                        }

                        console.log(`[Chunk Loop] Starting chunk ${i + 1}/${totalChunks}...`);
                        setLoadingStatus(`오디오 생성 중 (${i + 1}/${totalChunks})...`);

                        // Step 2: Generate Audio for this chunk
                        const base64Pcm = await generateSingleSpeakerAudio(
                            chunkText,
                            singleSpeakerVoice,
                            selectedModel,
                            speechSpeed,
                            stylePrompt,
                            abortControllerRef.current.signal
                        );

                        setLoadingStatus(`오디오 처리 중 (${i + 1}/${totalChunks})...`);
                        const chunkBlob = createWavBlobFromBase64Pcm(base64Pcm);
                        const chunkBuffer = await audioContext.decodeAudioData(await chunkBlob.arrayBuffer());

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

                        currentTimeOffsetMs += (chunkBuffer.duration * 1000);
                        console.log(`[Chunk Loop] Successfully finished chunk ${i + 1}/${totalChunks}.`);

                    } catch (chunkError) {
                        console.error(`[Chunk Loop] Error in chunk ${i + 1}:`, chunkError);
                        if (i === 0) throw chunkError;
                        setError(`${i + 1}번째 구간에서 오류가 발생했습니다. 현재까지 생성된 부분(${i}개 구간)만 가져옵니다.`);
                        break;
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
            const wavBase64 = await audioBufferToWavBase64(targetItem.audioBuffer);
            const srt = await transcribeAudioWithSrt(wavBase64, srtSplitCharCount, abortControllerRef.current.signal, targetItem.scriptChunk);
            const parsedSrt = parseSrt(srt);
            const adjustedSrt = adjustSrtGaps(parsedSrt);

            setTtsResult(prev => ({
                ...prev,
                audioHistory: prev.audioHistory.map(item =>
                    item.id === idToUse ? { ...item, srtLines: adjustedSrt, originalSrtLines: JSON.parse(JSON.stringify(adjustedSrt)) } : item
                ),
                srtContent: stringifySrt(adjustedSrt)
            }));

            setEditableSrtLines(adjustedSrt);
            setOriginalSrtLines(JSON.parse(JSON.stringify(adjustedSrt)));
            setHasTimestampEdits(false);
            setActiveAudioId(idToUse); // Ensure the edited audio becomes the active context

        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError') {
                setError(e.message);
            }
        } finally {
            setIsLoading(false);
            setLoadingStatus('');
            abortControllerRef.current = null;
        }
    };

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
                    />
                ) : (
                    <SubtitleGenerator />
                )}

                {/* API Key Modal */}
                {isApiKeyModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-700 overflow-hidden">
                            <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-900/50">
                                <h3 className="text-lg font-bold text-white">API 키 설정</h3>
                                <button onClick={() => setIsApiKeyModalOpen(false)} className="text-gray-400 hover:text-white">
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-gray-300">
                                    Gemini API 키를 입력하세요. 입력한 키는 브라우저에만 저장되며 서버로 전송되지 않습니다.
                                </p>
                                <div>
                                    <label htmlFor="api-key-input" className="block text-sm font-medium text-gray-400 mb-1">API Key</label>
                                    <input
                                        id="api-key-input"
                                        type="password"
                                        value={userApiKey}
                                        onChange={(e) => setUserApiKey(e.target.value)}
                                        placeholder="AIza..."
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
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
