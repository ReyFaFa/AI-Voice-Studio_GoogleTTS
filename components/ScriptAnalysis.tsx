import React from 'react';

interface ScriptAnalysisProps {
    analysisData: {
        charCount: number;
        charCountNoSpaces: number;
        wordCount: number;
        sentenceCount: number;
        lineCount: number;
        paragraphCount: number;
        uniqueWordCount: number;
        readTime: number;
        analysis: {
            hangul: number;
            english: number;
            numbers: number;
            spaces: number;
            symbols: number;
            total: number;
        };
        topWords: [string, number][];
        topBigrams: [string, number][];
        topTrigrams: [string, number][];
    };
}

const StatItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="flex justify-between items-baseline text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono font-semibold text-gray-200">{value}</span>
    </div>
);

const CharacterBar: React.FC<{ analysis: ScriptAnalysisProps['analysisData']['analysis'] }> = ({ analysis }) => {
    const { hangul, english, numbers, symbols, spaces, total } = analysis;
    if (total === 0) return null;

    const segments = [
        { value: hangul, color: 'bg-sky-500', label: '한글' },
        { value: english, color: 'bg-emerald-500', label: '영문' },
        { value: numbers, color: 'bg-amber-500', label: '숫자' },
        { value: symbols, color: 'bg-rose-500', label: '기호' },
        { value: spaces, color: 'bg-slate-500', label: '공백' },
    ].filter(s => s.value > 0);

    return (
        <div>
            <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-gray-900 mt-2">
                {segments.map((seg, index) => (
                    <div
                        key={index}
                        className={seg.color}
                        style={{ width: `${(seg.value / total) * 100}%` }}
                        title={`${seg.label}: ${seg.value} (${((seg.value / total) * 100).toFixed(1)}%)`}
                    />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
                {segments.map((seg, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${seg.color}`} />
                        <span className="text-gray-400">{seg.label}:</span>
                        <span className="font-mono text-gray-300">{seg.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FrequencyList: React.FC<{ title: string; data: [string, number][] }> = ({ title, data }) => {
    if (data.length === 0) return null;
    return (
        <div className="pt-3 mt-3 border-t border-gray-700">
            <h4 className="font-semibold text-gray-300 text-sm mb-2">{title}</h4>
            <ul className="space-y-1">
                {data.map(([item, count]) => (
                    <li key={item} className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded">{item}</span>
                        <span className="font-mono text-gray-300">{count.toLocaleString()}회</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};


export const ScriptAnalysis: React.FC<ScriptAnalysisProps> = ({ analysisData }) => {
    const {
        charCount, charCountNoSpaces, wordCount, sentenceCount, lineCount,
        paragraphCount, uniqueWordCount, readTime, analysis,
        topWords, topBigrams, topTrigrams
    } = analysisData;

    const formatReadTime = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        const parts = [];
        if (minutes > 0) {
            parts.push(`${minutes}분`);
        }
        if (seconds > 0 || minutes === 0) {
            parts.push(`${seconds}초`);
        }
        
        return parts.join(' ') || '0초';
    };

    return (
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 h-full flex flex-col text-white">
            <h3 className="text-lg font-bold mb-4">스크립트 분석</h3>
            <div className="space-y-2 flex-grow overflow-y-auto pr-2 -mr-2">
                <StatItem label="글자 수" value={charCount.toLocaleString()} />
                <StatItem label="공백 제외 글자 수" value={charCountNoSpaces.toLocaleString()} />
                <StatItem label="단어 수" value={wordCount.toLocaleString()} />
                <StatItem label="문장 수" value={sentenceCount.toLocaleString()} />
                <StatItem label="줄 수" value={lineCount.toLocaleString()} />
                <StatItem label="문단 수" value={paragraphCount.toLocaleString()} />
                <StatItem label="고유 단어 수" value={uniqueWordCount.toLocaleString()} />
                <StatItem label="읽기 시간" value={formatReadTime(readTime)} />

                <div className="pt-3 mt-3 border-t border-gray-700">
                    <h4 className="font-semibold text-gray-300 text-sm mb-1">문자 유형 분석</h4>
                    {analysis.total > 0 ? (
                        <CharacterBar analysis={analysis} />
                    ) : (
                        <p className="text-xs text-gray-500 text-center mt-4">분석할 텍스트가 없습니다.</p>
                    )}
                </div>
                
                <FrequencyList title="가장 많이 사용된 단어" data={topWords} />
                <FrequencyList title="자주 사용된 2단어 구문" data={topBigrams} />
                <FrequencyList title="자주 사용된 3단어 구문" data={topTrigrams} />
            </div>
        </div>
    );
};