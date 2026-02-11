
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioHistoryItem, AutoFormatOptions, MAX_CHAR_LIMIT } from '../App';
import {
    ArrowDownIcon,
    ArrowUpIcon,
    ChartBarIcon,
    ChevronLeftIcon, ChevronRightIcon,
    ClipboardIcon,
    DIALOGUE_STYLES,
    DownloadIcon,
    FloppyDiskIcon,
    LinkIcon,
    ListBulletIcon,
    MinusIcon,
    PencilIcon,
    PlayIcon,
    PlusIcon,
    RefreshIcon, ScissorsIcon,
    SparklesIcon,
    StarIcon,
    StopIcon,
    StyleIcon,
    TrashIcon,
    WrapTextIcon,
    XCircleIcon
} from '../constants';
import { Preset, ScriptLine, SrtLine, Voice } from '../types';
import { AudioPlayer, AudioPlayerHandle } from './AudioPlayer';
import { encodeAudioBufferToWavBlob, msToSrtTime, parseSrt, srtTimeToMs } from './Header';
import { ScriptAnalysis } from './ScriptAnalysis';
import { SilenceRemover } from './SilenceRemover';

export interface MainContentProps {
    // Voice & Settings Props
    singleSpeakerVoice: string;
    setSingleSpeakerVoice: (voice: string) => void;
    speechSpeed: number;
    setSpeechSpeed: (speed: number) => void;
    toneLevel: number;
    setToneLevel: (level: number) => void;
    voices: Voice[];
    onPreviewVoice: (voiceId: string) => void;
    isPreviewLoading: Record<string, boolean>;
    srtSplitCharCount: number;
    setSrtSplitCharCount: (count: number) => void;

    // New Props for Advanced TTS
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    stylePrompt: string;
    setStylePrompt: (prompt: string) => void;
    favorites: string[];
    toggleFavorite: (voiceId: string) => void;

    presets: Preset[];
    onSavePreset: (name: string) => void;
    onDeletePreset: (id: string) => void;
    onLoadPreset: (id: string) => void;
    onExportPreset: () => void;
    onImportPreset: (file: File) => void;

    // Main Props
    isLoading: boolean;
    loadingStatus: string;
    error: string | null;
    audioHistory: AudioHistoryItem[];
    srtContent: string | null;
    activeSrtLineId: string | null;
    setActiveSrtLineId: (id: string | null) => void;
    onGenerateAudio: () => void;
    onStopGeneration: () => void;
    onClearAudioHistory: () => void;
    onTrimAudio: (id: string) => void;
    onActiveAudioChange: (id: string) => void;
    scriptLines: ScriptLine[];
    onScriptChange: (newFullScript: string) => void;
    onUpdateScriptLine: (id: string, newValues: Partial<Omit<ScriptLine, 'id'>>) => void;
    onRemoveScriptLine: (id: string) => void;
    onAddScriptLine: () => void;
    onRemoveEmptyScriptLines: () => void;
    onAutoFormatScript: (options: AutoFormatOptions) => void;
    onMergeScriptLine: (index: number, direction: 'up' | 'down') => void;
    onSplitScriptLine: (index: number, cursorPosition: number) => void;
    onRegenerateSrt: (id?: string) => void;
    onDetectSilence: (id?: string) => void;
    silentSegments: { start: number; end: number }[];
    onRemoveSilenceSegments: (segments: { start: number; end: number }[]) => void;
    scriptAnalysis: any;
    totalEstimatedTime: number;
    editableSrtLines: SrtLine[];
    originalSrtLines: SrtLine[];
    onUpdateSrtLine: (id: string, newValues: Partial<Omit<SrtLine, 'id' | 'index'>>) => void;
    onRemoveSrtLine: (id: string) => void;
    onSplitSrtLine: (index: number, cursorPosition: number) => void;
    onResetSrt: () => void;
    onBulkTimeShift: (shiftMs: number) => void;
    onReconstructAudio: () => void;
    hasTimestampEdits: boolean;
    isTimestampSyncEnabled: boolean;
    setIsTimestampSyncEnabled: (enabled: boolean) => void;
    isAnalysisPanelOpen: boolean;
    setIsAnalysisPanelOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
    onDownloadChunksAsZip: (targetId?: string) => void;
    // Sample Preview Props
    sampleAudio: { src: string; text: string } | null;
    sampleLoading: boolean;
    onGenerateSample: () => void;
    onApproveSample: () => void;
    onRejectSample: () => void;
    onRegenerateChunk: (audioItemId: string, chunkIndex: number) => void;
    // CapCut Sync Props (NEW)
    onCopyScriptToSrt: (srtLines: SrtLine[]) => void;
    onUpdateSrtFromCapCut: (srtLines: SrtLine[]) => void;
}

