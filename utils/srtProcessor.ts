export interface WordTimestamp {
  word: string
  start: number
}

export interface SrtEntry {
  index: number
  startTime: string
  endTime: string
  text: string
  matched: boolean
}

export interface ValidationResult {
  success: boolean
  totalLines: number
  matchedLines: number
  missingLines: number[]
  missingChunks: number[]
  details: string
}

/**
 * Seconds to SRT time format (00:00:00,000)
 */
export const secondsToSrtTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

/**
 * Assemble SRT entries by matching word timestamps to original script lines.
 * Uses strict 1:1 mapping with the original text.
 */
export const assembleSrtFromTimestamps = (
  originalLines: string[],
  wordTimestamps: WordTimestamp[]
): SrtEntry[] => {
  const srtEntries: SrtEntry[] = []
  // Clone timestamps to avoid mutation of the input array if used elsewhere
  const availableTimestamps = [...wordTimestamps]

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i].trim()
    if (!line) continue

    // Extract first significant word for matching (remove punctuation)
    const firstWordMatch = line.match(/([가-힣a-zA-Z0-9]+)/)
    const firstWord = firstWordMatch
      ? firstWordMatch[0]
      : line.split(/\s+/)[0].replace(/[,."'!?""''…]/g, '')

    if (!firstWord) {
      // Line with only symbols? Treat as unmatched or skip
      srtEntries.push({
        index: srtEntries.length + 1,
        startTime: '00:00:00,000',
        endTime: '00:00:00,000',
        text: line,
        matched: false,
      })
      continue
    }

    // Find matching timestamp
    // Relaxed matching: allows partial match or fuzzy match if needed
    const matchIndex = availableTimestamps.findIndex(
      w => w.word.includes(firstWord) || firstWord.includes(w.word)
    )

    if (matchIndex !== -1) {
      const match = availableTimestamps[matchIndex]

      // Determine end time: start of next timestamp or +3 seconds default
      // We search in the *original* sorted array or just look ahead in available?
      // Better to look at the *next* available timestamp in time order.
      // But availableTimestamps is being spliced.
      // Let's use the match's start time and find the next one in the *original* context?
      // For simplicity, we assume strictly sequential processing.

      // Find the immediate next timestamp in the remaining list (which should be time-sorted)
      // But splice removes it. So we strictly look for next entry in available list?
      // No, the list might be mixed if we match out of order.
      // Assumption: wordTimestamps is sorted by time.

      // Simple heuristic for end time:
      // 1. If there is a next timestamp in list, use its start time - 0.01s.
      // 2. Max duration 5s.
      let endTimeSeconds = match.start + 3 // Default 3s duration

      // Try to find the next timestamp that is chronologically after this one
      // We can peep at availableTimestamps[matchIndex + 1] assuming they are sorted.
      // But since we splice, we need to be careful.
      // Actually, we should look at the *next* word's timestamp if we can find it.
      // Or just use a fixed duration since user didn't specify strict end time logic.
      // User code suggestion: `const nextMatch = wordTimestamps.find(w => w.start > match.start);`
      const nextMatch = availableTimestamps.find(w => w.start > match.start)
      if (nextMatch) {
        endTimeSeconds = Math.min(nextMatch.start - 0.01, match.start + 5) // Cap at 5s duration
      }

      srtEntries.push({
        index: srtEntries.length + 1,
        startTime: secondsToSrtTime(match.start),
        endTime: secondsToSrtTime(endTimeSeconds),
        text: line, // ★ Use ORIGINAL text
        matched: true,
      })

      // ★ Remove used timestamp to prevent double matching
      availableTimestamps.splice(matchIndex, 1)
    } else {
      // Match failed
      srtEntries.push({
        index: srtEntries.length + 1,
        startTime: '00:00:00,000',
        endTime: '00:00:00,000',
        text: line,
        matched: false, // Marked for regeneration/warning
      })
    }
  }

  return srtEntries
}

/**
 * Validate the assembled SRT.
 */
export const validateSrt = (
  originalLines: string[],
  srtEntries: SrtEntry[],
  totalDurationSeconds: number,
  chunkDuration: number = 180
): ValidationResult => {
  const missingLines: number[] = []
  const missingChunks = new Set<number>()

  srtEntries.forEach((entry, idx) => {
    if (!entry.matched) {
      missingLines.push(idx + 1)

      // Estimate which chunk this line belongs to
      // Check if we can infer from neighbors?
      // Or use simple linear interpolation.
      const estimatedTime = (idx / originalLines.length) * totalDurationSeconds
      const chunkIndex = Math.floor(estimatedTime / chunkDuration)
      missingChunks.add(chunkIndex)
    }
  })

  const matchedLines = srtEntries.filter(e => e.matched).length

  return {
    success: missingLines.length === 0,
    totalLines: originalLines.length,
    matchedLines,
    missingLines,
    missingChunks: Array.from(missingChunks).sort((a, b) => a - b),
    details:
      missingLines.length === 0
        ? '✅ 모든 줄 매칭 성공'
        : `❌ ${missingLines.length}줄 누락 (청크 ${Array.from(missingChunks)
            .sort((a, b) => a - b)
            .join(', ')})`,
  }
}
