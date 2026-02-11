# AI Voice Studio - 개발 가이드

## 🚀 빠른 시작

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview
```

## 🧪 테스트

```bash
# 테스트 실행
npm test

# 테스트 UI 모드
npm run test:ui

# 커버리지 확인
npm run test:coverage
```

## 🔍 코드 품질

```bash
# 타입 체크
npm run typecheck

# 린트 검사
npm run lint

# 린트 자동 수정
npm run lint:fix

# 코드 포맷팅
npm run format

# 포맷팅 확인
npm run format:check

# 전체 검사 (타입+린트+포맷)
npm run check
```

## 📁 프로젝트 구조

```
.
├── components/          # React 컴포넌트
│   ├── __tests__/      # 컴포넌트 테스트
│   ├── AudioPlayer.tsx
│   ├── Header.tsx
│   ├── MainContent.tsx
│   └── ...
├── services/           # API 서비스
│   └── geminiService.ts
├── utils/              # 유틸리티 함수
├── test/               # 테스트 설정
│   └── setup.ts
├── App.tsx             # 메인 앱 컴포넌트
└── index.tsx           # 엔트리 포인트
```

## 🛠️ 개발 도구

### 설치된 도구들

- **TypeScript** - 타입 안정성
- **ESLint** - 코드 품질 검사
- **Prettier** - 코드 포맷팅
- **Vitest** - 빠른 단위 테스트
- **Testing Library** - React 컴포넌트 테스트

### VSCode 추천 확장

- ESLint
- Prettier
- Vitest Explorer
- TypeScript Next

## 📝 코딩 규칙

### TypeScript

- `any` 사용 최소화 (경고로 설정됨)
- 사용하지 않는 변수는 `_` 접두사 사용
- 명시적 타입 선언 권장

### React

- 함수형 컴포넌트 사용
- Hooks 규칙 준수
- 컴포넌트는 기본적으로 memo 없이 작성

### 스타일

- 세미콜론 미사용
- 싱글 쿼트 사용
- 탭 너비: 2칸
- 최대 줄 길이: 100자

## 🧪 테스트 작성 가이드

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import YourComponent from '../YourComponent'

describe('YourComponent', () => {
  it('should render correctly', () => {
    render(<YourComponent />)
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })
})
```

## 🔧 설정 파일

- `vite.config.ts` - Vite 빌드 설정
- `vitest.config.ts` - Vitest 테스트 설정
- `tsconfig.json` - TypeScript 설정
- `eslint.config.js` - ESLint 규칙
- `.prettierrc.json` - Prettier 포맷팅 규칙

## 📦 주요 의존성

### Runtime

- React 19
- @google/genai - Gemini API
- react-dropzone - 파일 드래그앤드롭
- jszip - 파일 압축

### Development

- Vite - 빌드 도구
- TypeScript - 타입 시스템
- ESLint - 린터
- Prettier - 포맷터
- Vitest - 테스트 프레임워크

## 🎯 개발 워크플로우

1. **기능 개발**

   ```bash
   npm run dev  # 개발 서버 시작
   ```

2. **코드 작성**
   - VSCode가 자동으로 저장 시 포맷팅 & 린트 수정

3. **테스트 작성**

   ```bash
   npm run test:ui  # 테스트 UI에서 확인
   ```

4. **코드 검증**

   ```bash
   npm run check  # 전체 검사
   ```

5. **빌드 & 미리보기**
   ```bash
   npm run build
   npm run preview
   ```

## 🐛 문제 해결

### ESLint 오류

```bash
npm run lint:fix  # 자동 수정 시도
```

### 타입 오류

```bash
npm run typecheck  # 타입 오류 확인
```

### 테스트 실패

```bash
npm run test:ui  # UI에서 디버깅
```

## 📚 추가 자료

- [Vite 문서](https://vitejs.dev/)
- [React 문서](https://react.dev/)
- [Vitest 문서](https://vitest.dev/)
- [Testing Library 문서](https://testing-library.com/)
