# AI Learning Crew - Challenge Tracking & AI Share Platform

생성형 AI(ChatGPT, Claude, Gemini 등)와의 대화 공유 링크를 기반으로 챌린지를 인증하고, 크루원들 간에 우수한 프롬프트와 인사이트를 공유하는 스터디 인증 플랫폼입니다.

---

## 📌 주요 특징

1. **토큰 소모 0원 (링크 기반 자동 인증)**:
   - 비싼 LLM 심사 API 호출 대신, 생성형 AI의 공식 공유 링크(URL) 패턴을 정규식으로 검증하여 **API 비용 0원** 및 **실시간 즉시 인증(합격)**을 제공합니다.
2. **크루원 대화 공유 피드 (Peer Learning)**:
   - 제출된 대화 공유 링크를 UI 상에 직관적인 뱃지와 함께 노출하여, 크루원들이 서로의 프롬프트와 AI 답변을 열어보고 벤치마킹할 수 있습니다.
3. **10만 원 리셋 보안 잠금**:
   - 보증금 초기화 버튼에 **관리자 PIN 번호 인증(기본: 1234)**을 적용하여 무단 초기화를 방지했습니다.
4. **Supabase 자동 패널티 트리거**:
   - 일일 과제 미제출/실패(`'X'`) 시 PostgreSQL 트리거가 2,000원을 자동으로 차감하고 패널티 횟수를 기록합니다.

---

## 🔗 지원되는 생성형 AI 공유 링크 형식

- **ChatGPT**: `https://chatgpt.com/share/...` 또는 `https://chat.openai.com/share/...`
- **Claude**: `https://claude.ai/share/...`
- **Google Gemini**: `https://gemini.google.com/share/...`
- **Perplexity**: `https://www.perplexity.ai/search/...` 또는 `https://perplexity.ai/page/...`
- **v0.dev**: `https://v0.dev/chat/...`
- **Poe**: `https://poe.com/s/...`

---

## 🚀 빠른 시작

### 1. 웹 대시보드 실행
`index.html` 파일을 더블 클릭하여 브라우저에서 바로 열거나, Node.js 내장 서버를 실행할 수 있습니다:

```bash
node server.js
```
브라우저에서 `http://localhost:3000`으로 접속합니다.

### 2. 관리자 설정
- **기본 관리자 PIN**: `1234`
  - `index.html`의 `CONFIG.ADMIN_PIN` 변수에서 원하는 PIN으로 변경할 수 있습니다.
