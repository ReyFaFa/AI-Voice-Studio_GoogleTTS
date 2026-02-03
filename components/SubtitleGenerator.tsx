import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { SrtLine } from '../types';
import { transcribeAudioWithSrt } from '../services/geminiService';
import { SparklesIcon, DownloadIcon, TrashIcon, StopIcon, ClipboardIcon, ChevronUpIcon, ChevronDownIcon, RefreshIcon, PlusIcon, MinusIcon } from '../constants';
import { SilenceRemover } from './SilenceRemover';
import { 
    parseSrt, 
    adjustSrtGaps, 
    stringifySrt, 
    detectSilence, 
    msToSrtTime,
    srtTimeToMs,
    audioBufferToWavBase64,
    encodeAudioBufferToWavBlob
} from './Header';

// Helper functions for audio processing are now imported from Header.tsx (utils)
// This file only contains functions specific to this component's logic if any.

// Decode audio file into an AudioBuffer
async function decodeAudioData(file: File): Promise<AudioBuffer> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

function spliceAudio(originalBuffer: AudioBuffer, editedLines: SrtLine[], originalLines: SrtLine[]): { newBuffer: AudioBuffer, newSrtLines: SrtLine[] } {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = originalBuffer.sampleRate;
  const oldData = originalBuffer.getChannelData(0);
  const PAUSE_DURATION_S = 0.3;
  const pauseSamples = Math.floor(PAUSE_DURATION_S * sampleRate);

  const originalLinesMap = new Map(originalLines.map(line => [line.id, line]));

  const segmentsToKeep = editedLines.map(editedLine => {
      const originalLine = originalLinesMap.get(editedLine.id);
      if (!originalLine) {
          // This case should ideally not happen if logic is correct
          return { startSample: 0, endSample: 0 };
      }
      
      const originalStartTimeMs = srtTimeToMs(originalLine.startTime);
      const originalEndTimeMs = srtTimeToMs(originalLine.endTime);
      
      return {
          startSample: Math.floor(originalStartTimeMs / 1000 * sampleRate),
          endSample: Math.floor(originalEndTimeMs / 1000 * sampleRate),
          editedLine: editedLine, // Carry the edited text
      };
  });

  let totalLength = 0;
  let validSegmentsCount = 0;
  for (const segment of segmentsToKeep) {
      if (segment.endSample > segment.startSample) {
          totalLength += (segment.endSample - segment.startSample);
          validSegmentsCount++;
      }
  }

  if (validSegmentsCount > 1) {
      totalLength += (pauseSamples * (validSegmentsCount - 1));
  }

  if (totalLength <= 0) throw new Error("편집 후 오디오가 비어 있습니다. 모든 텍스트가 삭제된 것 같습니다.");

  const newBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
  const newData = newBuffer.getChannelData(0);
  let offset = 0;
  const newSrtLines: SrtLine[] = [];
  let isFirstChunk = true;

  for (const segment of segmentsToKeep) {
      if (segment.endSample <= segment.startSample) continue;
      
      const chunk = oldData.subarray(segment.startSample, segment.endSample);

      if (!isFirstChunk) {
          // Add a pause between concatenated clips
          // You could fill this with silence, but just advancing the offset works
          offset += pauseSamples;
      }
      
      newData.set(chunk, offset);

      const newStartTimeMs = (offset / sampleRate) * 1000;
      offset += chunk.length;
      const newEndTimeMs = (offset / sampleRate) * 1000;
      
      isFirstChunk = false;
      
      newSrtLines.push({
          ...segment.editedLine,
          index: newSrtLines.length + 1,
          startTime: msToSrtTime(newStartTimeMs),
          endTime: msToSrtTime(newEndTimeMs),
      });
  }

  return { newBuffer, newSrtLines };
}

