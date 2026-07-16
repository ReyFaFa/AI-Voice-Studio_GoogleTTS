const text = `"대감마님, 제발 그 가마에 오르지 마옵소서."
"그 가마에 오르시면 죽습니다."`;

// The regex I put in Header.tsx:
const rawSentences = text.match(/[^.!?\n]+[.!?\n]*["'”’\])]*\s*/g) || [text];

console.log("rawSentences:", JSON.stringify(rawSentences, null, 2));

const finalChunks = [];
let currentChunk = '';
for (const sentence of rawSentences) {
  const trimmedSentence = sentence.trim();
  const separator = currentChunk ? '\n' : '';
  currentChunk += separator + trimmedSentence;
}
if (currentChunk.length > 0) finalChunks.push(currentChunk);

console.log("finalChunks:", JSON.stringify(finalChunks, null, 2));
