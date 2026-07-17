# Progress / Handoff — ISAS Frontend

> Cập nhật mỗi phiên (tan ca). Cập nhật lần cuối: **2026-07-18**.

> **Cập nhật 2026-07-18 (reconcile docs → thực tế):** FE nay đã dựng **cả 3 mặt sản phẩm** — không còn "chỉ B2C đợt 1". **B2B** đầy đủ: console Employer/HR (campaigns/criteria/questions/invite/results+ranking+**HR override điểm E11b**/members/org-credit/invoices/dashboard) + luồng ứng viên (magic-link `/invite/:token` → join → my-campaigns → start → trang thi) + **anti-cheat proctoring đã wire** (`proctor.service.ts` tab-switch/focus/paste→`/flags` · `webcam-capture.ts` getUserMedia→face-enroll + face-check /30s · `proctoring-consent-dialog.ts` gate consent, chỉ B2B per BC-6 — tất cả nối trong `features/candidate/campaigns/campaign-interview.ts`) + đếm ngược/tự-nộp mỗi câu. **Admin** console giám sát toàn nền tảng đã routed (dashboard/packages/billing-close/organizations/users/campaigns/orders). `register-org` (Employer) đã có route. Cây feature giờ là `features/{auth,candidate,employer,admin,invite,account}/` + layout `auth-shell`/`candidate-shell`/`employer-shell`/`admin-shell`. **Còn lại (thật sự chưa làm):** Google OAuth login.

> **Nhánh & deploy (cứng):** remote = `github.com/light2a/SEP490-Angular`. Nguồn sự thật = **`master`** (và `feat/b2b-candidate`); **Vercel deploy từ `master`**. ⚠ `origin/main` **đã cũ** (thiếu B2B + anti-cheat) → đừng lấy làm chuẩn.

## Đang ở đâu
FE đã dựng **cả 3 mặt sản phẩm** — **B2C** (ứng viên luyện tập, toàn luồng) · **B2B** (console Employer/HR + ứng viên tuyển dụng + anti-cheat proctoring) · **Admin** (giám sát toàn nền tảng) — và **build sạch + smoke-test pass**.

**2026-07-16 (nhánh `feat/b2b-candidate`) — luồng B2B phía ứng viên:** `/invite/:token` (public; join lưu JWT **access-only** qua `AuthStore.setAccessOnlySession` — backend không trả refreshToken) → `candidate/campaigns` (my-campaigns) → detail (tiêu chí/deadline; start: 402 = org hết credit, 409 = completed/closed) → trang thi `campaigns/:id/interview` (từng câu một, tái dùng `AudioRecorder`, đếm ngược `timeLimitSec`/câu, hết giờ tự dừng-và-nộp hoặc bỏ qua, resume từ câu chưa trả lời qua GET session Interview, submit → màn thành công). `CampaignApi` expose `reportFlag`/`faceEnroll`/`faceCheck`; **proctoring nay đã wire** (không còn hoãn): `campaign-interview.ts` dùng `faceEnrollRequired` + `sessionId` để gọi `proctor.service.ts` (tab-switch/focus/paste → `/flags`) + `webcam-capture.ts` (getUserMedia → face-enroll + face-check mỗi 30s) sau `proctoring-consent-dialog.ts` (gate consent, chỉ B2B per BC-6). `errorInterceptor`: 402 từ `/campaign/*` KHÔNG redirect mua credit cá nhân. Build sạch. E2E backend thật chưa chạy.

- **Angular 21** (không phải 22 như plan gốc): máy có Node v24.14.0, mà Angular CLI 22 yêu cầu ≥24.15 → chọn 21 để tránh nâng Node toàn máy. 21 vẫn **zoneless mặc định + signals + standalone + Vitest**. Muốn lên 22 sau: nâng Node ≥24.15 rồi `ng update`.
- **Build:** `npm run build` → 0 lỗi. **Smoke:** `npm start` → `/` guard đẩy về `/auth/login`, form Material render, lazy routes (login/register) load, **0 console error** (verify qua Browser 2026-07-15).
- **Backend:** đã thêm `http://localhost:4200` vào CORS Gateway (repo `../isas-server`, 2 file appsettings). Chưa chạy backend nên **E2E thật chưa verify**.

## Đã có
Foundation (core/models/auth/interceptors/guards/api/layout/routing) · Auth (login/register/forgot/**register-org**) · **B2C** (dashboard, files, cv-analysis, practice+audio+chấm, roadmap+report, rubric, credits+PayOS) · **B2B** (Employer/HR console: campaigns/criteria/questions/invite/results+ranking+**HR override**/members/org-credit/invoices/dashboard · ứng viên: `/invite/:token`→join→my-campaigns→start→trang thi · **anti-cheat proctoring**: tab-switch/focus/paste flags + webcam face-enroll/face-check + consent gate + đếm ngược/tự-nộp mỗi câu) · **Admin** (dashboard/packages/billing-close/organizations/users/campaigns/orders toàn nền tảng). Chi tiết: `feature-list.md`.

## Bước tiếp theo (đề xuất)
1. **E2E thật:** bật `../isas-server` (`docker compose up`) + seed user (`scripts/seed-test-users.sql`, mật khẩu `Test@123456`) + seed `product_packages` + admin + env PayOS. Chạy luồng: đăng nhập → upload CV → tạo session → ghi âm 1 câu → nộp → chấm → xem điểm → mua credit (PayOS sandbox).
2. **Unit test Vitest** cho phần rủi ro (authInterceptor refresh-queue, enum maps Payment, audio-recorder mock MediaRecorder).
3. **radar chart** report (skill dataviz) thay vì bar; hoàn thiện trang **hồ sơ**. *(Đếm ngược mỗi câu `timeLimitSec` + auto-nộp đã có.)*
4. **Google OAuth login** (còn TODO thật). CI (build/lint/test) + Dockerfile/nginx + fileReplacements prod. *(B2B Employer + Admin đã build — xem `feature-list.md`.)*

## Ghi chú kỹ thuật quan trọng
- **Enum:** Interview/Campaign = chuỗi; Payment = số → luôn qua `core/models/enums.ts` + pipe.
- **JWT:** decoder dò nhiều key (`sub`/`nameid`/URI dài) vì backend .NET `ClaimTypes.*` + `MapInboundClaims=false`.
- **Refresh 401:** gộp in-flight ở `AuthStore.refresh$()` — nhiều 401 đồng thời chỉ refresh 1 lần.
- **PayOS:** `createOrder` trả `checkoutUrl` → `window.location.href`. Đơn Pending tự Expired ~30' phía backend. Route return: `/candidate/payment/success|cancel` (cần set `PayOS__ReturnUrl/CancelUrl` backend).

## Vào ca / tan ca
Xem `AGENTS.md`. Nguồn hợp đồng API: `docs/api-spec.md` (backend đổi → cập nhật trước khi code UI).