interface ScriptEditorProps {
    scriptLines: ScriptLine[];
    onScriptChange: (newFullScript: string) => void;
    onUpdateScriptLine: (id: string, newValues: Partial<Omit<ScriptLine, 'id'>>) => void;
    onRemoveScriptLine: (id: string) => void;
    onAddScriptLine: () => void;
    onRemoveEmptyScriptLines: () => void;
    onAutoFormatScript: (options: AutoFormatOptions) => void;
    onMergeScriptLine: (index: number, direction: 'up' | 'down') => void;
    onSplitScriptLine: (index: number, cursorPosition: number) => void;
    scriptAnalysis: any;
    totalEstimatedTime: number;
    isLoading: boolean;
    loadingStatus: string;
    error: string | null;
    onCopyToCapCutSync: () => void;
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({
    scriptLines, onScriptChange, onUpdateScriptLine, onRemoveScriptLine, onAddScriptLine,
    onRemoveEmptyScriptLines, onAutoFormatScript, onMergeScriptLine, onSplitScriptLine,
    scriptAnalysis, totalEstimatedTime, isLoading, loadingStatus, error, onCopyToCapCutSync
}) => {
    const [isAutoFormatOpen, setIsAutoFormatOpen] = useState(false);
    const [autoFormatOptions, setAutoFormatOptions] = useState<AutoFormatOptions>({
        period: true,
        question: true,
        exclamation: true,
        comma: false
    });

    const fullScript = scriptLines.map(l => l.text).join('\n');

    const handleAutoFormatApply = () => {
        onAutoFormatScript(autoFormatOptions);
        setIsAutoFormatOpen(false);
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg flex flex-col h-full border border-gray-700 overflow-hidden">
            {/* Header Status Bar (Moved from bottom for better visibility) */}
            <div className="flex-shrink-0 flex items-center justify-between p-3 bg-indigo-500/10 border-b border-indigo-500/20 text-xs">
                <p className="text-gray-400">
                    글자 수: <span className={`font-medium ${scriptAnalysis.charCount > MAX_CHAR_LIMIT ? 'text-red-500' : 'text-indigo-400'}`}>{scriptAnalysis.charCount.toLocaleString()}</span> / {MAX_CHAR_LIMIT.toLocaleString()}
                    <span className="mx-2 text-gray-700">|</span>
                    예상 시간: <span className="font-medium text-indigo-300">{(totalEstimatedTime / 60).toFixed(0)}분 {Math.round(totalEstimatedTime % 60)}초</span>
                </p>
                <div className="flex items-center gap-3">
                    {isLoading && loadingStatus && (
                        <div className="flex items-center gap-2 bg-indigo-500/10 px-2 py-1 rounded-full border border-indigo-500/30">
                            <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[11px] text-indigo-300 font-semibold animate-pulse">{loadingStatus}</p>
                        </div>
                    )}
                    {error && <span className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded border border-red-900/50 truncate max-w-[200px]" title={error}>{error}</span>}
                </div>
            </div>

            <div className="p-3 border-b border-gray-700 bg-gray-900/30 flex-shrink-0">
                <textarea
                    value={fullScript}
                    onChange={(e) => onScriptChange(e.target.value)}
                    placeholder="여기에 스크립트를 입력하세요. (엔터로 줄바꿈 시 분할됩니다)"
                    className="w-full h-24 bg-gray-900 border border-gray-600 rounded-md p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y text-sm leading-relaxed custom-scrollbar"
                />
            </div>
            <div className="p-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2 text-sm">
                        <PencilIcon className="w-4 h-4" /> 상세 편집
                    </h3>
                </div>
                <div className="flex items-center gap-2 relative">
                    <button
                        onClick={onCopyToCapCutSync}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors flex items-center gap-1.5"
                        title="좌측 스크립트를 우측 자막 영역으로 복사하여 CapCut 타임코드 연동 준비"
                    >
                        <LinkIcon className="w-3.5 h-3.5" />
                        캡컷 타임코드 연동
                    </button>
                    <button
                        onClick={() => setIsAutoFormatOpen(!isAutoFormatOpen)}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors flex items-center gap-1.5"
                        title="자동 줄바꿈 설정"
                    >
                        <WrapTextIcon className="w-3.5 h-3.5" />
                        자동 줄바꿈 설정
                    </button>
                    {isAutoFormatOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 p-3">
                            <h4 className="text-sm font-semibold text-gray-300 mb-2">자동 줄바꿈 기준</h4>
                            <div className="space-y-2">
                                <label className="flex items-center space-x-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
                                    <input type="checkbox" checked={autoFormatOptions.period} onChange={e => setAutoFormatOptions(prev => ({ ...prev, period: e.target.checked }))} className="rounded bg-gray-700 border-gray-600 text-indigo-500" />
                                    <span>마침표 (.)</span>
                                </label>
                                <label className="flex items-center space-x-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
                                    <input type="checkbox" checked={autoFormatOptions.question} onChange={e => setAutoFormatOptions(prev => ({ ...prev, question: e.target.checked }))} className="rounded bg-gray-700 border-gray-600 text-indigo-500" />
                                    <span>물음표 (?)</span>
                                </label>
                                <label className="flex items-center space-x-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
                                    <input type="checkbox" checked={autoFormatOptions.exclamation} onChange={e => setAutoFormatOptions(prev => ({ ...prev, exclamation: e.target.checked }))} className="rounded bg-gray-700 border-gray-600 text-indigo-500" />
                                    <span>느낌표 (!)</span>
                                </label>
                                <label className="flex items-center space-x-2 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
                                    <input type="checkbox" checked={autoFormatOptions.comma} onChange={e => setAutoFormatOptions(prev => ({ ...prev, comma: e.target.checked }))} className="rounded bg-gray-700 border-gray-600 text-indigo-500" />
                                    <span>쉼표 (,)</span>
                                </label>
                            </div>
                            <button onClick={handleAutoFormatApply} className="mt-3 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded">적용하기</button>
                        </div>
                    )}
                    <button
                        onClick={onRemoveEmptyScriptLines}
                        className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                        title="빈 줄 제거"
                    >
                        <MinusIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onAddScriptLine}
                        className="p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                        title="줄 추가"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {scriptLines.map((line, index) => (
                    <div key={line.id} className="group flex items-start gap-2 bg-gray-900/30 hover:bg-gray-900/50 p-2 rounded-md transition-colors border border-transparent hover:border-gray-700/50">
                        <div className="flex flex-col gap-1 mt-1">
                            <span className="text-xs text-gray-500 w-6 text-center">{index + 1}</span>
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onMergeScriptLine(index, 'up')} disabled={index === 0} className="p-0.5 text-gray-500 hover:text-indigo-400 disabled:opacity-0" title="윗줄과 합치기">
                                    <ArrowUpIcon className="w-3 h-3" />
                                </button>
                                <button onClick={() => onMergeScriptLine(index, 'down')} disabled={index === scriptLines.length - 1} className="p-0.5 text-gray-500 hover:text-indigo-400 disabled:opacity-0" title="아랫줄과 합치기">
                                    <ArrowDownIcon className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="relative group/style">
                                    <select
                                        value={line.style || ''}
                                        onChange={(e) => onUpdateScriptLine(line.id, { style: e.target.value })}
                                        className="appearance-none bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded px-2 py-0.5 pr-6 focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-gray-700"
                                    >
                                        {DIALOGUE_STYLES.map(style => (
                                            <option key={style.value} value={style.value}>{style.label}</option>
                                        ))}
                                    </select>
                                    <StyleIcon className="w-3 h-3 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                                <span className="text-xs text-gray-500">{(line.estimatedTime || 0).toFixed(1)}초</span>
                            </div>
                            <textarea
                                ref={(el) => {
                                    if (el) {
                                        el.style.height = 'auto';
                                        el.style.height = el.scrollHeight + 'px';
                                    }
                                }}
                                value={line.text}
                                onChange={(e) => {
                                    onUpdateScriptLine(line.id, { text: e.target.value });
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        onSplitScriptLine(index, e.currentTarget.selectionStart);
                                    } else if (e.key === 'Backspace' && line.text === '' && scriptLines.length > 1) {
                                        e.preventDefault();
                                        onRemoveScriptLine(line.id);
                                    }
                                }}
                                placeholder="내용을 입력하세요..."
                                className="w-full bg-transparent text-gray-200 text-sm focus:outline-none resize-none leading-relaxed overflow-hidden"
                                rows={1}
                            />
                        </div>
                        <button
                            onClick={() => onRemoveScriptLine(line.id)}
                            className="p-1 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

        </div >
    );
};

