기술 작업지시서: Gemini 2.5 TTS 기능 고도화
이 문서는 AI Voice Studio 프로젝트를 Google AI Studio 환경에서 고도화하기 위한 핵심 로직 변경 및 UI 구성 지침을 담고 있습니다.

1. 개요
기존의 고정된 TTS 설정을 사용자가 직접 제어할 수 있도록 확장합니다.

모델 선택: Gemini 2.5 Pro (고품질) vs Gemini 2.5 Flash (가성비)
스타일 제어: 프롬프트 입력을 통한 음성 톤, 감정, 캐릭터 설정(Director's Notes)
2. 서비스 레이어 수정 (geminiService.ts)
기존 ttsModelName 상수를 제거하고, 생성 함수가 모델명과 스타일 프롬프트를 인자로 받도록 수정합니다.

2.1. 인터페이스 변경
async function _generateAudio(
    prompt: string, 
    modelName: string,       // 추가: 사용자가 선택한 모델명
    speechConfig: SpeechConfig, 
    speed: number, 
    stylePrompt?: string,    // 추가: 사용자가 입력한 스타일 가이드
    signal?: AbortSignal
): Promise<string>
2.2. 프롬프트 구성 로직 (Steerability 극대화)
단순 발화가 아니라, 모델이 '지시사항'을 인지하고 목소리에 반영하도록 텍스트를 구성합니다.

let finalPrompt = prompt;
const instructions: string[] = [];
// 1. 스타일 지시사항 추가
if (stylePrompt) instructions.push(`Style/Tone: ${stylePrompt}`);
// 2. 속도 지시사항 추가
if (speed !== 1.0) instructions.push(`Speed: ${speed}x`);
// 3. 시스템 지시어와 대본 결합
if (instructions.length > 0) {
    finalPrompt = `[Instructions]\n${instructions.join('\n')}\n\n[Text to Read]\n${prompt}`;
}
// 4. 요청 모델명을 modelName 변수로 교체
const response = await ai.models.generateContent({
  model: modelName, 
  contents: [{ parts: [{ text: finalPrompt }] }],
  config: { responseModalities: [Modality.AUDIO], speechConfig }
}, { signal });
3. UI 및 상태 관리 수정 (App.tsx / MainContent.tsx)
3.1. 상태 값 추가
const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-preview-tts');
const [stylePrompt, setStylePrompt] = useState<string>(''); // Director's Notes용
3.2. UI 컴포넌트 추가 제안
사용자 경험(UX) 향상을 위해 다음 요소를 UI에 배치합니다:

Model Selector: Radio 그룹 또는 Toggle Switch (Pro vs Flash 선택)
Director's Notes: 멀티라인 Input창 (예: "차분하고 품격 있는 60대 여성 성우 목소리, 사극 톤으로 나레이션")
Voice Favorites (추가):
각 보이스 옆에 별표(★) 아이콘 추가.
즐겨찾기 클릭 시 로컬 스토리지에 저장하고, 리스트 최상단에 노출.
4. 보이스 즐겨찾기 로직 (Favorites Logic)
보이스 리스트가 길어 발생하는 불편함을 해소하기 위해 즐겨찾기 기능을 구현합니다.

4.1. 상태 관리 및 로컬 저장
const [favorites, setFavorites] = useState<string[]>(
    JSON.parse(localStorage.getItem('voice_favorites') || '[]')
);
const toggleFavorite = (voiceId: string) => {
    setFavorites(prev => {
        const next = prev.includes(voiceId) 
            ? prev.filter(id => id !== voiceId) 
            : [...prev, voiceId];
        localStorage.setItem('voice_favorites', JSON.stringify(next));
        return next;
    });
};
4.2. 정렬 로직 (Sorting)
표시할 보이스 리스트를 즐겨찾기된 항목이 앞으로 오도록 정렬합니다.

const sortedVoices = useMemo(() => {
    return [...VOICES].sort((a, b) => {
        const aFav = favorites.includes(a.id);
        const bFav = favorites.includes(b.id);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return 0;
    });
}, [favorites]);
5. 검증 및 팁
** Pro 모델 활용**: 롱폼 콘텐츠의 경우 비용이 조금 더 들더라도 Gemini 2.5 Pro 모델을 선택해야 프롬프트 지시사항(스타일)이 목소리에 훨씬 더 정교하게 반영됩니다.
프롬프트 꿀팁: 스타일 프롬프트 입력 시 [laughing], [whispering] 같은 태그를 대본 중간에 섞어 쓰면 더 생생한 연출이 가능합니다.
비용 효율: 초안 단계에서는 Flash 모델로 테스트하고, 최종 렌더링 시에만 Pro 모델을 사용하는 워크플로우를 권장합니다.