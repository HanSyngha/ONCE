# ONCE Quick-Add API

외부 스크립트나 도구에서 ONCE 개인 공간에 노트/Todo/검색 기능을 사용할 수 있는 API입니다.
**인증 없이** 사용 가능하며, `loginid`로 사용자를 식별합니다.

> ⚠️ OAuth 로그인 이력이 있는 사용자만 사용 가능합니다.

---

## API 목록

| # | 엔드포인트 | 메서드 | 설명 |
|---|-----------|--------|------|
| 1 | `/quick-add` | POST | 노트 추가 (AI 자동 정리) |
| 2 | `/quick-add/todo` | POST | Todo 추가 |
| 3 | `/quick-add/search` | GET | AI 검색 |
| 4 | `/quick-add/todos` | GET | Todo 목록 조회 |
| 5 | `/quick-add/todos` | PATCH | Todo 수정 |

---

## 1. 노트 추가

메모/회의록 등을 입력하면 AI가 자동으로 정리하여 개인 공간에 저장합니다.

```
POST /quick-add
Content-Type: application/json
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | string | ✅ | loginid (이메일) |
| `input` | string | ✅ | 정리할 내용 (최대 100,000자) |

```bash
curl -X POST https://52.78.246.50.nip.io:5090/api/quick-add \
  -H "Content-Type: application/json" \
  -d '{"id": "hong.gildong", "input": "오늘 회의에서 결정된 사항: 1) 예산 20% 증액 2) 3월 킥오프"}'
```

**Response (201)**

```json
{
  "request": {
    "id": "clx...",
    "status": "PENDING",
    "position": 1,
    "createdAt": "2026-01-30T04:00:00.000Z"
  },
  "message": "입력이 접수되었습니다. 잠시 후 AI가 정리해드립니다.",
  "url": "https://52.78.246.50.nip.io:5090"
}
```

> ℹ️ 비동기 처리됩니다. 큐에 등록 후 AI가 순차적으로 처리합니다.

---

## 2. Todo 추가

개인 공간에 할일(Todo)을 즉시 추가합니다.

```
POST /quick-add/todo
Content-Type: application/json
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | string | ✅ | loginid (이메일) |
| `title` | string | ✅ | Todo 제목 |
| `content` | string | | 상세 내용 |
| `startDate` | string | | 시작일 `YYYY-MM-DD` (기본: 오늘) |
| `endDate` | string | | 종료일 `YYYY-MM-DD` (기본: 1년 후) |

```bash
curl -X POST https://52.78.246.50.nip.io:5090/api/quick-add/todo \
  -H "Content-Type: application/json" \
  -d '{"id": "hong.gildong", "title": "보고서 제출", "endDate": "2026-02-28"}'
```

**Response (201)**

```json
{
  "todo": {
    "id": "clx...",
    "title": "보고서 제출",
    "startDate": "2026-01-30T00:00:00.000Z",
    "endDate": "2026-02-28T00:00:00.000Z",
    "completed": false,
    "createdAt": "2026-01-30T04:00:00.000Z"
  },
  "message": "Todo가 추가되었습니다."
}
```

---

## 3. 검색

개인 공간에서 자연어로 AI 검색합니다.

```
GET /quick-add/search?id={loginid}&q={검색어}
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | string | ✅ | loginid (이메일) |
| `q` | string | ✅ | 검색어 (자연어) |

```bash
curl "https://52.78.246.50.nip.io:5090/api/quick-add/search?id=hong.gildong&q=마케팅+예산+회의"
```

**Response (200)**

```json
{
  "request": {
    "id": "clx...",
    "status": "PENDING",
    "position": 1
  },
  "message": "검색 요청이 접수되었습니다. 결과는 비동기로 처리됩니다."
}
```

> ℹ️ 검색은 비동기 처리됩니다. AI가 폴더를 탐색하며 관련 파일을 `relevanceScore` 순으로 정렬하여 반환합니다.

### 검색 방식

AI가 다음 절차로 검색합니다:
1. 루트 폴더 탐색
2. 관련 폴더를 drill-down
3. 파일명/내용 기반 관련성 평가
4. `relevanceScore`(0~100) 기준 정렬 후 반환

---

## 4. Todo 목록 조회

개인 공간의 Todo를 기간별로 조회합니다.

```
GET /quick-add/todos?id={loginid}&startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | string | ✅ | loginid (이메일) |
| `startDate` | string | | 조회 시작일 (기본: 오늘) |
| `endDate` | string | | 조회 종료일 (기본: 1년 후) |

