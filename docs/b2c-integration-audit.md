# ISAS B2C — Báo cáo audit tích hợp (5-agent, 2026-07-15)

> Kết quả workflow 5 agent song song (contract · business · docs · infra · QA) + tổng hợp. 46 findings. Đây là **audit trước khi implement** — chưa sửa code, chỉ đề xuất.

## 1. Tóm tắt
Engine backend B2C **về cơ bản đúng & khớp contract** (reserve credit trước insert → 402 no-session PAY-5; scoring callback gated `X-Internal-Token` + clamp `[0,maxScore]`; consume/release idempotent theo `session_id`; owner-only; ledger atomic chống double-spend). **Frontend tôi build khớp code backend** (path/method/enum FE decode đúng). Nhưng còn: **2 đường rò credit không phục hồi**, vài gap correctness, **secrets thật bị commit** (security), FE **gần như chưa có test** (spec duy nhất đang RED), và E2E thật **bị chặn bởi secrets/seed/migration thủ công**.

## 2. 🔴 P0 — Chặn tích hợp
| # | Vấn đề | File | Fix |
|---|---|---|---|
| **P0-1** | Backend `register` trả **`string` (userId)** thay vì `AuthResponse` → **signup không nhận token** | BE `AuthService.RegisterAsync` | Trả `AuthResponse` qua `GenerateAuthResponse` |
| **P0-2** | FE spec duy nhất `app.spec.ts` **RED** (assert `h1 "Hello"` cũ + thiếu `HttpClient` provider) → suite FE hỏng, không có tín hiệu test | `isas-frontend/src/app/app.spec.ts` | `provideHttpClientTesting()`+`provideRouter([])`, bỏ assert `h1`, assert có `<router-outlet>` |

> Các "mismatch" enum/route Payment khác **KHÔNG chặn** — FE đã đúng, chỉ **doc backend lệch** (xem P2 docs).

## 3. 🟠 P1 — Credit leak / Security / Invalid-request
**Rò credit (mất tiền ứng viên):**
- **P1-1 Abandon B2C không release credit.** `CreateSessionAsync` reserve 1 credit; release chỉ có khi AI-gen fail (BK12) hoặc sweeper hết deadline — mà B2C `Deadline=null` và sweeper chỉ quét `InProgress && Deadline!=null`. Tạo session rồi bỏ đi → treo Ready/InProgress mãi → mất 1 credit. → cho B2C TTL bất hoạt + sweeper quét `Ready/InProgress` khi `Deadline=null` quá ngưỡng → publish `SessionAbandoned`. *(`SessionAbandonSweeper.cs`, `PracticeService.cs`)*
- **P1-2 Reserve-then-insert không atomic.** Reserve xong (đã trừ `remaining`) → `Add(session)`→`SaveChanges` fail → reservation mồ côi, **không có session row** để reclaim → mất im lặng. → try/catch `ReleaseAsync(sessionId)` khi lỗi; hoặc persist row trước khi reserve. *(`PracticeService.cs`, `CreditReservationClient.cs`)*

**Security:**
- **P1-3 🚨 Secrets THẬT commit trong `appsettings.Development.json`** (Auth + Interview): JWT key, Internal token, SeaweedFS secret, Postgres password, **Gmail SMTP app password**, **Google OAuth client secret** — và chúng **override khi `ASPNETCORE_ENVIRONMENT=Development`** (compose deploy set Development). Ai đọc repo cũng forge được JWT/internal callback/gửi mail. → **ROTATE toàn bộ + xoá giá trị + scrub history**. *(việc của bạn — không tự rotate được.)*
- **P1-4 Callback token guard chưa có test** — `/internal/answers/{id}/result|failed` chỉ chặn bằng `IsValidInternalToken`, chưa test → thêm `AnswerCallbackAuthTests.cs`.

