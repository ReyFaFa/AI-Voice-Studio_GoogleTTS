import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SrtLine } from '../types';
import { msToSrtTime, srtTimeToMs } from './Header';

interface WaveformProps {
    audioBuffer: AudioBuffer;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    srtLines: SrtLine[];
    activeSrtLineId: string | null;
    zoom: number;
    onZoomChange: (newZoom: number) => void;
}

const WAVEFORM_HEIGHT = 80;
const TIMELINE_HEIGHT = 20;
const TOTAL_HEIGHT = WAVEFORM_HEIGHT + TIMELINE_HEIGHT;

const processAudioBuffer = (audioBuffer: AudioBuffer, resolution: number): Float32Array => {
    const rawData = audioBuffer.getChannelData(0);
    const samples = rawData.length;
    const peakData = new Float32Array(resolution * 2);
    const samplesPerPixel = Math.floor(samples / resolution);

    for (let i = 0; i < resolution; i++) {
        const startIndex = i * samplesPerPixel;
        const endIndex = startIndex + samplesPerPixel;
        let min = 1.0;
        let max = -1.0;
        for (let j = startIndex; j < endIndex; j++) {
            const sample = rawData[j];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
        }
        peakData[i * 2] = min;
        peakData[i * 2 + 1] = max;
    }
    return peakData;
};

const formatTimelineTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const Waveform: React.FC<WaveformProps> = ({ audioBuffer, currentTime, duration, onSeek, srtLines, activeSrtLineId, zoom, onZoomChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
    
    const [peakData, setPeakData] = useState<Float32Array | null>(null);
    const [hoverTime, setHoverTime] = useState<number | null>(null);

    useEffect(() => {
        const resolution = 4000; 
        const data = processAudioBuffer(audioBuffer, resolution);
        setPeakData(data);
    }, [audioBuffer]);

    const draw = useCallback(() => {
        const mainCanvas = mainCanvasRef.current;
        const playheadCanvas = playheadCanvasRef.current;
        const container = containerRef.current;
        if (!mainCanvas || !playheadCanvas || !container || !peakData || duration === 0) return;

        const ctx = mainCanvas.getContext('2d');
        const playheadCtx = playheadCanvas.getContext('2d');
        if (!ctx || !playheadCtx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const displayWidth = container.clientWidth;
        const canvasWidth = displayWidth * zoom;
        
        mainCanvas.width = canvasWidth * dpr;
        mainCanvas.height = TOTAL_HEIGHT * dpr;
        mainCanvas.style.width = `${canvasWidth}px`;
        mainCanvas.style.height = `${TOTAL_HEIGHT}px`;
        ctx.scale(dpr, dpr);

        playheadCanvas.width = canvasWidth * dpr;
        playheadCanvas.height = TOTAL_HEIGHT * dpr;
        playheadCanvas.style.width = `${canvasWidth}px`;
        playheadCanvas.style.height = `${TOTAL_HEIGHT}px`;
        playheadCtx.scale(dpr, dpr);

        ctx.clearRect(0, 0, canvasWidth, TOTAL_HEIGHT);

        // 1. Draw Timeline
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#A0AEC0';
        const pixelsPerSecond = canvasWidth / duration;
        const timeIntervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
        let interval = timeIntervals[0];
        for (const t of timeIntervals) {
            if (t * pixelsPerSecond > 60) { interval = t; break; }
        }
        for (let i = 0; i <= duration; i += interval) {
            const x = i * pixelsPerSecond;
            ctx.fillRect(x, TIMELINE_HEIGHT - 10, 1, 10);
            ctx.fillText(formatTimelineTime(i), x + 3, TIMELINE_HEIGHT - 2);
        }

        // 2. Draw Waveform (Draw this FIRST so highlights go on top)
        ctx.fillStyle = '#4A5568';
        const halfHeight = WAVEFORM_HEIGHT / 2;
        const peakDataResolution = peakData.length / 2;
        const step = peakDataResolution / canvasWidth;

        for (let i = 0; i < canvasWidth; i++) {
            const peakIndex = Math.floor(i * step) * 2;
            const min = peakData[peakIndex];
            const max = peakData[peakIndex + 1];
            
            const y1 = (1 + min) * halfHeight;
            const y2 = (1 + max) * halfHeight;
            const height = Math.max(1, y2 - y1);
            
            ctx.fillRect(i, TIMELINE_HEIGHT + y1, 1, height);
        }

        // 3. Draw Highlights (Draw ON TOP of waveform with transparency)
        srtLines.forEach(line => {
            const startTime = srtTimeToMs(line.startTime) / 1000;
            const endTime = srtTimeToMs(line.endTime) / 1000;
            const x = startTime * pixelsPerSecond;
            const width = (endTime - startTime) * pixelsPerSecond;

            if (line.id === activeSrtLineId) {
                // Active: Yellow with higher opacity and border
                ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
                ctx.fillRect(x, TIMELINE_HEIGHT, width, WAVEFORM_HEIGHT);
                
                // Add border for active region
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, TIMELINE_HEIGHT, width, WAVEFORM_HEIGHT);
            } else {
                // Inactive: Blue with low opacity
                ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
                ctx.fillRect(x, TIMELINE_HEIGHT, width, WAVEFORM_HEIGHT);
            }
        });

        playheadCtx.clearRect(0, 0, canvasWidth, TOTAL_HEIGHT);
        const playheadX = (currentTime / duration) * canvasWidth;
        playheadCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        playheadCtx.fillRect(playheadX, 0, 1.5, TOTAL_HEIGHT);
        
        const scrollLeft = container.scrollLeft;
        const clientWidth = container.clientWidth;
        const buffer = 50;
        if (playheadX < scrollLeft + buffer || playheadX > scrollLeft + clientWidth - buffer) {
             container.scrollLeft = playheadX - clientWidth / 2;
        }

    }, [peakData, duration, zoom, srtLines, activeSrtLineId, currentTime]);

    useEffect(() => {
        draw();
        const container = containerRef.current;
        if (!container) return;
        
        const resizeObserver = new ResizeObserver(() => {
            // Wrap in requestAnimationFrame to avoid "ResizeObserver loop completed with undelivered notifications" error
            requestAnimationFrame(() => {
                draw();
            });
        });
        
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, [draw]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        const newZoom = Math.max(1, Math.min(zoom + delta * zoom, 100));
        
        const container = containerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const timeAtMouse = ((container.scrollLeft + mouseX) / (rect.width * zoom)) * duration;
            
            onZoomChange(newZoom);
            
            requestAnimationFrame(() => {
                const newScrollLeft = (timeAtMouse / duration) * (rect.width * newZoom) - mouseX;
                container.scrollLeft = newScrollLeft;
            });
        }
    };
    
    const getEventTime = (e: React.MouseEvent<HTMLDivElement>): number => {
        const container = containerRef.current;
        if (!container || duration === 0) return 0;
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const totalWidth = rect.width * zoom;
        return ((container.scrollLeft + x) / totalWidth) * duration;
    };

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        onSeek(getEventTime(e));
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        setHoverTime(getEventTime(e));
    };
    
    const handleMouseLeave = () => {
        setHoverTime(null);
    };

    return (
        <div 
            ref={containerRef} 
            className="w-full h-[100px] bg-gray-800 rounded-md overflow-x-auto relative cursor-pointer select-none"
            onWheel={handleWheel}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <div className="relative" style={{ width: `${zoom * 100}%`, height: `${TOTAL_HEIGHT}px` }}>
                <canvas ref={mainCanvasRef} className="absolute top-0 left-0" />
                <canvas ref={playheadCanvasRef} className="absolute top-0 left-0 pointer-events-none" />
            </div>
            {hoverTime !== null && (
                 <div className="absolute bottom-2 left-2 p-1 bg-black/50 text-white text-xs font-mono rounded pointer-events-none">
                    {msToSrtTime(hoverTime * 1000)}
                </div>
            )}
        </div>
    );
};