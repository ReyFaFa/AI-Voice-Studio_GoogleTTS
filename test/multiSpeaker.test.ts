import { describe, expect, it } from 'vitest'
import { MultiSpeakerConfig, ScriptLine } from '../types'
import {
  formatScriptLinesForTts,
  normalizeMultiSpeakerConfig,
  parseSpeakerLine,
  splitMultiSpeakerTextIntoChunks,
  stripSpeakerPrefix,
  validateMultiSpeakerConfig,
} from '../utils/multiSpeaker'

const config: MultiSpeakerConfig = {
  speakers: [
    { id: 'speaker1', name: '민수', voiceId: 'Puck' },
    { id: 'speaker2', name: '영희', voiceId: 'Kore' },
  ],
}

describe('multi-speaker helpers', () => {
  it('normalizes malformed stored configuration to two safe defaults', () => {
    expect(normalizeMultiSpeakerConfig({ speakers: [{ name: '민수' }] })).toEqual({
      speakers: [
        { id: 'speaker1', name: '민수', voiceId: '' },
        { id: 'speaker2', name: '화자2', voiceId: '' },
      ],
    })
  })

  it('requires distinct names and voices', () => {
    expect(validateMultiSpeakerConfig(config)).toBeNull()
    expect(
      validateMultiSpeakerConfig({
        speakers: [config.speakers[0], { ...config.speakers[1], voiceId: 'Puck' }],
      })
    ).toContain('서로 다른 목소리')
  })

  it('parses configured speaker labels and removes them from the spoken line text', () => {
    expect(parseSpeakerLine('영희: 네, 시작해요.', config)).toEqual({
      text: '네, 시작해요.',
      speakerId: 'speaker2',
    })
    expect(parseSpeakerLine('화자1： 좋습니다.', config)).toEqual({
      text: '좋습니다.',
      speakerId: 'speaker1',
    })
  })

  it('formats API transcript labels while keeping subtitle text label-free', () => {
    const lines: ScriptLine[] = [
      { id: '1', speakerId: 'speaker1', text: '안녕하세요.' },
      { id: '2', speakerId: 'speaker2', text: '반가워요.' },
    ]
    const transcript = formatScriptLinesForTts(lines, 'multi', config)

    expect(transcript).toBe('민수: 안녕하세요.\n영희: 반가워요.')
    expect(stripSpeakerPrefix('영희: 반가워요.', config)).toBe('반가워요.')
  })

  it('preserves a speaker label on every long-dialogue chunk fragment', () => {
    const chunks = splitMultiSpeakerTextIntoChunks(
      '민수: 첫 번째 문장입니다. 두 번째 문장은 더 깁니다. 세 번째 문장입니다.\n영희: 네, 확인했습니다.',
      32,
      2,
      60
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flatMap(chunk => chunk.split('\n'))).toSatisfy(
      lines => lines.every(line => /^(?:민수|영희): /.test(line))
    )
  })
})
