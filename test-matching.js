// 간단한 매칭 테스트
const fs = require('fs');

// 파일 읽기
const capcut = fs.readFileSync('d:/01_Antigravity/12_AI-Voice-Studio/개발문서/capcut.srt', 'utf8');
const original = fs.readFileSync('d:/01_Antigravity/12_AI-Voice-Studio/개발문서/01_Full_Script-자막분할.txt', 'utf8');

// 간단한 통계
const capcutLines = capcut.split('\n').filter(l => l.match(/^\d+$/)).length;
const originalLines = original.split('\n').filter(l => l.match(/^\d+$/)).length;

console.log('캡컷 자막:', capcutLines, '개');
console.log('원본 자막:', originalLines, '개');
console.log('비율:', (capcutLines / originalLines).toFixed(2));
