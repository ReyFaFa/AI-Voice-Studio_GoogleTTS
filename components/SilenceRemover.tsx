import React from 'react';
import { TrashIcon } from '../constants';

interface SilenceRemoverProps {
    segments: { start: number; end: number }[];
    onRemove: (segmentsToRemove: { start: number; end: number }[]) => void;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(6, '0')}`;
};

export const SilenceRemover: React.FC<SilenceRemoverProps> = ({ segments, onRemove }) => {
    
    const handleRemoveAll = () => {
        onRemove(segments);
    };

    const handleRemoveSingle = (segment: { start: number; end: number }) => {
        onRemove([segment]);
    };
    
    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-bold text-white">
                    감지된 무음 구간 ({segments.length}개)
                </h3>
                <button 
                    onClick={handleRemoveAll}
                    className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-3 rounded-md hover:bg-red-700 transition-colors text-sm"
                >
                    <TrashIcon className="w-4 h-4" />
                    <span>모두 제거</span>
                </button>
            </div>
            <div className="max-h-48 overflow-y-auto pr-2 -mr-2 text-sm space-y-2">
                {segments.map((segment, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-800 p-2 rounded-md">
                        <div className="font-mono text-gray-300">
                            {formatTime(segment.start)}
                            <span className="text-gray-500 mx-2">-&gt;</span>
                            {formatTime(segment.end)}
                            <span className="text-yellow-400 ml-3">
                                ({(segment.end - segment.start).toFixed(2)}s)
                            </span>
                        </div>
                        <button
                            onClick={() => handleRemoveSingle(segment)}
                            className="text-gray-500 hover:text-red-500 transition-colors"
                            aria-label={`무음 구간 ${index + 1} 제거`}
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
