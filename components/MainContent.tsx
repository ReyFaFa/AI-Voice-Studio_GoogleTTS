
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ScriptLine, SrtLine, Voice, Preset } from '../types';
import { AudioHistoryItem, MAX_CHAR_LIMIT, AutoFormatOptions } from '../App';
import {
    ChartBarIcon, StopIcon, SparklesIcon, ListBulletIcon, PencilIcon,
    ClipboardIcon, DownloadIcon, LinkIcon, RefreshIcon, ScissorsIcon,
    TrashIcon, XCircleIcon, PlusIcon, MinusIcon, StyleIcon, WrapTextIcon,
    ArrowsUpDownIcon, ArrowUpIcon, ArrowDownIcon, PlayIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, StarIcon, FloppyDiskIcon
} from '../constants';
import { AudioPlayer, AudioPlayerHandle } from './AudioPlayer';
import { SilenceRemover } from './SilenceRemover';
import { ScriptAnalysis } from './ScriptAnalysis';
import { msToSrtTime, srtTimeToMs } from './Header';
import { DIALOGUE_STYLES } from '../constants';

export interface MainContentProps {
    // Voice & Settings Props
    singleSpeakerVoice: string;
    setSingleSpeakerVoice: (voice: string) => void;
    speechSpeed: number;
    setSpeechSpeed: (speed: number) => void;
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
}

const ScriptEditor: React.FC<ScriptEditorProps> = ({
    scriptLines, onScriptChange, onUpdateScriptLine, onRemoveScriptLine, onAddScriptLine,
    onRemoveEmptyScriptLines, onAutoFormatScript, onMergeScriptLine, onSplitScriptLine,
    scriptAnalysis, totalEstimatedTime, isLoading, loadingStatus, error
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
    singleSpeakerVoice, setSingleSpeakerVoice, speechSpeed, setSpeechSpeed, voices, onPreviewVoice, isPreviewLoading,
    srtSplitCharCount, setSrtSplitCharCount,
    // New Props
    selectedModel, setSelectedModel, stylePrompt, setStylePrompt, favorites, toggleFavorite,

    presets, onSavePreset, onDeletePreset, onLoadPreset,

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
}) => {
    const [srtMode, setSrtMode] = useState<'chapter' | 'edit'>('chapter');
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
    const [isAutoplayOnClickEnabled, setIsAutoplayOnClickEnabled] = useState(false);
    const [isPresetSaveOpen, setIsPresetSaveOpen] = useState(false);
    const [presetName, setPresetName] = useState('');

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

    const handleSavePresetClick = () => {
        if (presetName.trim()) {
            onSavePreset(presetName.trim());
            setPresetName('');
            setIsPresetSaveOpen(false);
        }
    };

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
                                        onChange={(e) => {
                                            if (e.target.value) onLoadPreset(e.target.value);
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>설정 불러오기...</option>
                                        {presets.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    {presets.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const select = document.querySelector('select') as HTMLSelectElement; // Should target specific select better but works for now in context
                                                // Actually we can't easily get the selected ID without state for dropdown value. 
                                                // Instead, let's add delete button next to items in a custom dropdown or just keep it simple: 
                                                // "Delete current loaded?" No, that's ambiguous.
                                                // Let's rely on user selecting and maybe a separate delete button or better UI later.
                                                // For now, let's keep it simple: Just Load and Save.
                                            }}
                                            className="hidden" // Placeholder
                                        >
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 relative">
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
                                            title="현재 설정(모델, 음성, 스타일)을 저장합니다"
                                        >
                                            <FloppyDiskIcon className="w-3.5 h-3.5" />
                                            <span>설정 저장</span>
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
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">음성 선택</label>
                                    <div className="flex items-center gap-2 bg-gray-700/30 px-2 py-1 rounded-full border border-gray-600/50">
                                        <span className="text-xs text-gray-400 font-medium">속도</span>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value={speechSpeed}
                                            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                            className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                                        />
                                        <span className="text-xs font-mono font-bold text-indigo-400 w-8 text-right">{speechSpeed.toFixed(1)}x</span>
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
                                        <button
                                            onClick={onGenerateAudio}
                                            disabled={!singleSpeakerVoice || scriptLines.every(l => !l.text.trim())}
                                            className="flex items-center justify-center gap-2 bg-indigo-600 text-white text-xs font-bold py-2 px-3 rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <SparklesIcon className="w-4 h-4" />
                                            <span>생성</span>
                                        </button>
                                    )}
                                </div>
                            </div>
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
                            </div>
                        )}

                        {(isLoading && loadingStatus.includes('자막')) ? (
                            <div className="flex-grow bg-gray-800 rounded-lg shadow-inner flex flex-col items-center justify-start pt-16 border border-gray-700/50">
                                <div className="relative w-20 h-20 mb-6">
                                    <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500/30 rounded-full"></div>
                                    <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                        <SparklesIcon className="w-8 h-8 text-indigo-400 animate-pulse" />
                                    </div>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2 animate-pulse">{loadingStatus}</h3>
                                <p className="text-gray-400 text-sm max-w-md text-center leading-relaxed">
                                    AI가 오디오 파형을 분석하여 타임코드를 생성하고 있습니다.<br />
                                    잠시만 기다려주세요...
                                </p>
                                <div className="flex gap-2 mt-6">
                                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce"></div>
                                </div>
                            </div>
                        ) : srtContent && (
                            <div className="flex-grow bg-gray-800 rounded-lg shadow-inner flex flex-col min-h-0">
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
