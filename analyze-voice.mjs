/**
 * 오디오 파일을 Gemini API로 분석해 TTS 스타일 프롬프트 생성
 * 사용법: node analyze-voice.mjs <WAV파일경로> <API_KEY>
 */
import { readFileSync } from 'fs'
import { basename } from 'path'

const [,, wavPath, apiKey] = process.argv

if (!wavPath || !apiKey) {
  console.error('사용법: node analyze-voice.mjs <WAV파일경로> <API_KEY>')
  console.error('예시: node analyze-voice.mjs "./개발문서/한편 이 고을을 쥐락펴락.wav" AIza...')
  process.exit(1)
}

console.log(`\n분석 중: ${basename(wavPath)}\n`)

const audioBytes = readFileSync(wavPath)
const base64Audio = audioBytes.toString('base64')

const requestBody = {
  contents: [{
    role: 'user',
    parts: [
      {
        inlineData: {
          mimeType: 'audio/wav',
          data: base64Audio
        }
      },
      {
        text: `이 오디오 파일의 목소리 특성을 분석해주세요.

다음 항목을 한국어로 상세히 분석해주세요:

1. **음역대 / 음고**: 저음/중음/고음 여부, 구체적인 음역 특성
2. **톤 & 질감**: 부드러운지/거친지, 공명감, 따뜻함/차가움
3. **말하기 속도**: 느린/보통/빠른 (예: 0.8x, 1.0x, 1.2x 등)
4. **감정적 색채**: 차분한/극적인/친근한/권위적인/기타
5. **낭독 스타일**: 내레이터형/드라마형/대화형/중립형
6. **특이사항**: 억양 패턴, 감정 표현 방식, 강약 특성

분석 후, 이 목소리를 재현하기 위한 **TTS 스타일 프롬프트**를 영어로 작성해주세요.
프롬프트는 gemini-2.5-pro-preview-tts 모델에 직접 사용할 수 있는 형식으로, 2~4문장 이내로 작성해주세요.`
      }
    ]
  }],
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 2048
  }
}

try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  )

  const data = await response.json()

  if (!response.ok) {
    console.error('API 에러:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (text) {
    console.log('='.repeat(60))
    console.log(text)
    console.log('='.repeat(60))
  } else {
    console.error('응답 파싱 실패:', JSON.stringify(data, null, 2))
  }
} catch (err) {
  console.error('에러:', err.message)
}