**Invalid-request:**
- **P1-5 `jobCategory` thiếu/sai → âm thầm default `BA`** + vẫn reserve credit. → DTO `JobCategory?` + `[Required]`, guard 400 **trước** reserve (pattern BK6). *(`DTOs/PracticeSession.cs`, `PracticeController.cs`)*
- **P1-6 Upload file rỗng/thiếu → 400** chưa test → `AnswerUploadControllerTests.cs`.

## 4. 🟡 P2 — Correctness phụ + Docs drift + Infra
**Code (correctness):**
- Charge credit dù **mọi answer Failed** (all-failed vẫn Scored→consume) → publish `SessionAbandoned` khi `answeredCount==0`.
- **Re-upload để lại `answer_scores` cũ** → GET trả điểm cũ; trộn `rubric_version` (BC16) → median sai → xoá scores cũ khi re-upload.
- **AI outage khi gen câu hỏi → 400 thay 502** → để `AiServiceException` propagate → 502.
- **Lost `SessionScored` publish** (best-effort, nuốt lỗi) → credit treo → outbox/reconciliation.
- Token compare **không constant-time** → `CryptographicOperations.FixedTimeEquals`.
- **`amountVnd` là `int`** (cap ~2.1 tỷ) vs doc `bigint` → đổi `long`.

**Docs drift (FE/code đúng, sửa DOC):**
- Payment enum serialize **SỐ** (không có `JsonStringEnumConverter`) — `payment.md` ghi `enum(string)` sai; ngoại lệ `/order/{id}/status` = chuỗi. **Đừng thêm converter** (FE phụ thuộc số).
- `POST /order` trả **full `OrderResponse`**, không phải `CreateOrderResponse{orderId,orderCode,checkoutUrl}` (doc bịa).
- Route `my-orders` = `/payment/order/my-orders` (doc ghi `/payment/my-orders`).
- `interview.md` còn nhãn `🔜 chưa build` cho BC2/BC9/cv-analysis/rubric/roadmaps **đã ship**; `architecture.md`/`payment.md` còn `🟡 branch` cho Payment **đã vào tree/CI/gateway** → gỡ nhãn stale.
- DTO `SessionStatus` thiếu `Completed`/`SessionAbandoned`; thiếu `DELETE /payment/order/{id}`.

**Infra:**
- **Root `compose.yaml` là skeleton stale không chạy** (thiếu rabbitmq/seaweedfs/interview/campaign/payment; authservice không env) → `docker compose up` không dựng stack (P0.1 fail). Stack thật chỉ nằm trong code block `DEPLOYMENT.md §4`. → commit `deploy/compose.yaml` version-controlled.
- **Không seed `product_packages` + Admin** trong repo → catalog rỗng, không mua credit được.
- AIService inbound **không enforce `X-Internal-Token`** (chỉ dựa Tailscale ACL); gateway dev json thiếu 2 route D2 (sống nhờ merge additive); `AiService:BaseUrl` literal `<MAC_TS_IP>`; không có Makefile (P0.2).

## 5. 🔒 Chặn bởi live stack — bạn phải cấp để E2E thật
- **Gemini:** `GEMINI_API_KEY` (Mac AIService).
- **PayOS sandbox:** `PAYOS_CLIENT_ID`/`API_KEY`/`CHECKSUM_KEY` + `RETURN_URL`/`CANCEL_URL` + **webhook tunnel public** (cloudflare) tới Payment `:5271`.
- **Shared secrets byte-identical 3 nơi:** `JWT_KEY`, `INTERNAL_TOKEN`, `S3_ACCESS_KEY/SECRET` (server ↔ `seaweed-s3.json` ↔ Mac worker).
- **SMTP** + optional Google OAuth; **Tailscale** join 2 host + IP thật + GH deploy secrets; `GATEWAY_PUBLIC_URL`.
- **Data thủ công (không auto-migrate):** tạo 4 DB → apply 4 `InitialCreate` → seed `product_packages` (SQL) → tạo Admin → `seed-test-users.sql`.