```bash
# 전체 Todo 조회
curl "https://52.78.246.50.nip.io:5090/api/quick-add/todos?id=hong.gildong"

# 2월 Todo만 조회
curl "https://52.78.246.50.nip.io:5090/api/quick-add/todos?id=hong.gildong&startDate=2026-02-01&endDate=2026-02-28"
```

**Response (200)**

```json
{
  "todos": [
    {
      "id": "clx...",
      "title": "보고서 제출",
      "content": null,
      "startDate": "2026-01-30T00:00:00.000Z",
      "endDate": "2026-02-28T00:00:00.000Z",
      "completed": false,
      "completedAt": null,
      "createdAt": "2026-01-30T04:00:00.000Z"
    }
  ],
  "range": {
    "start": "2026-01-30T00:00:00.000Z",
    "end": "2027-01-30T00:00:00.000Z"
  },
  "total": 1
}
```

---

## 5. Todo 수정

Todo의 완료 상태, 제목, 기간 등을 수정합니다.

```
PATCH /quick-add/todos
Content-Type: application/json
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | string | ✅ | loginid (이메일) |
| `todoId` | string | ✅ | 수정할 Todo ID |
| `completed` | boolean | | 완료 여부 |
| `title` | string | | 제목 |
| `content` | string | | 상세 내용 |
| `startDate` | string | | 시작일 `YYYY-MM-DD` |
| `endDate` | string | | 종료일 `YYYY-MM-DD` |

```bash
# Todo 완료 처리
curl -X PATCH https://52.78.246.50.nip.io:5090/api/quick-add/todos \
  -H "Content-Type: application/json" \
  -d '{"id": "hong.gildong", "todoId": "clx...", "completed": true}'

# 기한 변경
curl -X PATCH https://52.78.246.50.nip.io:5090/api/quick-add/todos \
  -H "Content-Type: application/json" \
  -d '{"id": "hong.gildong", "todoId": "clx...", "endDate": "2026-03-15"}'
```

**Response (200)**

```json
{
  "todo": {
    "id": "clx...",
    "title": "보고서 제출",
    "content": null,
    "startDate": "2026-01-30T00:00:00.000Z",
    "endDate": "2026-03-15T00:00:00.000Z",
    "completed": false,
    "completedAt": null
  },
  "message": "Todo가 수정되었습니다."
}
```

---

## 에러 코드

| Status | 설명 |
|--------|------|
| 400 | 필수 파라미터 누락 또는 유효하지 않은 값 |
| 403 | 권한 없음 (다른 사용자의 Todo 수정 시도 등) |
| 404 | 사용자를 찾을 수 없음 (미가입 시 가입 안내 + URL 반환) |
| 500 | 서버 에러 |

**404 응답 예시 (미가입자)**

```json
{
  "error": "User not found. Please sign up first at https://52.78.246.50.nip.io:5090",
  "signupUrl": "https://52.78.246.50.nip.io:5090"
}
```

---

## 활용 예시

```bash
# CI/CD 빌드 결과 자동 저장
curl -X POST https://52.78.246.50.nip.io:5090/api/quick-add \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"syngha.han\", \"input\": \"빌드 #${BUILD_NUMBER} 성공. 커밋: ${GIT_COMMIT}\"}"

# 자동 Todo 등록
curl -X POST https://52.78.246.50.nip.io:5090/api/quick-add/todo \
  -H "Content-Type: application/json" \
  -d '{"id": "syngha.han", "title": "코드 리뷰 완료하기", "endDate": "2026-02-07"}'

# 내 Todo 확인
curl "https://52.78.246.50.nip.io:5090/api/quick-add/todos?id=syngha.han"

# 검색
curl "https://52.78.246.50.nip.io:5090/api/quick-add/search?id=syngha.han&q=프로젝트+일정"

# Todo 완료 처리
curl -X PATCH https://52.78.246.50.nip.io:5090/api/quick-add/todos \
  -H "Content-Type: application/json" \
  -d '{"id": "syngha.han", "todoId": "clx...", "completed": true}'
```

---

## 주의사항

- 인증 없이 사용 가능하므로 **사내망에서만** 접근 가능
- `id`에 해당하는 사용자가 존재해야 합니다 (SSO 로그인 이력 필요)
- **개인 공간**에만 접근됩니다 (팀 공간 불가)
- 노트 추가와 검색은 비동기 처리됩니다 (큐 → AI 순차 처리)
- Todo 추가/조회/수정은 즉시 처리됩니다
