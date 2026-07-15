# Progress / Handoff — ISAS Frontend

> Cập nhật mỗi phiên (tan ca). Cập nhật lần cuối: **2026-07-15**.

## Đang ở đâu
Đợt 1 (**B2C Ứng viên**) đã dựng xong **nền tảng + toàn bộ luồng B2C** và **build sạch + smoke-test pass**.

- **Angular 21** (không phải 22 như plan gốc): máy có Node v24.14.0, mà Angular CLI 22 yêu cầu ≥24.15 → chọn 21 để tránh nâng Node toàn máy. 21 vẫn **zoneless mặc định + signals + standalone + Vitest**. Muốn lên 22 sau: nâng Node ≥24.15 rồi `ng update`.
- **Build:** `npm run build` → 0 lỗi. **Smoke:** `npm start` → `/` guard đẩy về `/auth/login`, form Material render, lazy routes (login/register) load, **0 console error** (verify qua Browser 2026-07-15).
- **Backend:** đã thêm `http://localhost:4200` vào CORS Gateway (repo `../isas-server`, 2 file appsettings). Chưa chạy backend nên **E2E thật chưa verify**.

## Đã có (đợt 1)
Foundation (core/models/auth/interceptors/guards/api/layout/routing) · Auth (login/register/forgot) · B2C (dashboard, files, cv-analysis, practice+audio+chấm, roadmap+report, rubric, credits+PayOS). Chi tiết: `feature-list.md`.

## Bước tiếp theo (đề xuất)
1. **E2E thật:** bật `../isas-server` (`docker compose up`) + seed user (`scripts/seed-test-users.sql`, mật khẩu `Test@123456`) + seed `product_packages` + admin + env PayOS. Chạy luồng: đăng nhập → upload CV → tạo session → ghi âm 1 câu → nộp → chấm → xem điểm → mua credit (PayOS sandbox).
2. **Unit test Vitest** cho phần rủi ro (authInterceptor refresh-queue, enum maps Payment, audio-recorder mock MediaRecorder).
3. **Đếm ngược mỗi câu** (`timeLimitSec`) + auto-nộp; **radar chart** report (skill dataviz); trang **hồ sơ**.
4. Đợt 2: **B2B Employer** + **Admin** (xem `feature-list.md`), CI + Dockerfile.

## Ghi chú kỹ thuật quan trọng
- **Enum:** Interview/Campaign = chuỗi; Payment = số → luôn qua `core/models/enums.ts` + pipe.
- **JWT:** decoder dò nhiều key (`sub`/`nameid`/URI dài) vì backend .NET `ClaimTypes.*` + `MapInboundClaims=false`.
- **Refresh 401:** gộp in-flight ở `AuthStore.refresh$()` — nhiều 401 đồng thời chỉ refresh 1 lần.
- **PayOS:** `createOrder` trả `checkoutUrl` → `window.location.href`. Đơn Pending tự Expired ~30' phía backend. Route return: `/candidate/payment/success|cancel` (cần set `PayOS__ReturnUrl/CancelUrl` backend).

## Vào ca / tan ca
Xem `AGENTS.md`. Nguồn hợp đồng API: `docs/api-spec.md` (backend đổi → cập nhật trước khi code UI).
