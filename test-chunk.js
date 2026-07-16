const text = `"영감이 잃어버리면 죽는다고 했습니다."
"예."
"거짓이 없습니다."
"어제보다 냄새가 더 심합니다."
"여기를 풀어야 합니다."
"이건 향이 아닙니다.
사람 숨을 막는 독입니다.
바늘로 먼저 살에 스미게 하고, 더운 기운이 오르면 향낭에서 독내가 퍼집니다."
"냄새가 같기 때문입니다.
오래전 누군가도 그 냄새를 맡고 죽었습니다."
"제 할아버지라 들었습니다.
저는 얼굴도 모릅니다.
영감이 말씀하셨습니다.
좋은 약을 만들던 분이었는데, 나쁜 사람들이 죄를 뒤집어씌우고 죽게 했다고."
"죽는 냄새를 아는데도 모른 척하면, 꿈에서 영감이 울 것 같아서요."
"영감이 있는 곳이 제 집입니다."
"나쁜 사람은 다 독 냄새가 나면 좋겠어요.
그러면 바로 알아차릴 텐데."
"영감, 제 진짜 이름은 무엇입니까."
"예전보다 더 많이 맡습니다.
그런데 이제는 살리는 냄새도 조금씩 배웁니다."`;

const maxLength = 800;
const maxLines = 35;
const maxEstimatedSeconds = 130;

const splitTextIntoChunks = (
  text,
  maxLength,
  maxLines = 15,
  maxEstimatedSeconds = 60
) => {
  if (maxLength <= 0) return [text]

  const rawSentences = text.match(/[^.!?\n]+[.!?\n]*["'”’\])]*\s*/g) || [text]
  const finalChunks = []
  let currentChunk = ''
  let currentLineCount = 0
  let currentEstimatedSeconds = 0

  for (const sentence of rawSentences) {
    const trimmedSentence = sentence.trim()
    if (trimmedSentence.length === 0) continue

    const linesInSentence = (sentence.match(/\n/g) || []).length || 1
    const sentenceCharCountNoSpaces = trimmedSentence.replace(/\s/g, '').length
    const sentenceEstimatedSeconds = sentenceCharCountNoSpaces * 0.156

    if (trimmedSentence.length > maxLength || sentenceEstimatedSeconds > maxEstimatedSeconds) {
       // ... fallback ...
    } else {
      const separator = currentChunk ? '\n' : ''
      const isLengthOk = (currentChunk + separator + trimmedSentence).length <= maxLength
      const isLinesOk = currentLineCount + linesInSentence <= maxLines
      const isTimeOk = currentEstimatedSeconds + sentenceEstimatedSeconds <= maxEstimatedSeconds

      if (isLengthOk && isLinesOk && isTimeOk) {
        currentChunk += separator + trimmedSentence
        currentLineCount += linesInSentence
        currentEstimatedSeconds += sentenceEstimatedSeconds
      } else {
        if (currentChunk.length > 0) {
          finalChunks.push(currentChunk)
        }
        currentChunk = trimmedSentence
        currentLineCount = linesInSentence
        currentEstimatedSeconds = sentenceEstimatedSeconds
      }
    }
  }

  if (currentChunk.length > 0) {
    finalChunks.push(currentChunk)
  }

  return finalChunks
}

console.log(splitTextIntoChunks(text, maxLength, maxLines, maxEstimatedSeconds).length);
console.log(splitTextIntoChunks(text, maxLength, maxLines, maxEstimatedSeconds));