export const MainContent: React.FC<MainContentProps> = ({
    singleSpeakerVoice, setSingleSpeakerVoice, speechSpeed, setSpeechSpeed, toneLevel, setToneLevel, voices, onPreviewVoice, isPreviewLoading,
    srtSplitCharCount, setSrtSplitCharCount,
    // New Props
    selectedModel, setSelectedModel, stylePrompt, setStylePrompt, favorites, toggleFavorite,

    presets, onSavePreset, onDeletePreset, onLoadPreset, onExportPreset, onImportPreset,

    isLoading,
    loadingStatus,
    error,
    audioHistory,
    srtContent,
    activeSrtLineId,
    setActiveSrtLineId,
    onGenerateAudio,
    onStopGeneration,
    onClearAudioHistory,
    onTrimAudio,
    onActiveAudioChange,
    scriptLines,
    onScriptChange,
    onUpdateScriptLine,
    onRemoveScriptLine,
    onAddScriptLine,
    onRemoveEmptyScriptLines,
    onAutoFormatScript,
    onMergeScriptLine,
    onSplitScriptLine,
    onRegenerateSrt,
    onDetectSilence,
    silentSegments,
    onRemoveSilenceSegments,
    scriptAnalysis,
    totalEstimatedTime,
    editableSrtLines,
    originalSrtLines,
    onUpdateSrtLine,
    onRemoveSrtLine,
    onSplitSrtLine,
    onResetSrt,
    onBulkTimeShift,
    onReconstructAudio,
    hasTimestampEdits,
    isTimestampSyncEnabled,
    setIsTimestampSyncEnabled,
    isAnalysisPanelOpen,
    setIsAnalysisPanelOpen,
    onDownloadChunksAsZip,
    sampleAudio,
    sampleLoading,
    onGenerateSample,
    onApproveSample,
    onRejectSample,
    onRegenerateChunk,
    onCopyScriptToSrt,
    onUpdateSrtFromCapCut,
}) => {
    const [srtMode, setSrtMode] = useState<'chapter' | 'edit'>('chapter');
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
    const [isAutoplayOnClickEnabled, setIsAutoplayOnClickEnabled] = useState(false);
    const [isPresetSaveOpen, setIsPresetSaveOpen] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [selectedPresetId, setSelectedPresetId] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const capCutFileInputRef = useRef<HTMLInputElement>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);

    const srtTableBodyRef = useRef<HTMLTableSectionElement>(null);
    const activeRowRef = useRef<HTMLTableRowElement>(null);
    const audioPlayerRef = useRef<AudioPlayerHandle>(null);

    // Local state for split count to avoid re-renders on every keystroke
    const [localSplitCount, setLocalSplitCount] = useState<string>(srtSplitCharCount.toString());

    useEffect(() => {
        setLocalSplitCount(srtSplitCharCount.toString());
    }, [srtSplitCharCount]);

    const [expandedChunks, setExpandedChunks] = useState(false);
    const [playingChunkId, setPlayingChunkId] = useState<string | null>(null);
    const chunkAudioRef = useRef<HTMLAudioElement | null>(null);

    const handlePlayChunk = useCallback((chunk: any) => {
        if (playingChunkId === chunk.id) {
            chunkAudioRef.current?.pause();
            setPlayingChunkId(null);
            return;
        }
        const wavBlob = encodeAudioBufferToWavBlob(chunk.buffer);
        const url = URL.createObjectURL(wavBlob);
        if (chunkAudioRef.current) {
            chunkAudioRef.current.pause();
        }
        const audio = new Audio(url);
        audio.onended = () => {
            setPlayingChunkId(null);
            URL.revokeObjectURL(url);
        };
        audio.play();
        chunkAudioRef.current = audio;
        setPlayingChunkId(chunk.id);
    }, [playingChunkId]);

    // Reset page to 1 (latest) when new audio is generated.
    // Use the ID of the first item to detect new insertions at the top.
    useEffect(() => {
        if (audioHistory.length > 0) {
            setCurrentPage(1);
        }
    }, [audioHistory[0]?.id]);

    // Calculate current audio item and sync active audio state
    const currentAudioItem = audioHistory.length > 0 ? audioHistory[currentPage - 1] : null;
    const totalPages = audioHistory.length;

    useEffect(() => {
        if (currentAudioItem) {
            onActiveAudioChange(currentAudioItem.id);
        }
    }, [currentAudioItem?.id]); // Only trigger when ID changes

    const sortedVoices = useMemo(() => {
        return [...voices].sort((a, b) => {
            const aFav = favorites.includes(a.id);
            const bFav = favorites.includes(b.id);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });
    }, [voices, favorites]);

    const handleSplitCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalSplitCount(e.target.value);
    };

    const handleSplitCountBlur = () => {
        let val = parseInt(localSplitCount, 10);
        if (isNaN(val) || val < 10) {
            val = 10;
        }
        setSrtSplitCharCount(val);
        setLocalSplitCount(val.toString());
    };

    const handleSplitCountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const handleSpeedChange = (newSpeed: number) => {
        setSpeechSpeed(Math.max(0.5, Math.min(2.0, Number(newSpeed.toFixed(1)))));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportPreset(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    const handleSavePresetClick = () => {
        if (presetName.trim()) {
            onSavePreset(presetName.trim());
            setPresetName('');
            setIsPresetSaveOpen(false);
        }
    };

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

    const handleCapCutSrtUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 파일 확장자 체크
        if (!file.name.endsWith('.srt')) {
            alert('❌ SRT 파일만 업로드 가능합니다.');
            return;
        }

        // 텍스트 정규화 함수 (공백, 구두점 제거, 소문자화)
        const normalizeText = (text: string) => {
            return text
                .replace(/\s+/g, '')        // 공백 제거
                .replace(/[.,!?;:'"]/g, '') // 구두점 제거
                .toLowerCase();              // 소문자 변환
        };

        try {
            // 1. 파일 읽기
            const text = await file.text();

            // 2. SRT 파싱 (parseSrt 함수 사용 - 이미 존재)
            const capCutSrt = parseSrt(text);

            if (capCutSrt.length === 0) {
                alert('❌ SRT 파일이 비어있거나 형식이 잘못되었습니다.');
                return;
            }

            // CapCut SRT를 Map으로 변환 (O(1) 검색 성능)
            const capCutMap = new Map<string, SrtLine>();
            capCutSrt.forEach(line => {
                const normalized = normalizeText(line.text);
                capCutMap.set(normalized, line);
            });

            // 3. 현재 우측 자막과 매칭
            const currentSrt = editableSrtLines;

            if (currentSrt.length === 0) {
                alert('❌ 먼저 "캡컷 타임코드 연동" 버튼을 클릭하여 스크립트를 복사해주세요.');
                return;
            }

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

            // 5. 부모 컴포넌트에 업데이트 전달
            onUpdateSrtFromCapCut(matchedSrt);

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

        } catch (error) {
            console.error('[CapCut Sync] 업로드 실패:', error);
            alert('❌ SRT 파일 처리 중 오류가 발생했습니다.');
        } finally {
            // 파일 입력 초기화 (같은 파일 재업로드 가능하도록)
            e.target.value = '';
        }
    }, [editableSrtLines, onUpdateSrtFromCapCut]);

    // Spacebar Key Listener for Play/Pause
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                const target = e.target as HTMLElement;
                const tagName = target.tagName;
                const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;

                // Only toggle play if focus is NOT on an input/textarea
                if (!isInput) {
                    e.preventDefault(); // Prevent scrolling
                    audioPlayerRef.current?.togglePlay();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (isAutoScrollEnabled && activeRowRef.current && srtTableBodyRef.current) {
            const container = srtTableBodyRef.current.parentElement;
            if (container) {
                const rowTop = activeRowRef.current.offsetTop;
                const rowHeight = activeRowRef.current.offsetHeight;
                const containerTop = container.scrollTop;
                const containerHeight = container.clientHeight;

                if (rowTop < containerTop || rowTop + rowHeight > containerTop + containerHeight) {
                    container.scrollTo({ top: rowTop - containerHeight / 2 + rowHeight / 2, behavior: 'smooth' });
                }
            }
        }
    }, [activeSrtLineId, isAutoScrollEnabled]);

    const handleSrtLineClick = (line: SrtLine) => {
        const startTimeSec = srtTimeToMs(line.startTime) / 1000;
        audioPlayerRef.current?.seekTo(startTimeSec);

        // Manually set active line on click so it highlights even if auto-scroll (tracking) is off
        setActiveSrtLineId(line.id);

        if (srtMode === 'chapter' && isAutoplayOnClickEnabled) {
            audioPlayerRef.current?.play();
        } else {
            // Stop playback if auto-play is disabled
            audioPlayerRef.current?.pause();
        }
    };

    // Only allow AudioPlayer to update the active line if auto-scroll (tracking) is enabled
    const handlePlayerActiveLineUpdate = useCallback((id: string | null) => {
        if (isAutoScrollEnabled) {
            setActiveSrtLineId(id);
        }
    }, [isAutoScrollEnabled, setActiveSrtLineId]);

    const handleCopySrt = () => {
        if (srtContent) {
            navigator.clipboard.writeText(srtContent).catch(err => console.error('Failed to copy SRT: ', err));
        }
    };

    const handleDownloadSrt = () => {
        if (srtContent) {
            const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `subtitles-${new Date().getTime()}.srt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    const handleTimeShiftApply = (shiftMs: number) => {
        onBulkTimeShift(shiftMs);
    };

    const handleTimeDragStart = (e: React.MouseEvent<HTMLInputElement>, lineId: string, field: 'startTime' | 'endTime') => {
        e.preventDefault();
        const initialX = e.clientX;
        const initialTimeMs = srtTimeToMs(e.currentTarget.value);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - initialX;
            const sensitivity = 10; // 1px = 10ms
            const deltaTimeMs = Math.round(deltaX * sensitivity / 10) * 10;
            const newTimeMs = Math.max(0, initialTimeMs + deltaTimeMs);
            const newTimeStr = msToSrtTime(newTimeMs);
            onUpdateSrtLine(lineId, { [field]: newTimeStr });
        };

        const handleMouseUp = () => {
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        document.body.style.cursor = 'ew-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleIndividualTimeShift = (lineId: string, shiftMs: number) => {
        const line = editableSrtLines.find(l => l.id === lineId);
        if (!line) return;

        let startMs = srtTimeToMs(line.startTime) + shiftMs;
        let endMs = srtTimeToMs(line.endTime) + shiftMs;

        startMs = Math.max(0, startMs);
        endMs = Math.max(0, endMs);

        if (endMs < startMs) {
            endMs = startMs;
        }

        onUpdateSrtLine(lineId, {
            startTime: msToSrtTime(startMs),
            endTime: msToSrtTime(endMs),
        });
    };

    // Calculate height for responsiveness (viewport height - header/padding approx)
    // Adjust this value if header size changes
    const contentHeightStyle = { height: 'calc(100vh - 220px)' };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" style={contentHeightStyle}>
            <div className={`h-full transition-all duration-300 ${isAnalysisPanelOpen ? 'lg:col-span-9' : 'lg:col-span-12'}`}>
                {/* 2-Column Layout for Input and Results */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full">
                    {/* LEFT COLUMN: Voice Settings + Script Editor */}
                    <div className="flex flex-col gap-4 h-full min-h-0">
                        {/* Voice Selection & Controls Block */}
                        <div className="bg-gray-800 p-4 rounded-lg shadow border border-gray-700 flex flex-col gap-4 shrink-0">

                            {/* 0. Preset Bar */}
                            <div className="flex items-center justify-between border-b border-gray-700 pb-3 mb-1">
                                <div className="flex items-center gap-2 flex-grow max-w-sm">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">프리셋:</label>
                                    <select
                                        className="bg-gray-700 text-xs text-white border border-gray-600 rounded py-1 px-2 flex-grow focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        value={selectedPresetId}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSelectedPresetId(val);
                                            if (val) onLoadPreset(val);
                                        }}
                                    >
                                        <option value="" disabled>설정 불러오기...</option>
                                        {presets.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>

                                    {/* Delete Preset Button */}
                                    <button
                                        onClick={() => {
                                            if (confirm('정말 이 프리셋을 삭제하시겠습니까?')) {
                                                onDeletePreset(selectedPresetId);
                                                setSelectedPresetId('');
                                            }
                                        }}
                                        disabled={!selectedPresetId}
                                        className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                                        title="선택된 프리셋 삭제"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Right Side Actions: Save/Load File & Save Preset */}
                                <div className="flex items-center gap-2 relative">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept=".json"
                                        className="hidden"
                                    />

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-1 text-gray-400 hover:text-indigo-400 transition-colors"
                                        title="설정 파일 불러오기 (Import)"
                                    >
                                        <ArrowUpIcon className="w-4 h-4" />
                                    </button>

                                    <button
                                        onClick={onExportPreset}
                                        className="p-1 text-gray-400 hover:text-indigo-400 transition-colors"
                                        title="현재 설정 파일로 저장 (Export)"
                                    >
                                        <DownloadIcon className="w-4 h-4" />
                                    </button>

                                    <div className="w-px h-4 bg-gray-600 mx-1"></div>

                                    {isPresetSaveOpen ? (
                                        <div className="flex items-center gap-2 absolute right-0 bg-gray-800 border border-gray-600 p-1 rounded shadow-xl z-20">
                                            <input
                                                type="text"
                                                value={presetName}
                                                onChange={(e) => setPresetName(e.target.value)}
                                                placeholder="프리셋 이름"
                                                className="bg-gray-700 text-xs text-white border border-gray-600 rounded px-2 py-1 w-32 focus:outline-none"
                                                autoFocus
                                                onKeyDown={(e) => e.key === 'Enter' && handleSavePresetClick()}
                                            />
                                            <button onClick={handleSavePresetClick} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">저장</button>
                                            <button onClick={() => setIsPresetSaveOpen(false)} className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-500">취소</button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setIsPresetSaveOpen(true)}
                                            className="flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded border border-gray-600 transition-colors"
                                            title="현재 설정(모델, 음성, 스타일) 브라우저에 저장"
                                        >
                                            <FloppyDiskIcon className="w-3.5 h-3.5" />
                                            <span>저장</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* 1. Model Selection (Flash vs Pro vs Native) */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">모델 선택</label>
                                <div className="flex flex-wrap gap-2">
                                    <label className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${selectedModel === 'gemini-2.5-flash-preview-tts' ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200' : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                                        <input
                                            type="radio"
                                            name="model"
                                            value="gemini-2.5-flash-preview-tts"
                                            checked={selectedModel === 'gemini-2.5-flash-preview-tts'}
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            className="hidden"
                                        />
                                        <span className="text-sm font-medium">Flash TTS</span>
                                        <span className="text-[10px] bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded border border-green-700">빠름</span>
                                    </label>
                                    <label className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${selectedModel === 'gemini-2.5-pro-preview-tts' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700'}`}>
                                        <input
                                            type="radio"
                                            name="model"
                                            value="gemini-2.5-pro-preview-tts"
                                            checked={selectedModel === 'gemini-2.5-pro-preview-tts'}
                                            onChange={(e) => setSelectedModel(e.target.value)}
                                            className="hidden"
                                        />
                                        <span className="text-sm font-medium">Pro TTS</span>
                                        <span className="text-[10px] bg-yellow-900/50 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-700">고품질</span>
                                    </label>
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
                                </div>
                            </div>

                            {/* 2. Voice & Speed Selection */}
                            <div className="flex flex-col gap-3 pt-2 border-t border-gray-700">
                                <div className="flex justify-between items-center gap-2">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">음성 선택</label>
                                    <div className="flex items-center gap-2">
                                        {/* Tone Control */}
                                        <div className="flex items-center gap-1 bg-gray-700/30 px-2 py-1 rounded-full border border-gray-600/50">
                                            <span className="text-xs text-gray-400 font-medium">톤</span>
                                            <button
                                                onClick={() => setToneLevel(Math.max(1, toneLevel - 1))}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors text-xs font-bold"
                                                title="톤 낮추기"
                                            >
                                                ◀
                                            </button>
                                            <input
                                                type="range"
                                                min="1"
                                                max="5"
                                                step="1"
                                                value={toneLevel}
                                                onChange={(e) => setToneLevel(parseInt(e.target.value))}
                                                className="w-10 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400 transition-all"
                                            />
                                            <button
                                                onClick={() => setToneLevel(Math.min(5, toneLevel + 1))}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors text-xs font-bold"
                                                title="톤 높이기"
                                            >
                                                ▶
                                            </button>
                                            <span className="text-xs font-mono font-bold text-purple-400 w-4 text-right">{toneLevel}</span>
                                        </div>
                                        {/* Speed Control */}
                                        <div className="flex items-center gap-1 bg-gray-700/30 px-2 py-1 rounded-full border border-gray-600/50">
                                            <span className="text-xs text-gray-400 font-medium">속도</span>
                                            <button
                                                onClick={() => handleSpeedChange(Math.max(0.5, speechSpeed - 0.1))}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors text-xs font-bold"
                                                title="속도 감소"
                                            >
                                                ◀
                                            </button>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="2.0"
                                                step="0.1"
                                                value={speechSpeed}
                                                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                                className="w-12 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                                            />
                                            <button
                                                onClick={() => handleSpeedChange(Math.min(2.0, speechSpeed + 0.1))}
                                                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors text-xs font-bold"
                                                title="속도 증가"
                                            >
                                                ▶
                                            </button>
                                            <span className="text-xs font-mono font-bold text-indigo-400 w-8 text-right">{speechSpeed.toFixed(1)}x</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <div className="relative flex-grow">
                                        <select
                                            value={singleSpeakerVoice}
                                            onChange={(e) => setSingleSpeakerVoice(e.target.value)}
                                            className={`w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-8 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm ${singleSpeakerVoice ? 'text-white' : 'text-gray-400'}`}
                                        >
                                            <option value="" disabled>음성을 선택하세요</option>
                                            {sortedVoices.map(voice => (
                                                <option key={voice.id} value={voice.id}>
                                                    {favorites.includes(voice.id) ? '★ ' : ''}{voice.name} ({voice.gender === 'male' ? '남' : '여'}) - {voice.description}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        onClick={() => singleSpeakerVoice && toggleFavorite(singleSpeakerVoice)}
                                        disabled={!singleSpeakerVoice}
                                        className={`p-2 rounded-md transition-colors flex-shrink-0 border ${favorites.includes(singleSpeakerVoice) ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20' : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200 hover:bg-gray-600'}`}
                                        title={favorites.includes(singleSpeakerVoice) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                                    >
                                        <StarIcon className={`w-5 h-5 ${favorites.includes(singleSpeakerVoice) ? 'fill-current' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => onPreviewVoice(singleSpeakerVoice)}
                                        disabled={!singleSpeakerVoice || isPreviewLoading[singleSpeakerVoice]}
                                        className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex-shrink-0"
                                        aria-label={`음성 미리듣기`}
                                    >
                                        {isPreviewLoading[singleSpeakerVoice] ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <PlayIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {/* 3. Director's Notes */}
                            <div className="flex flex-col gap-2 pt-2 border-t border-gray-700">
                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                                    스타일/감정 설정 (Director's Notes)
                                    <span className="text-[10px] font-normal text-gray-500 normal-case">예: 차분하고 신뢰감 있는 뉴스 앵커 톤으로</span>
                                </label>
                                <textarea
                                    value={stylePrompt}
                                    onChange={(e) => setStylePrompt(e.target.value)}
                                    placeholder="AI에게 목소리 톤, 감정, 분위기를 구체적으로 지시하세요."
                                    className="w-full h-16 bg-gray-900/50 border border-gray-600 rounded-md p-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                                />
                            </div>

                            {/* 4. Actions */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-700">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">자막 분할:</span>
                                    <input
                                        type="number"
                                        value={localSplitCount}
                                        min="10"
                                        max="100"
                                        onChange={handleSplitCountChange}
                                        onBlur={handleSplitCountBlur}
                                        onKeyDown={handleSplitCountKeyDown}
                                        className="w-14 text-center bg-gray-700 border border-gray-600 rounded-md py-1 px-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-xs text-white"
                                        title="자막 최대 글자 수"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsAnalysisPanelOpen(prev => !prev)}
                                        className="flex items-center gap-2 bg-gray-700 text-white text-xs font-semibold py-2 px-3 rounded-md hover:bg-gray-600 transition-colors"
                                    >
                                        <ChartBarIcon className="w-4 h-4" />
                                        <span>분석</span>
                                    </button>

                                    {isLoading ? (
                                        <button onClick={onStopGeneration} className="flex items-center justify-center gap-2 bg-red-600 text-white text-xs font-semibold py-2 px-3 rounded-md hover:bg-red-700 transition-colors">
                                            <StopIcon className="w-4 h-4" />
                                            <span>중지</span>
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={onGenerateSample}
                                                disabled={!singleSpeakerVoice || scriptLines.every(l => !l.text.trim()) || sampleLoading}
                                                className="flex items-center justify-center gap-2 bg-gray-700 text-white text-xs font-semibold py-2 px-3 rounded-md hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                                                title="처음 5줄 미리듣기"
                                            >
                                                <PlayIcon className="w-4 h-4" />
                                                <span>샘플</span>
                                            </button>
                                            <button
                                                onClick={onGenerateAudio}
                                                disabled={!singleSpeakerVoice || scriptLines.every(l => !l.text.trim())}
                                                className="flex items-center justify-center gap-2 bg-indigo-600 text-white text-xs font-bold py-2 px-3 rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <SparklesIcon className="w-4 h-4" />
                                                <span>생성</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Sample Preview Section */}
                            {(sampleLoading || sampleAudio) && (
                                <div className="mt-3 p-3 bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-semibold text-indigo-300">🎧 샘플 미리듣기</h4>
                                        {sampleAudio && (
                                            <button onClick={onRejectSample} className="text-gray-400 hover:text-white p-1">
                                                <XCircleIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>

                                    {sampleLoading ? (
                                        <div className="flex items-center gap-2 text-gray-300 text-sm">
                                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                            <span>샘플 생성 중...</span>
                                        </div>
                                    ) : sampleAudio && (
                                        <div className="space-y-2">
                                            <audio src={sampleAudio.src} controls className="w-full h-8" />
                                            <p className="text-xs text-gray-400 line-clamp-2">{sampleAudio.text}</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={onApproveSample}
                                                    className="flex-1 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                                                >
                                                    ✓ 이 목소리로 전체 생성
                                                </button>
                                                <button
                                                    onClick={onRejectSample}
                                                    className="flex-1 py-1.5 text-xs font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors"
                                                >
                                                    ✗ 다른 설정 시도
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Script Editor expands to fill space */}
                        <div className="flex-grow min-h-0">
                            <ScriptEditor
                                scriptLines={scriptLines}
                                onScriptChange={onScriptChange}
                                onUpdateScriptLine={onUpdateScriptLine}
                                onRemoveScriptLine={onRemoveScriptLine}
                                onAddScriptLine={onAddScriptLine}
                                onRemoveEmptyScriptLines={onRemoveEmptyScriptLines}
                                onAutoFormatScript={onAutoFormatScript}
                                onMergeScriptLine={onMergeScriptLine}
                                onSplitScriptLine={onSplitScriptLine}
                                scriptAnalysis={scriptAnalysis}
                                totalEstimatedTime={totalEstimatedTime}
                                isLoading={isLoading}
                                loadingStatus={loadingStatus}
                                error={error}
                                onCopyToCapCutSync={handleCopyToCapCutSync}
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Results Area */}
                    <div className="flex flex-col gap-6 min-w-0 h-full">
                        {/* Pagination Controls */}
                        {audioHistory.length > 1 && (
                            <div className="flex justify-center items-center gap-4 bg-gray-800 p-2 rounded-lg border border-gray-700">
                                <button
                                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded-md hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                                    title="이전 (1번 방향)"
                                >
                                    <ChevronLeftIcon className="w-5 h-5 text-gray-300" />
                                </button>
                                <span className="text-sm font-semibold text-gray-300">
                                    {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded-md hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                                    title="다음 (2,3...번 방향)"
                                >
                                    <ChevronRightIcon className="w-5 h-5 text-gray-300" />
                                </button>
                            </div>
                        )}

                        {/* Display Current Audio Item */}
                        {currentAudioItem && (
                            <div key={currentAudioItem.id} className="flex-shrink-0">
                                <AudioPlayer
                                    ref={audioPlayerRef}
                                    item={currentAudioItem}
                                    index={totalPages - currentPage} // Show 0-based index or reversed logical index
                                    isLoading={isLoading}
                                    onTrim={() => onTrimAudio(currentAudioItem.id)}
                                    onRegenerateSrt={() => onRegenerateSrt(currentAudioItem.id)}
                                    onDetectSilence={() => onDetectSilence(currentAudioItem.id)}
                                    srtLines={editableSrtLines}
                                    activeSrtLineId={activeSrtLineId}
                                    setActiveSrtLineId={handlePlayerActiveLineUpdate}
                                />
                                {silentSegments.length > 0 && <SilenceRemover segments={silentSegments} onRemove={onRemoveSilenceSegments} />}

                                {/* Chunk Management Section */}
                                {currentAudioItem?.audioChunks && currentAudioItem.audioChunks.length > 1 && (
                                    <div className="mt-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                                        <button
                                            onClick={() => setExpandedChunks(!expandedChunks)}
                                            className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700/30 rounded-lg transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                                청크 관리 ({currentAudioItem.audioChunks.length}개 구간)
                                            </span>
                                            <svg className={`w-4 h-4 transition-transform ${expandedChunks ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        {expandedChunks && (
                                            <div className="px-3 pb-3 space-y-2 max-h-60 overflow-y-auto">
                                                {currentAudioItem.audioChunks.map((chunk, idx) => (
                                                    <div key={chunk.id} className="flex items-center gap-2 p-2 bg-gray-900/50 rounded-md border border-gray-700/30 hover:border-gray-600/50 transition-colors">
                                                        <span className="text-xs font-mono text-gray-500 w-6 text-center flex-shrink-0">{idx + 1}</span>
                                                        <p className="text-xs text-gray-400 flex-grow truncate" title={chunk.text}>
                                                            {chunk.text.substring(0, 80)}{chunk.text.length > 80 ? '...' : ''}
                                                        </p>
                                                        <span className="text-xs text-gray-500 flex-shrink-0">
                                                            {Math.round(chunk.durationMs / 1000)}s
                                                        </span>
                                                        <button
                                                            onClick={() => handlePlayChunk(chunk)}
                                                            disabled={isLoading}
                                                            className="p-1 text-gray-400 hover:text-indigo-400 disabled:opacity-30 transition-colors flex-shrink-0"
                                                            title="이 구간 재생"
                                                        >
                                                            {playingChunkId === chunk.id ? (
                                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                                            ) : (
                                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => onRegenerateChunk(currentAudioItem.id, idx)}
                                                            disabled={isLoading}
                                                            className="p-1 text-gray-400 hover:text-amber-400 disabled:opacity-30 transition-colors flex-shrink-0"
                                                            title="이 구간 재생성"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {isLoading ? (
                            <div className="flex-grow bg-gray-800 rounded-lg shadow-inner flex flex-col items-center justify-center border border-gray-700/50">
                                <div className="relative w-24 h-24 mb-8">
                                    <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500/30 rounded-full"></div>
                                    <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                        <SparklesIcon className="w-10 h-10 text-indigo-400 animate-pulse" />
                                    </div>
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-3 animate-pulse">{loadingStatus}</h3>
                                <p className="text-gray-400 text-sm max-w-md text-center leading-relaxed mb-4">
                                    {loadingStatus.includes('자막') ? (
                                        <>AI가 오디오 파형을 분석하여 타임코드를 생성하고 있습니다.</>
                                    ) : loadingStatus.includes('오디오 생성') ? (
                                        <>TTS 모델이 오디오를 생성하고 있습니다. 청크별로 순차 처리됩니다.</>
                                    ) : (
                                        <>처리 중입니다. 잠시만 기다려주세요...</>
                                    )}
                                </p>
                                <div className="flex gap-2 mt-4">
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
                                </div>
                            </div>
                        ) : srtContent && (
                            <div className="flex-grow bg-gray-800 rounded-lg shadow-inner flex flex-col min-h-0">
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
                                <div className="flex-shrink-0 flex justify-between items-center p-3 border-b border-gray-700">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setSrtMode('chapter')} className={`px-4 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 ${srtMode === 'chapter' ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                            <ListBulletIcon className="w-5 h-5" /> 챕터
                                        </button>
                                        <button onClick={() => setSrtMode('edit')} className={`px-4 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 ${srtMode === 'edit' ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                            <PencilIcon className="w-5 h-5" /> 수정
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {srtMode === 'chapter' && (
                                            <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                                                <input type="checkbox" checked={isAutoplayOnClickEnabled} onChange={(e) => setIsAutoplayOnClickEnabled(e.target.checked)} className="mr-2 bg-gray-700 border-gray-600 rounded text-indigo-500 focus:ring-indigo-600" />
                                                클릭 시 자동 재생
                                            </label>
                                        )}
                                        <label className="flex items-center text-sm text-gray-300 cursor-pointer">
                                            <input type="checkbox" checked={isAutoScrollEnabled} onChange={(e) => setIsAutoScrollEnabled(e.target.checked)} className="mr-2 bg-gray-700 border-gray-600 rounded text-indigo-500 focus:ring-indigo-600" />
                                            자동 스크롤
                                        </label>
                                        <button onClick={handleCopySrt} title="SRT 복사" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><ClipboardIcon className="w-5 h-5" /></button>
                                        <button onClick={handleDownloadSrt} title="SRT 다운로드" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><DownloadIcon className="w-5 h-5" /></button>
                                        <button
                                            onClick={() => onDownloadChunksAsZip()}
                                            title="청크별 오디오 ZIP 다운로드"
                                            disabled={!currentAudioItem?.audioChunks?.length}
                                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                                        >
                                            <span className="text-xs font-bold">ZIP</span>
                                        </button>
                                    </div>
                                </div>

                                {srtMode === 'edit' && (
                                    <div className="flex-shrink-0 p-3 bg-gray-900/30 border-b border-gray-700 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm text-gray-300">타임코드 동기화:</p>
                                            <button onClick={() => setIsTimestampSyncEnabled(!isTimestampSyncEnabled)} className={`px-3 py-1 text-xs font-semibold rounded-full flex items-center gap-1.5 ${isTimestampSyncEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                                                <LinkIcon className="w-3 h-3" /> {isTimestampSyncEnabled ? '활성' : '비활성'}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleTimeShiftApply(-100)} className="px-2 py-1 text-xs bg-gray-700 rounded-md hover:bg-gray-600">-100ms</button>
                                            <button onClick={() => handleTimeShiftApply(100)} className="px-2 py-1 text-xs bg-gray-700 rounded-md hover:bg-gray-600">+100ms</button>
                                            <button onClick={onResetSrt} disabled={!hasTimestampEdits && JSON.stringify(editableSrtLines) === JSON.stringify(originalSrtLines)} className="text-sm flex items-center gap-1.5 text-yellow-400 hover:text-yellow-300 disabled:text-gray-500 disabled:cursor-not-allowed">
                                                <RefreshIcon className="w-4 h-4" /> 되돌리기
                                            </button>
                                            <button onClick={onReconstructAudio} disabled={hasTimestampEdits || JSON.stringify(editableSrtLines) === JSON.stringify(originalSrtLines)} className="text-sm flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 disabled:text-gray-500 disabled:cursor-not-allowed">
                                                <ScissorsIcon className="w-4 h-4" /> 오디오 재구성
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Flexible height container */}
                                <div className="flex-grow overflow-y-auto border-t border-gray-700 custom-scrollbar">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-700 text-xs text-gray-400 uppercase sticky top-0 z-10">
                                            <tr>
                                                <th className="py-2 px-4 w-12">#</th>
                                                {srtMode === 'edit' && <th className="py-2 px-2 w-28 text-center">시간 조정</th>}
                                                <th className="py-2 px-4 w-32">시작 <span className="font-mono text-gray-500">(hh:mm:ss,ms)</span></th>
                                                <th className="py-2 px-4 w-32">종료 <span className="font-mono text-gray-500">(hh:mm:ss,ms)</span></th>
                                                <th className="py-2 px-4">내용</th>
                                                {srtMode === 'edit' && <th className="py-2 px-4 w-12"></th>}
                                            </tr>
                                        </thead>
                                        <tbody ref={srtTableBodyRef}>
                                            {editableSrtLines.map((line, index) => (
                                                <tr
                                                    key={line.id}
                                                    ref={line.id === activeSrtLineId ? activeRowRef : null}
                                                    onClick={() => handleSrtLineClick(line)}
                                                    className={`border-b border-gray-700/60 transition-colors ${line.id === activeSrtLineId ? 'bg-indigo-900/40' : 'hover:bg-gray-700/40'} ${srtMode === 'chapter' ? 'cursor-pointer' : ''}`}
                                                >
                                                    <td className="px-4 py-2 text-gray-400 align-top">{index + 1}</td>
                                                    {srtMode === 'edit' && (
                                                        <td className="px-2 py-2 font-mono align-top text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={(e) => { e.stopPropagation(); handleIndividualTimeShift(line.id, -100); }} className="px-1.5 py-1 text-xs bg-gray-700 rounded-md hover:bg-gray-600" title="-100ms">-100ms</button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleIndividualTimeShift(line.id, 100); }} className="px-1.5 py-1 text-xs bg-gray-700 rounded-md hover:bg-gray-600" title="+100ms">+100ms</button>
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-2 font-mono align-top">
                                                        {srtMode === 'edit' ? (
                                                            <input
                                                                type="text"
                                                                value={line.startTime}
                                                                onChange={(e) => onUpdateSrtLine(line.id, { startTime: e.target.value })}
                                                                onMouseDown={(e) => handleTimeDragStart(e, line.id, 'startTime')}
                                                                className="w-full bg-gray-800 p-1 rounded-md border border-transparent focus:border-indigo-500 focus:bg-gray-900 outline-none cursor-ew-resize"
                                                            />
                                                        ) : (<div>{line.startTime}</div>)}
                                                    </td>
                                                    <td className="px-4 py-2 font-mono align-top">
                                                        {srtMode === 'edit' ? (
                                                            <input
                                                                type="text"
                                                                value={line.endTime}
                                                                onChange={(e) => onUpdateSrtLine(line.id, { endTime: e.target.value })}
                                                                onMouseDown={(e) => handleTimeDragStart(e, line.id, 'endTime')}
                                                                className="w-full bg-gray-800 p-1 rounded-md border border-transparent focus:border-indigo-500 focus:bg-gray-900 outline-none cursor-ew-resize"
                                                            />
                                                        ) : (<div>{line.endTime}</div>)}
                                                    </td>
                                                    <td className="px-4 py-2 align-top leading-relaxed">
                                                        {srtMode === 'edit' ? (
                                                            <textarea
                                                                value={line.text}
                                                                onChange={(e) => onUpdateSrtLine(line.id, { text: e.target.value })}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        onSplitSrtLine(index, e.currentTarget.selectionStart);
                                                                    }
                                                                }}
                                                                className="w-full bg-gray-800 p-1 rounded-md border border-transparent focus:border-indigo-500 focus:bg-gray-900 outline-none resize-none"
                                                                rows={line.text.split('\n').length || 1}
                                                            />
                                                        ) : (<div className="whitespace-pre-wrap">{line.text}</div>)}
                                                    </td>
                                                    {srtMode === 'edit' && (
                                                        <td className="px-4 py-2 text-center align-top">
                                                            <button onClick={(e) => { e.stopPropagation(); onRemoveSrtLine(line.id); }} className="text-gray-500 hover:text-red-500">
                                                                <TrashIcon className="w-5 h-5" />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <aside className={`lg:col-span-3 h-full min-h-0 transition-all duration-300 ${isAnalysisPanelOpen ? 'block' : 'hidden'}`}>
                <div className="relative h-full">
                    <button
                        onClick={() => setIsAnalysisPanelOpen(false)}
                        className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white z-10 bg-gray-900/50 rounded-full hover:bg-gray-700"
                        aria-label="분석 패널 닫기"
                    >
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                    <ScriptAnalysis analysisData={scriptAnalysis} />
                </div>
            </aside>
        </div>
    );
};