## 6. Thứ tự thực thi đề xuất
- **Đợt 1 — bỏ chặn (P0, ngay):** `register`→`AuthResponse`; sửa `app.spec.ts` cho suite FE xanh.
- **Đợt 2 — credit leak + security (P1):** abandon-release sweeper; reserve-then-insert atomic; rotate+xoá secrets; `jobCategory` 400 trước reserve; test token-guard + upload-invalid.
- **Đợt 3 — correctness (P2 code):** no-charge all-failed; clear scores re-upload; AI outage→502; outbox `SessionScored`; constant-time token; `amountVnd`→`long`.
- **Đợt 4 — doc sync + infra:** đồng bộ payment.md/interview.md/architecture.md; commit stack compose + seed packages/admin + Makefile.
- **Đợt 5 — E2E live (chờ §5):** double-reserve race, AI scoring, PayOS webhook, event-bus, 401/403 sweep, golden-path.

**Chạy được NGAY (không cần live stack):**
- **FE Vitest (~10 spec):** auth.interceptor (refresh-queue), error.interceptor (402→credits), jwt.util, auth.store, guards, enums/pipes (số vs chuỗi), audio-recorder (mock MediaRecorder), practice-session (poll/resume), practice.api (FormData), http-utils.
- **Backend xUnit:** `AnswerCallbackAuthTests`, `AnswerUploadControllerTests`, `jobCategory` thiếu→400 + không reserve.

## 7. Sequence diagram B2C (khớp code thật)
```mermaid
sequenceDiagram
    autonumber
    actor U as User/Candidate (FE)
    participant GW as Gateway (YARP /api/v1)
    participant AU as AuthService
    participant IN as InterviewService
    participant PA as PaymentService
    participant AI as AIService (internal)
    participant MQ as RabbitMQ
    participant S3 as SeaweedFS
    U->>GW: POST /api/v1/auth/login
    GW->>AU: /auth/login
    AU-->>U: {accessToken, refreshToken} (Candidate)
    U->>GW: POST /api/v1/payment/order {packageId}
    GW->>PA: /order
    PA-->>U: 201 OrderResponse {id, payosOrderCode, checkoutUrl, status=Pending(1)}
    U->>PA: pay on PayOS; PayOS->PA POST /payment/webhook/payos (HMAC, no gateway)
    PA->>PA: Order->Paid, remaining += credits (idempotent)
    U->>GW: POST /api/v1/interview/practice/sessions {jobCategory,cvId?}
    GW->>IN: /api/practice/sessions
    IN->>PA: POST /internal/credits/reserve (X-Internal-Token)
    alt no credit
        PA-->>IN: 402
        IN-->>U: 402 (no session)
    else reserved
        PA-->>IN: 200 {reservationId}
        IN->>AI: generate-questions
        AI-->>IN: questions[]
        IN-->>U: 201 PracticeSession (Ready)
    end
    U->>GW: POST .../sessions/{id}/answers (multipart audio)
    GW->>IN: answer Uploaded
    IN->>S3: store audio
    IN->>MQ: publish ScoringJob
    AI->>MQ: worker consumes
    AI->>S3: download -> Whisper -> Gemini score
    AI->>IN: POST /internal/answers/{id}/result (X-Internal-Token)
    IN->>IN: save answer_scores -> Scored
    U->>GW: POST .../sessions/{id}/submit
    GW->>IN: all terminal -> Scored (BC9 compute result)
    IN->>MQ: publish SessionScored (interview.events / session.scored)
    MQ->>PA: InterviewEventConsumer -> reservation Consumed, ledger -1
    U->>GW: GET .../sessions/{id} -> result {overallScore, criteriaScores[], overallComment}
    U->>GW: POST .../roadmaps -> milestones/lessons; GET .../roadmaps/{id}/report
```
