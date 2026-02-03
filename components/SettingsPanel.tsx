import React, { useState, useEffect } from 'react';
import { Voice, ScriptLine } from '../types';
import { PlayIcon, ChevronDownIcon, ChevronUpIcon, SparklesIcon, ChartBarIcon, StopIcon } from '../constants';

interface SettingsPanelProps {
    singleSpeakerVoice: string;
    setSingleSpeakerVoice: (voice: string) => void;
    voices: Voice[];
    onPreviewVoice: (voiceId: string) => void;
    isPreviewLoading: Record<string, boolean>;
    isCollapsed: boolean;
    setIsCollapsed: (isCollapsed: boolean) => void;
    srtSplitCharCount: number;
    setSrtSplitCharCount: (count: number) => void;
    // New props for buttons
    onGenerateAudio: () => void;
    onStopGeneration: () => void;
    isLoading: boolean;
    loadingStatus: string;
    scriptLines: ScriptLine[];
    setIsAnalysisPanelOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    singleSpeakerVoice, setSingleSpeakerVoice,
    voices, onPreviewVoice, isPreviewLoading,
    isCollapsed, setIsCollapsed,
    srtSplitCharCount, setSrtSplitCharCount,
    onGenerateAudio, onStopGeneration, isLoading, loadingStatus, scriptLines, setIsAnalysisPanelOpen
}) => {
    const [localSplitCount, setLocalSplitCount] = useState<string>(srtSplitCharCount.toString());

    useEffect(() => {
        setLocalSplitCount(srtSplitCharCount.toString());
    }, [srtSplitCharCount]);

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg">
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                <div className="p-4">
                     <div className="flex items-center gap-x-6 gap-y-4 flex-wrap">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">음성 선택</label>
                            <div className="flex items-center space-x-2">
                                <select
                                    value={singleSpeakerVoice}
                                    onChange={(e) => setSingleSpeakerVoice(e.target.value)}
                                    className={`w-80 bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm ${singleSpeakerVoice ? 'text-white' : 'text-gray-400'}`}
                                >
                                    <option value="" disabled>음성을 선택하세요</option>
                                    {voices.map(voice => (
                                        <option key={voice.id} value={voice.id}>
                                            {voice.name} ({voice.gender === 'male' ? '남' : '여'}) - {voice.description}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => onPreviewVoice(singleSpeakerVoice)}
                                    disabled={!singleSpeakerVoice || isPreviewLoading[singleSpeakerVoice]}
                                    className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                    aria-label={`음성 미리듣기 ${singleSpeakerVoice}`}
                                >
                                    {isPreviewLoading[singleSpeakerVoice] ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <PlayIcon className="w-5 h-5"/>}
                                </button>
                            </div>
                        </div>

                        {/* Action Buttons moved here */}
                        <div className="flex items-end gap-3 pb-0.5 ml-auto">
                            <button 
                                onClick={() => setIsAnalysisPanelOpen(prev => !prev)}
                                className="flex items-center gap-2 bg-gray-700 text-white font-semibold py-2 px-4 rounded-md hover:bg-gray-600 transition-colors h-[42px]"
                            >
                                <ChartBarIcon className="w-5 h-5" />
                                <span>스크립트 분석</span>
                            </button>
                            
                            <div className="flex flex-col items-center">
                                {isLoading ? (
                                    <button onClick={onStopGeneration} className="flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-red-700 transition-colors w-[160px] h-[42px]">
                                        <StopIcon className="w-5 h-5" />
                                        <span>생성 중지</span>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={onGenerateAudio}
                                        disabled={!singleSpeakerVoice || scriptLines.every(l => !l.text.trim())}
                                        className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors w-[160px] h-[42px]"
                                    >
                                        <SparklesIcon className="w-5 h-5" />
                                        <span>오디오 생성</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="w-full text-center py-2 bg-gray-700/50 hover:bg-gray-700 transition-colors rounded-b-lg"
                aria-label={isCollapsed ? "설정 펼치기" : "설정 접기"}
            >
                {isCollapsed ? 
                    <ChevronDownIcon className="w-5 h-5 mx-auto text-gray-400" /> : 
                    <ChevronUpIcon className="w-5 h-5 mx-auto text-gray-400" />
                }
            </button>
        </div>
    );
};