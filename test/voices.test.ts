import { describe, expect, it } from 'vitest'
import { VOICES } from '../constants'

const OFFICIAL_FEMALE_VOICES = [
  'Achernar',
  'Aoede',
  'Autonoe',
  'Callirrhoe',
  'Despina',
  'Erinome',
  'Gacrux',
  'Kore',
  'Laomedeia',
  'Leda',
  'Pulcherrima',
  'Sulafat',
  'Vindemiatrix',
  'Zephyr',
]

const OFFICIAL_MALE_VOICES = [
  'Achird',
  'Algenib',
  'Algieba',
  'Alnilam',
  'Charon',
  'Enceladus',
  'Fenrir',
  'Iapetus',
  'Orus',
  'Puck',
  'Rasalgethi',
  'Sadachbia',
  'Sadaltager',
  'Schedar',
  'Umbriel',
  'Zubenelgenubi',
]

const OFFICIAL_TRAITS: Record<string, string> = {
  Zephyr: 'Bright',
  Puck: 'Upbeat',
  Charon: 'Informative',
  Kore: 'Firm',
  Fenrir: 'Excitable',
  Leda: 'Youthful',
  Orus: 'Firm',
  Aoede: 'Breezy',
  Callirrhoe: 'Easy-going',
  Autonoe: 'Bright',
  Enceladus: 'Breathy',
  Iapetus: 'Clear',
  Umbriel: 'Easy-going',
  Algieba: 'Smooth',
  Despina: 'Smooth',
  Erinome: 'Clear',
  Algenib: 'Gravelly',
  Rasalgethi: 'Informative',
  Laomedeia: 'Upbeat',
  Achernar: 'Soft',
  Alnilam: 'Firm',
  Schedar: 'Even',
  Gacrux: 'Mature',
  Pulcherrima: 'Forward',
  Achird: 'Friendly',
  Zubenelgenubi: 'Casual',
  Vindemiatrix: 'Gentle',
  Sadachbia: 'Lively',
  Sadaltager: 'Knowledgeable',
  Sulafat: 'Warm',
}

describe('Gemini TTS voice metadata', () => {
  it('matches the official 30-voice gender list', () => {
    expect(VOICES).toHaveLength(30)
    expect(
      VOICES.filter(voice => voice.gender === 'female')
        .map(voice => voice.id)
        .sort()
    ).toEqual([...OFFICIAL_FEMALE_VOICES].sort())
    expect(
      VOICES.filter(voice => voice.gender === 'male')
        .map(voice => voice.id)
        .sort()
    ).toEqual([...OFFICIAL_MALE_VOICES].sort())
  })

  it('keeps every official voice trait visible in the UI description', () => {
    expect(Object.keys(OFFICIAL_TRAITS)).toHaveLength(30)
    for (const voice of VOICES) {
      expect(voice.description).toContain(`(${OFFICIAL_TRAITS[voice.id]})`)
    }
  })
})