function removeSilence(originalBuffer: AudioBuffer, segmentsToRemove: { start: number, end: number }[]): AudioBuffer {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = originalBuffer.sampleRate;
    const oldData = originalBuffer.getChannelData(0);
    let totalSamplesToRemove = 0;
    const segmentsInSamples = segmentsToRemove.map(s => {
        const startSample = Math.floor(s.start * sampleRate);
        const endSample = Math.floor(s.end * sampleRate);
        totalSamplesToRemove += (endSample - startSample);
        return { start: startSample, end: endSample };
    }).sort((a, b) => a.start - b.start);

    const newLength = oldData.length - totalSamplesToRemove;
    if (newLength <= 0) throw new Error("Resulting audio is empty after removing silence.");

    const newBuffer = audioContext.createBuffer(1, newLength, sampleRate);
    const newData = newBuffer.getChannelData(0);

    let currentSample = 0;
    let newSampleIndex = 0;
    for (const segment of segmentsInSamples) {
        const nonSilentChunk = oldData.subarray(currentSample, segment.start);
        newData.set(nonSilentChunk, newSampleIndex);
        newSampleIndex += nonSilentChunk.length;
        currentSample = segment.end;
    }
    const finalChunk = oldData.subarray(currentSample);
    newData.set(finalChunk, newSampleIndex);
    
    return newBuffer;
}


