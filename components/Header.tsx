import React from 'react';
import { SrtLine } from '../types';

// =================================================================================
// AUDIO UTILS
// =================================================================================

// Helper function to write strings into a DataView for the WAV header
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Creates a WAV file Blob from base64 encoded raw PCM audio data.
 * @param base64Pcm The base64 encoded string of raw PCM data.
 * @returns A Blob representing a valid WAV file.
 */
export const createWavBlobFromBase64Pcm = (base64Pcm: string): Blob => {
  const pcmData = atob(base64Pcm);
  const sampleRate = 24000; // As per Gemini TTS documentation
  const numChannels = 1;
  const bitsPerSample = 16;
  
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < dataSize; i++) {
    view.setUint8(44 + i, pcmData.charCodeAt(i));
  }

  return new Blob([view], { type: 'audio/wav' });
};


/**
 * Encodes an AudioBuffer to a WAV file Blob.
 * @param audioBuffer The AudioBuffer to encode.
 * @returns A Blob representing a valid WAV file.
 */
export const encodeAudioBufferToWavBlob = (audioBuffer: AudioBuffer): Blob => {
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const pcmData = audioBuffer.getChannelData(0); // Assuming mono
    const bitsPerSample = 16;
    
    const buffer = new ArrayBuffer(44 + pcmData.length * 2);
    const view = new DataView(buffer);

    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length * 2, true);

    // Write PCM data
    let offset = 44;
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, pcmData[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
};

/**
 * Slices an AudioBuffer from a start time to an end time.
 * @param buffer The original AudioBuffer.
 * @param startTime The start time in seconds.
 * @param endTime The end time in seconds.
 * @param audioCtx The AudioContext.
 * @returns A new, sliced AudioBuffer.
 */
export const sliceAudioBuffer = (
  buffer: AudioBuffer,
  startTime: number,
  endTime: number,
  audioCtx: AudioContext
): AudioBuffer => {
  const { sampleRate, numberOfChannels, duration } = buffer;
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(Math.min(endTime, duration) * sampleRate);
  const frameCount = endSample - startSample;

  if (frameCount <= 0) {
    throw new Error('Invalid slice parameters resulting in an empty audio buffer.');
  }

  const newBuffer = audioCtx.createBuffer(numberOfChannels, frameCount, sampleRate);
  for (let i = 0; i < numberOfChannels; i++) {
    const channelData = buffer.getChannelData(i);
    const newChannelData = newBuffer.getChannelData(i);
    newChannelData.set(channelData.subarray(startSample, endSample));
  }
  return newBuffer;
};

/**
 * Detects segments of silence in an AudioBuffer.
 * @param audioBuffer The AudioBuffer to analyze.
 * @param threshold The amplitude threshold below which audio is considered silence.
 * @param minSilenceDuration The minimum duration in seconds for a segment to be considered silence.
 * @returns An array of objects with start and end times of silent segments.
 */
export const detectSilence = (
    audioBuffer: AudioBuffer,
    threshold: number = 0.01,
    minSilenceDuration: number = 0.25
): { start: number, end: number }[] => {
    const channelData = audioBuffer.getChannelData(0); // Analyze mono
    const sampleRate = audioBuffer.sampleRate;
    const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);

    const segments = [];
    let silenceStart = -1;

    for (let i = 0; i < channelData.length; i++) {
        if (Math.abs(channelData[i]) < threshold && silenceStart === -1) {
            silenceStart = i;
        } else if (Math.abs(channelData[i]) >= threshold && silenceStart !== -1) {
            if (i - silenceStart >= minSilenceSamples) {
                segments.push({ start: silenceStart / sampleRate, end: i / sampleRate });
            }
            silenceStart = -1;
        }
    }
    if (silenceStart !== -1 && channelData.length - silenceStart >= minSilenceSamples) {
        segments.push({ start: silenceStart / sampleRate, end: channelData.length / sampleRate });
    }
    return segments;
};


// =================================================================================
// TEXT & SCRIPT UTILS
// =================================================================================

const initialAnalysis = {
    charCount: 0, charCountNoSpaces: 0, wordCount: 0, sentenceCount: 0, lineCount: 0,
    paragraphCount: 0, uniqueWordCount: 0, readTime: 0,
    analysis: { hangul: 0, english: 0, numbers: 0, spaces: 0, symbols: 0, total: 0 },
    topWords: [], topBigrams: [], topTrigrams: [],
};

