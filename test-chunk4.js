const text = `"대감마님, 제발 그 가마에 오르지 마옵소서."
"그 가마에 오르시면 죽습니다."

"먹으면 안 된다, 쓴풀 냄새가 난다, 배가 뒤틀려 죽을 수도 있다."

"영감, 나는 왜 냄새를 이렇게 잘 맡아요."

"아닙니다. 저 냄새를 맡으면 사람이 죽습니다. 제발 타지 마옵소서."`;

// The regex I put in Header.tsx:
const rawSentences = text.match(/[^.!?\n]+[.!?\n]*["'”’\])]*\s*/g) || [text];

console.log("rawSentences:");
rawSentences.forEach((s, i) => console.log(`[${i}]: ${JSON.stringify(s)}`));

const finalChunks = [];
let currentChunk = '';
for (const sentence of rawSentences) {
  const trimmedSentence = sentence.trim();
  if (trimmedSentence.length === 0) continue;
  const separator = currentChunk ? '\n' : '';
  currentChunk += separator + trimmedSentence;
}
if (currentChunk.length > 0) finalChunks.push(currentChunk);

console.log("\nfinalChunks output:");
console.log(finalChunks[0]);