const SrtTable: React.FC<{
    lines: SrtLine[];
    currentLines: SrtLine[];
    isEditable?: boolean;
    onLineUpdate?: (id: string, newValues: Partial<Omit<SrtLine, 'id' | 'index'>>) => void;
    onLineDelete?: (id: string) => void;
    invalidTimestampIds: Set<string>;
}> = ({ lines, currentLines, isEditable = false, onLineUpdate, onLineDelete, invalidTimestampIds }) => {
    
    const currentLinesMap: Map<string, SrtLine> = new Map(currentLines.map(l => [l.id, l]));

    return (
        <div className="flex-grow overflow-y-auto border border-gray-700 rounded-md">
            <table className="w-full text-sm">
                <thead className="bg-gray-700/50 sticky top-0 z-10 text-gray-300">
                    <tr>
                        <th className="p-2 w-10">#</th>
                        <th className="p-2 w-32">시작 (hh:mm:ss,ms)</th>
                        <th className="p-2 w-32">종료 (hh:mm:ss,ms)</th>
                        <th className="p-2 text-left">내용</th>
                        {isEditable && <th className="p-2 w-12"></th>}
                    </tr>
                </thead>
                <tbody className="bg-gray-800">
                    {lines.map(originalLine => {
                        const currentLine = currentLinesMap.get(originalLine.id);
                        const isDeleted = !currentLine;
                        const isModified = currentLine && currentLine.text !== originalLine.text;
                        const isTimestampInvalid = invalidTimestampIds.has(originalLine.id);

                        return (
                            <tr key={originalLine.id} className={`border-b border-gray-700/60 group ${isDeleted ? 'bg-red-900/20' : ''}`}>
                                <td className={`p-2 text-center text-gray-400 align-top ${isDeleted ? 'line-through' : ''}`}>{originalLine.index}</td>
                                <td className="p-1 align-top">
                                    <input
                                        type="text"
                                        readOnly={!isEditable || isDeleted}
                                        value={currentLine?.startTime ?? ''}
                                        onChange={(e) => isEditable && onLineUpdate?.(originalLine.id, { startTime: e.target.value })}
                                        className={`w-full bg-transparent font-mono text-center p-1 rounded-md focus:outline-none focus:bg-gray-900 focus:ring-1 transition-colors ${isDeleted ? 'line-through' : ''} ${isTimestampInvalid ? 'ring-2 ring-red-500 text-red-400' : 'focus:ring-indigo-500'}`}
                                    />
                                </td>
                                <td className="p-1 align-top">
                                     <input
                                        type="text"
                                        readOnly={!isEditable || isDeleted}
                                        value={currentLine?.endTime ?? ''}
                                        onChange={(e) => isEditable && onLineUpdate?.(originalLine.id, { endTime: e.target.value })}
                                        className={`w-full bg-transparent font-mono text-center p-1 rounded-md focus:outline-none focus:bg-gray-900 focus:ring-1 transition-colors ${isDeleted ? 'line-through' : ''} ${isTimestampInvalid ? 'ring-2 ring-red-500 text-red-400' : 'focus:ring-indigo-500'}`}
                                    />
                                </td>
                                <td className="p-1 align-top">
                                    {isDeleted ? (
                                        <div className="px-1 py-1 text-gray-500 italic">[삭제된 문장]</div>
                                    ) : (
                                        <textarea 
                                            value={currentLine?.text ?? ''} 
                                            onChange={(e) => isEditable && onLineUpdate?.(originalLine.id, { text: e.target.value })}
                                            readOnly={!isEditable}
                                            className={`w-full bg-transparent p-1 rounded-md focus:outline-none text-gray-200 resize-none
                                            ${isEditable ? 'focus:bg-gray-900 focus:ring-1 focus:ring-indigo-500' : ''}
                                            ${isModified ? 'text-yellow-400' : ''}
                                            `}
                                            rows={(currentLine?.text ?? '').split('\n').length || 1}
                                        />
                                    )}
                                </td>
                                {isEditable && (
                                    <td className="p-2 text-center align-top">
                                     {!isDeleted && (
                                        <button onClick={() => onLineDelete?.(originalLine.id)} className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100"><TrashIcon className="w-5 h-5"/></button>
                                     )}
                                    </td>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};

export const SubtitleGenerator: React.FC = () => {
    const [originalAudioFile, setOriginalAudioFile] = useState<File | null>(null);
    const [originalAudioBuffer, setOriginalAudioBuffer] = useState<AudioBuffer | null>(null);
    const [originalAudioSrc, setOriginalAudioSrc] = useState<string | null>(null);
    
    const [editedAudioBuffer, setEditedAudioBuffer] = useState<AudioBuffer | null>(null);
    const [editedAudioSrc, setEditedAudioSrc] = useState<string | null>(null);
    const [editedSrtLines, setEditedSrtLines] = useState<SrtLine[]>([]);

    const [srtLines, setSrtLines] = useState<SrtLine[]>([]);
    const [originalSrtLines, setOriginalSrtLines] = useState<SrtLine[]>([]);
    const [hasTimestampEdits, setHasTimestampEdits] = useState(false);
    const [invalidTimestampIds, setInvalidTimestampIds] = useState<Set<string>>(new Set());
    const [timeShift, setTimeShift] = useState('00:00:00,000');
    const [isTimeShiftValid, setIsTimeShiftValid] = useState(true);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({ value: 0, status: '' });
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [silentSegments, setSilentSegments] = useState<{ start: number, end: number }[]>([]);
    const [hasMadeEdits, setHasMadeEdits] = useState(false);
    const [isReconstructHovered, setIsReconstructHovered] = useState(false);
    
    // Setting for split character count with local state for input flexibility
    const [srtSplitCharCount, setSrtSplitCharCount] = useState<number>(25);
    const [localSplitCount, setLocalSplitCount] = useState<string>('25');

    const abortControllerRef = useRef<AbortController | null>(null);
    
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

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (file && (file.type.startsWith('audio/') || file.type.startsWith('video/'))) {
            setOriginalAudioFile(file);
            setError(null);
            setSrtLines([]);
            setOriginalSrtLines([]);
            setEditedSrtLines([]);
            if (originalAudioSrc) URL.revokeObjectURL(originalAudioSrc);
            setOriginalAudioSrc(URL.createObjectURL(file));
        } else {
            setError('지원되지 않는 파일 형식입니다. 오디오 또는 비디오 파일을 업로드해주세요.');
        }
    }, [originalAudioSrc]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

    const handleTranscribe = useCallback(async () => {
        if (!originalAudioFile) return;

        setIsLoading(true);
        setError(null);
        setProgress({ value: 25, status: '오디오 파일 처리 중...' });
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        try {
            const buffer = await decodeAudioData(originalAudioFile);
            if (signal.aborted) throw new Error('Aborted');
            setOriginalAudioBuffer(buffer);
            
            setProgress({ value: 50, status: 'AI 음성 분석 모델로 전송 중...' });
            const wavBase64 = await audioBufferToWavBase64(buffer);
            if (signal.aborted) throw new Error('Aborted');
            
            setProgress({ value: 75, status: '음성 분석 및 자막 생성 중... (최대 1분 소요)' });
            const srtFromApi = await transcribeAudioWithSrt(wavBase64, srtSplitCharCount, signal);
            if (signal.aborted) throw new Error('Aborted');
            
            const parsed = parseSrt(srtFromApi);
            const adjusted = adjustSrtGaps(parsed);

            setSrtLines(adjusted);
            setOriginalSrtLines(JSON.parse(JSON.stringify(adjusted))); // Deep copy for original state
            setEditedSrtLines(JSON.parse(JSON.stringify(adjusted)));
            
            setEditedAudioBuffer(null);
            if (editedAudioSrc) URL.revokeObjectURL(editedAudioSrc);
            setEditedAudioSrc(null);
            
            setHasMadeEdits(false);
            setHasTimestampEdits(false);
            setInvalidTimestampIds(new Set());

        } catch (e) {
            if (e instanceof Error && e.name !== 'AbortError' && e.message !== 'Aborted') {
                setError(`오류가 발생했습니다: ${e.message}`);
            }
        } finally {
            setIsLoading(false);
            setProgress({ value: 0, status: '' });
            abortControllerRef.current = null;
        }
    }, [originalAudioFile, editedAudioSrc, srtSplitCharCount]);
    
    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsLoading(false);
            setError("작업이 사용자에 의해 중지되었습니다.");
        }
    };
    
    const handleLineUpdate = useCallback((id: string, newValues: Partial<Omit<SrtLine, 'id' | 'index'>>) => {
        setEditedSrtLines(prev => {
            const newLines = prev.map(line => line.id === id ? { ...line, ...newValues } : line);
            
            if (newValues.startTime !== undefined || newValues.endTime !== undefined) {
                setHasTimestampEdits(true);
            }

            const updatedLine = newLines.find(line => line.id === id);
            if (updatedLine) {
                const timeRegex = /^\d{2}:\d{2}:\d{2},\d{3}$/;
                const isStartValid = timeRegex.test(updatedLine.startTime);
                const isEndValid = timeRegex.test(updatedLine.endTime);
                const startTimeMs = srtTimeToMs(updatedLine.startTime);
                const endTimeMs = srtTimeToMs(updatedLine.endTime);
                const isOrderValid = isStartValid && isEndValid && startTimeMs < endTimeMs;

                setInvalidTimestampIds(prevInvalidIds => {
                    const newInvalidIds = new Set(prevInvalidIds);
                    if (!isStartValid || !isEndValid || !isOrderValid) {
                        newInvalidIds.add(id);
                    } else {
                        newInvalidIds.delete(id);
                    }
                    return newInvalidIds;
                });
            }
            return newLines;
        });
        setHasMadeEdits(true);
    }, []);

    const handleLineDelete = useCallback((idToDelete: string) => {
        setEditedSrtLines(prev => prev.filter(line => line.id !== idToDelete));
        setHasMadeEdits(true);
    }, []);

    const handleResetChanges = useCallback(() => {
        setEditedSrtLines(srtLines);
        setHasMadeEdits(false);
        setHasTimestampEdits(false);
        setInvalidTimestampIds(new Set());
    }, [srtLines]);

    const handleReconstructAudio = useCallback(() => {
        if (!originalAudioBuffer || hasTimestampEdits) return;
        setIsLoading(true);
        setError(null);
        setProgress({ value: 50, status: '오디오 재구성 중...'});
        try {
            const { newBuffer, newSrtLines } = spliceAudio(originalAudioBuffer, editedSrtLines, originalSrtLines);
            setEditedAudioBuffer(newBuffer);
            if (editedAudioSrc) URL.revokeObjectURL(editedAudioSrc);
            const blob = encodeAudioBufferToWavBlob(newBuffer);
            setEditedAudioSrc(URL.createObjectURL(blob));
            // Update SRT lines with new timestamps
            setSrtLines(newSrtLines);
            setOriginalSrtLines(JSON.parse(JSON.stringify(newSrtLines)));
            setEditedSrtLines(JSON.parse(JSON.stringify(newSrtLines)));
            setHasMadeEdits(false);
            setHasTimestampEdits(false);
            setInvalidTimestampIds(new Set());
        } catch(e) {
            if (e instanceof Error) setError(`오디오 재구성 오류: ${e.message}`);
        } finally {
            setIsLoading(false);
            setProgress({ value: 0, status: ''});
        }
    }, [originalAudioBuffer, editedSrtLines, originalSrtLines, hasTimestampEdits, editedAudioSrc]);

    const handleDownloadEditedSrt = useCallback(() => {
        if (editedSrtLines.length === 0) return;
        const srtString = stringifySrt(editedSrtLines);
        const blob = new Blob([srtString], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `edited-subtitles-${new Date().getTime()}.srt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [editedSrtLines]);
    
    const handleDownloadEditedAudio = useCallback(() => {
        if (!editedAudioSrc) return;
        const link = document.createElement('a');
        link.href = editedAudioSrc;
        link.download = `edited-audio-${new Date().getTime()}.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [editedAudioSrc]);
    
    const handleDetectSilence = useCallback(() => {
        const buffer = editedAudioBuffer || originalAudioBuffer;
        if (!buffer) return;
        const segments = detectSilence(buffer);
        setSilentSegments(segments);
    }, [originalAudioBuffer, editedAudioBuffer]);

    const handleRemoveSilenceSegments = useCallback((segmentsToRemove: { start: number; end: number }[]) => {
        const bufferToEdit = editedAudioBuffer || originalAudioBuffer;
        if (!bufferToEdit) return;
        try {
            const newBuffer = removeSilence(bufferToEdit, segmentsToRemove);
            setEditedAudioBuffer(newBuffer);
            if (editedAudioSrc) URL.revokeObjectURL(editedAudioSrc);
            const blob = encodeAudioBufferToWavBlob(newBuffer);
            setEditedAudioSrc(URL.createObjectURL(blob));
            setSilentSegments([]);
        } catch (e) {
            if (e instanceof Error) setError(`무음 제거 오류: ${e.message}`);
        }
    }, [originalAudioBuffer, editedAudioBuffer, editedAudioSrc]);

    const handleTimeShiftInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setTimeShift(value);
        const timeRegex = /^\d{2}:\d{2}:\d{2},\d{3}$/;
        setIsTimeShiftValid(timeRegex.test(value));
    };

    const handleTimeShift = (operation: 'add' | 'subtract') => {
        if (!isTimeShiftValid) return;

        const shiftMs = srtTimeToMs(timeShift);
        if (shiftMs === 0) return;

        setEditedSrtLines(prevLines => 
            prevLines.map(line => {
                let startMs = srtTimeToMs(line.startTime);
                let endMs = srtTimeToMs(line.endTime);

                if (operation === 'add') {
                    startMs += shiftMs;
                    endMs += shiftMs;
                } else { // subtract
                    startMs -= shiftMs;
                    endMs -= shiftMs;
                }

                // Clamp at zero
                startMs = Math.max(0, startMs);
                endMs = Math.max(0, endMs);
                
                // Ensure end is after start
                if (endMs < startMs) {
                    endMs = startMs;
                }

                return {
                    ...line,
                    startTime: msToSrtTime(startMs),
                    endTime: msToSrtTime(endMs),
                };
            })
        );
        setHasMadeEdits(true);
        setHasTimestampEdits(true);
    };

    const isReconstructDisabled = !hasMadeEdits || hasTimestampEdits || invalidTimestampIds.size > 0 || isLoading;
    const reconstructDisabledReason = hasTimestampEdits 
        ? "타임코드를 수정한 경우 오디오를 재구성할 수 없습니다."
        : invalidTimestampIds.size > 0
            ? "유효하지 않은 타임코드가 있어 오디오를 재구성할 수 없습니다."
            : !hasMadeEdits
                ? "변경 사항이 없습니다."
                : "";
    
    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">SRT 자막 편집기</h2>
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-2 rounded-md hover:bg-gray-700 transition-colors"
                    aria-label={isCollapsed ? "편집기 펼치기" : "편집기 접기"}
                >
                    {isCollapsed ? <ChevronDownIcon className="w-5 h-5"/> : <ChevronUpIcon className="w-5 h-5"/>}
                </button>
            </div>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-full opacity-100'}`}>
                <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragActive ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-500'}`}>
                    <input {...getInputProps()} />
                    {originalAudioFile ? (
                        <div className="text-center">
                            <p className="font-semibold text-green-400">파일 선택됨:</p>
                            <p className="text-sm text-gray-300">{originalAudioFile.name}</p>
                            <p className="text-xs text-gray-500 mt-2">다른 파일을 드래그하거나 여기를 클릭하여 교체하세요.</p>
                        </div>
                    ) : (
                        <p className="text-center text-gray-400">오디오 또는 비디오 파일을 드래그 앤 드롭하거나 여기를 클릭하여 선택하세요.</p>
                    )}
                </div>

                <div className="mt-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <div className="space-y-2">
                        <label htmlFor="srt-split-count-sub" className="block text-sm font-medium text-gray-300">자막 분할 글자 수 (최소 10자)</label>
                        <div className="flex items-center">
                            <input
                                id="srt-split-count-sub"
                                type="number"
                                value={localSplitCount}
                                min="10"
                                max="100"
                                onChange={handleSplitCountChange}
                                onBlur={handleSplitCountBlur}
                                onKeyDown={handleSplitCountKeyDown}
                                className="w-24 text-center bg-gray-700 border border-gray-600 rounded-md shadow-sm py-1.5 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm text-white"
                            />
                        </div>
                        <p className="text-xs text-gray-400 pt-1">AI가 자막을 생성할 때 각 라인의 글자 수를 이 값에 가깝게 조절합니다.</p>
                    </div>
                </div>

                <div className="mt-4">
                    {isLoading ? (
                         <div className="w-full flex items-center gap-4 bg-gray-700/50 p-2 rounded-md">
                            <div className="flex-grow flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                <span className="font-semibold text-white">{progress.status || '처리 중...'}</span>
                            </div>
                            <button onClick={handleStop} className="flex-shrink-0 flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-red-700 transition-colors">
                                <StopIcon className="w-5 h-5" />
                                <span>중지</span>
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleTranscribe} disabled={!originalAudioFile} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 px-4 rounded-md hover:bg-indigo-700 disabled:bg-indigo-800/50 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200">
                            <SparklesIcon className="w-5 h-5"/>
                            자막 생성하기
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mt-4 bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">
                        <strong>오류:</strong> {error}
                    </div>
                )}
                
                {(srtLines.length > 0 || editedAudioSrc) && !isLoading && (
                    <div className="mt-6 flex flex-col gap-4">
                        {editedAudioSrc && (
                            <div className="p-4 rounded-lg bg-green-900/20 border border-green-700/50">
                                <h3 className="text-lg font-bold text-green-300 mb-2">수정된 오디오</h3>
                                <audio controls src={editedAudioSrc} className="w-full"></audio>
                                <button onClick={handleDownloadEditedAudio} className="mt-2 text-sm flex items-center gap-1.5 bg-green-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-green-700"><DownloadIcon className="w-4 h-4"/>다운로드</button>
                            </div>
                        )}
                        {originalAudioSrc && (
                             <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                                <h3 className="text-lg font-bold text-white mb-2">원본 오디오</h3>
                                <audio controls src={originalAudioSrc} className="w-full"></audio>
                            </div>
                        )}

                        <div className="flex-grow flex flex-col min-h-0">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-bold">자막 편집</h3>
                                {srtLines.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        {hasMadeEdits && <button onClick={handleResetChanges} className="text-sm bg-gray-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-gray-500">초기화</button>}
                                        
                                        <button onClick={handleDownloadEditedSrt} disabled={editedSrtLines.length === 0} className="text-sm flex items-center gap-1.5 bg-green-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-green-700 disabled:bg-gray-500"><DownloadIcon className="w-4 h-4"/>SRT 다운로드</button>
                                        
                                        <div className="relative">
                                            <button
                                                onClick={handleReconstructAudio}
                                                disabled={isReconstructDisabled}
                                                onMouseEnter={() => setIsReconstructHovered(true)}
                                                onMouseLeave={() => setIsReconstructHovered(false)}
                                                className="text-sm flex items-center gap-1.5 bg-sky-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-sky-700 disabled:bg-gray-500 disabled:cursor-not-allowed"
                                            >
                                                <RefreshIcon className="w-4 h-4" />
                                                <span>오디오 재구성</span>
                                            </button>
                                            {isReconstructHovered && reconstructDisabledReason && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-gray-900 text-white text-xs rounded py-1 px-2 z-20 shadow-lg text-center">
                                                    {reconstructDisabledReason}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {srtLines.length > 0 && (
                                <div className="p-3 bg-gray-900/50 border border-gray-700 rounded-md my-2 flex items-center gap-4">
                                    <label htmlFor="time-shift-input" className="text-sm font-medium text-gray-300 whitespace-nowrap">타임코드 일괄 조정:</label>
                                    <input
                                        id="time-shift-input"
                                        type="text"
                                        value={timeShift}
                                        onChange={handleTimeShiftInputChange}
                                        className={`w-36 bg-gray-700 font-mono text-center p-1 rounded-md focus:outline-none focus:ring-1 ${isTimeShiftValid ? 'focus:ring-indigo-500' : 'ring-2 ring-red-500 text-red-400'}`}
                                        placeholder="00:00:00,000"
                                    />
                                    <button
                                        onClick={() => handleTimeShift('add')}
                                        disabled={!isTimeShiftValid || editedSrtLines.length === 0}
                                        className="text-sm flex items-center gap-1.5 bg-green-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-green-700 disabled:bg-gray-500"
                                        title="입력한 시간만큼 모든 타임코드를 뒤로 이동시킵니다."
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        추가
                                    </button>
                                    <button
                                        onClick={() => handleTimeShift('subtract')}
                                        disabled={!isTimeShiftValid || editedSrtLines.length === 0}
                                        className="text-sm flex items-center gap-1.5 bg-red-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-red-700 disabled:bg-gray-500"
                                        title="입력한 시간만큼 모든 타임코드를 앞으로 이동시킵니다."
                                    >
                                        <MinusIcon className="w-4 h-4" />
                                        빼기
                                    </button>
                                </div>
                            )}
                            <SrtTable
                                lines={originalSrtLines.length > 0 ? originalSrtLines : srtLines}
                                currentLines={editedSrtLines}
                                isEditable={true}
                                onLineUpdate={handleLineUpdate}
                                onLineDelete={handleLineDelete}
                                invalidTimestampIds={invalidTimestampIds}
                            />
                        </div>

                        {silentSegments.length > 0 && <SilenceRemover segments={silentSegments} onRemove={handleRemoveSilenceSegments} />}
                    </div>
                )}
            </div>
        </div>
    );
};