const getFrequency = (items: string[]) => {
    const frequency = new Map<string, number>();
    for (const item of items) {
        frequency.set(item, (frequency.get(item) || 0) + 1);
    }
    return Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);
};

const getNgrams = (words: string[], n: number) => {
    const ngrams = [];
    if (words.length >= n) {
        for (let i = 0; i <= words.length - n; i++) {
            ngrams.push(words.slice(i, i + n).join(' '));
        }
    }
    return ngrams;
};

export const analyzeScript = (script: string) => {
    if (!script.trim()) return initialAnalysis;

    const charCount = script.length;
    const charCountNoSpaces = script.replace(/\s/g, '').length;
    const wordsForCount = script.trim().split(/\s+/).filter(Boolean);
    const wordCount = wordsForCount.length;
    const sentenceCount = (script.match(/[.!?]+(\s|$)/g) || []).length || (charCount > 0 && wordCount > 0 ? 1 : 0);
    const lineCount = script.length > 0 ? script.split('\n').length : 0;
    const paragraphCount = script.split(/\n\s*\n/).filter(Boolean).length;
    const normalizedWords = script.trim().toLowerCase().replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, '').split(/\s+/).filter(Boolean);
    const uniqueWordCount = new Set(normalizedWords).size;
    const readTime = charCountNoSpaces > 0 ? Math.round(charCountNoSpaces / (400 / 60)) : 0; // 400 chars/min

    let hangul = 0, english = 0, numbers = 0, spaces = 0, symbols = 0;
    for (const char of script) {
        if (/[가-힣]/.test(char)) hangul++;
        else if (/[a-zA-Z]/.test(char)) english++;
        else if (/[0-9]/.test(char)) numbers++;
        else if (/\s/.test(char)) spaces++;
        else symbols++;
    }
    
    const topWords = getFrequency(normalizedWords).slice(0, 5);
    const topBigrams = getFrequency(getNgrams(normalizedWords, 2)).slice(0, 5);
    const topTrigrams = getFrequency(getNgrams(normalizedWords, 3)).slice(0, 5);

    return {
        charCount, charCountNoSpaces, wordCount, sentenceCount, lineCount, paragraphCount, uniqueWordCount, readTime,
        analysis: { hangul, english, numbers, spaces, symbols, total: charCount },
        topWords, topBigrams, topTrigrams,
    };
};

export const splitTextIntoChunks = (text: string, maxLength: number): string[] => {
    if (maxLength <= 0) return [text];
    const finalChunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]*\s*|[^.!?]+$/g) || [];

    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence.length === 0) continue;
        if (trimmedSentence.length <= maxLength) {
            finalChunks.push(trimmedSentence);
        } else {
            const words = trimmedSentence.split(' ');
            let currentChunk = '';
            for (const word of words) {
                if (currentChunk.length === 0) currentChunk = word;
                else if (currentChunk.length + 1 + word.length <= maxLength) currentChunk += ' ' + word;
                else {
                    finalChunks.push(currentChunk);
                    currentChunk = word;
                }
            }
            if (currentChunk.length > 0) finalChunks.push(currentChunk);
        }
    }
    return finalChunks;
};

// =================================================================================
// SRT & SUBTITLE UTILS
// =================================================================================

export const srtTimeToMs = (time: string): number => {
    const parts = time.split(/[:,]/);
    if (parts.length !== 4) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    const milliseconds = parseInt(parts[3], 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
};

export const msToSrtTime = (totalMs: number): string => {
    const ms = Math.floor(totalMs % 1000);
    let totalSeconds = Math.floor(totalMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

export const parseSrt = (srtContent: string): SrtLine[] => {
    const blocks = srtContent.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
    const parsed: SrtLine[] = [];
    const timeRegex = /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;

    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length === 0) continue;

        let timeLineIndex = -1;
        let timeMatch: RegExpMatchArray | null = null;
        
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(timeRegex);
            if (match) {
                timeLineIndex = i;
                timeMatch = match;
                break;
            }
        }

        if (timeLineIndex === -1 || !timeMatch) continue;

        const startTime = timeMatch[1].replace('.', ',');
        const endTime = timeMatch[2].replace('.', ',');
        const textLines = lines.slice(timeLineIndex + 1);
        const text = textLines.join('\n').trim();

        if (text) {
             const index = parsed.length + 1;
             parsed.push({
                id: `srt-${index}-${Date.now()}`,
                index,
                startTime,
                endTime,
                text,
             });
        }
    }
    return parsed;
};

