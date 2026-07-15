# AGENTS.md — ISAS Frontend (Angular)

**Cửa vào cho agent/người mới.** Đọc file này trước, rồi xem `docs/`.

## Dự án là gì
Frontend **Angular 21** cho nền tảng phỏng vấn AI **ISAS**. Đợt 1 = **B2C (Ứng viên luyện tập)**: đăng nhập → upload CV/JD → tạo buổi luyện → ghi âm trả lời → AI chấm điểm → xem roadmap/report → phân tích CV → mua credit (PayOS). Backend là 6 microservice .NET sau **Gateway** (repo `../isas-server`); FE chỉ nói chuyện với Gateway.

## Chạy & kiểm thử
- **Cài:** `npm install`
- **Chạy dev:** `npm start` → http://localhost:4200 (Gateway dev ở `http://localhost:5131`, xem `src/environments/environment.ts`).
- **Build:** `npm run build` (dev: `-- --configuration development`).
- **Test:** `npm test` (Vitest).
- **Backend:** bật `../isas-server` (`docker compose up`) + seed user/gói credit. CORS gateway đã thêm `localhost:4200`.

## Ràng buộc cứng (PHẢI tuân)
1. **Chỉ gọi Gateway** `environment.apiBase` (`/api/v1/*`). KHÔNG gọi thẳng service, **KHÔNG gọi AIService** (internal-only).
2. **Enum theo service:** Interview/Campaign = **CHUỖI**; Payment = **SỐ** → luôn map qua `core/models/enums.ts` + pipe (`orderStatus`, `packageType`). Ngoại lệ `GET /order/{id}/status` trả chuỗi.
3. **Auth:** token gắn qua `authInterceptor`; 401 → refresh 1 lần (gộp in-flight) rồi retry. Không tự thêm header thủ công trong service.
4. **Angular hiện đại:** **standalone components**, **signals** (không NgModule, không NgRx), **zoneless** (không dùng `setTimeout` để "ép" CD — set signal), control flow `@if/@for/@switch`, `inject()`, functional guards/interceptors.
5. **Material:** dùng Angular Material + CDK; không thêm thư viện UI khác.
6. **Không lưu secret trong code.** Token ở `localStorage` (tradeoff đã ghi ở `conventions.md`).

## WIP = 1
Mỗi lần chỉ làm **1 feature** trong `docs/feature-list.md`. Xong + verify mới sang cái kế. Không "tiện tay refactor" — ghi vào backlog.

## Định nghĩa "Xong" — 3 lớp
1. **Build/lint sạch:** `npm run build` + `npm run lint` (nếu có) không lỗi.
2. **Hành vi runtime:** `npm start` render được màn, thao tác chính chạy (có thể mock nếu backend chưa sẵn); unit test liên quan pass.
3. **End-to-end thật:** chạy với backend thật — đúng luồng B2C (đăng nhập → CV → luyện → chấm → credit). **Compile xanh ≠ Xong.**

## Bản đồ code
```
src/environments/         # apiBase (dev/prod)
src/app/core/
  api/        # service HTTP theo domain (auth, files, practice, roadmap, cv-analysis, rubric, payment)
  models/     # interface + enum (source: docs/api-spec.md)
  auth/       # AuthStore (signals), jwt-decode, token-storage
  interceptors/  # auth (bearer+refresh), error (map 402/403/409/502)
  guards/     # authGuard, roleGuard
src/app/shared/    # pipes + ui (spinner, empty-state)
src/app/layout/    # auth-shell, candidate-shell
src/app/features/
  auth/            # login, register, forgot-password
  candidate/       # dashboard, files, practice(+audio), cv-analysis, roadmaps, rubrics, credits
```

## Đồng bộ với backend
Repo RIÊNG với `../isas-server`. Hợp đồng API là `docs/api-spec.md` (rút từ spec bàn giao). **Backend đổi API → cập nhật `docs/api-spec.md` + models trước khi code UI.**

## Vào ca / tan ca
- Vào ca: đọc `docs/progress.md` (bước kế) + `docs/feature-list.md` (chọn việc `todo` không bị chặn).
- Tan ca: build+test pass · cập nhật `progress.md`/`feature-list.md` · không rác tạm · commit nguyên tử (*làm gì + vì sao*).