export const adjustSrtGaps = (lines: SrtLine[]): SrtLine[] => {
    if (lines.length < 2) return lines;
    const adjusted = lines.map(line => ({ ...line }));
    for (let i = 0; i < adjusted.length - 1; i++) {
        const currentLine = adjusted[i];
        const nextLine = adjusted[i + 1];
        const nextStartTimeMs = srtTimeToMs(nextLine.startTime);
        if (nextStartTimeMs > 0) {
            const newEndTimeMs = nextStartTimeMs - 1;
            const currentStartTimeMs = srtTimeToMs(currentLine.startTime);
            if (newEndTimeMs > currentStartTimeMs) {
                currentLine.endTime = msToSrtTime(newEndTimeMs);
            }
        }
    }
    return adjusted;
};

export const stringifySrt = (lines: SrtLine[]): string => {
    return lines
      .map((line, i) => `${i + 1}\n${line.startTime} --> ${line.endTime}\n${line.text}`)
      .join('\n\n');
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            if (!base64) {
                reject(new Error("Failed to read blob as base64."));
            } else {
                resolve(base64);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Converts an AudioBuffer to a base64 encoded WAV string.
 * This is a global utility to be used by both TTS and Subtitler modes.
 * @param buffer The AudioBuffer to convert.
 * @returns A promise that resolves with the base64 encoded WAV string.
 */
export const audioBufferToWavBase64 = async (buffer: AudioBuffer): Promise<string> => {
    const wavBlob = encodeAudioBufferToWavBlob(buffer);
    return await blobToBase64(wavBlob);
};

export function spliceAudio(originalBuffer: AudioBuffer, editedLines: SrtLine[], originalLines: SrtLine[]): { newBuffer: AudioBuffer, newSrtLines: SrtLine[] } {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = originalBuffer.sampleRate;
  const oldData = originalBuffer.getChannelData(0);

  // Filter out lines that don't have valid text or are deleted
  const segmentsToKeep = editedLines.map(editedLine => {
      // Use the Edited timestamps to define the cut from the original audio.
      // This allows trimming silence or removing parts by adjusting the time in the editor.
      const startTimeMs = srtTimeToMs(editedLine.startTime);
      const endTimeMs = srtTimeToMs(editedLine.endTime);
      
      return {
          startSample: Math.floor(Math.max(0, startTimeMs) / 1000 * sampleRate),
          endSample: Math.floor(Math.min(originalBuffer.duration * 1000, endTimeMs) / 1000 * sampleRate),
          editedLine: editedLine,
      };
  }).filter(seg => seg.endSample > seg.startSample);

  let totalLength = 0;
  for (const segment of segmentsToKeep) {
      totalLength += (segment.endSample - segment.startSample);
  }

  if (totalLength <= 0) throw new Error("편집 후 오디오가 비어 있습니다. 모든 텍스트가 삭제되었거나 타임코드가 유효하지 않습니다.");

  const newBuffer = audioContext.createBuffer(1, totalLength, sampleRate);
  const newData = newBuffer.getChannelData(0);
  
  let offset = 0;
  const newSrtLines: SrtLine[] = [];

  for (const segment of segmentsToKeep) {
      const chunk = oldData.subarray(segment.startSample, segment.endSample);
      newData.set(chunk, offset);

      const newStartTimeMs = (offset / sampleRate) * 1000;
      offset += chunk.length;
      const newEndTimeMs = (offset / sampleRate) * 1000;
      
      newSrtLines.push({
          ...segment.editedLine,
          index: newSrtLines.length + 1,
          startTime: msToSrtTime(newStartTimeMs),
          endTime: msToSrtTime(newEndTimeMs),
      });
  }

  return { newBuffer, newSrtLines };
}


// =================================================================================
// DUMMY HEADER COMPONENT
// =================================================================================

export const Header: React.FC = () => {
    return null;
};