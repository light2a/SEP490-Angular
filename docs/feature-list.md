# Feature list — ISAS Frontend (WIP=1)

Trạng thái: `done` ✅ · `todo` · `blocked`. Chọn `todo` không bị chặn để làm tiếp.

## Nền tảng (Foundation)
| Feature | Trạng thái |
|---|---|
| Scaffold Angular 21 (standalone, zoneless, Material, Vitest) | ✅ done |
| environments (apiBase → Gateway) | ✅ done |
| Models + enums (Interview/Campaign chuỗi · Payment số) + pipes | ✅ done |
| AuthStore (signals) + jwt-decode (dò nhiều key) + token-storage | ✅ done |
| Interceptors: auth (bearer + 401→refresh gộp in-flight) · error (402/403/409/502) | ✅ done |
| Guards: authGuard · roleGuard | ✅ done |
| API services: auth, files, practice, roadmap, cv-analysis, rubric, payment | ✅ done |
| Layout: auth-shell · candidate-shell (toolbar+sidenav) | ✅ done |
| Routing lazy theo role + shared UI (spinner, empty-state) | ✅ done |

## Auth
| Feature | Trạng thái |
|---|---|
| Đăng nhập | ✅ done |
| Đăng ký (Candidate) | ✅ done |
| Quên mật khẩu (OTP: email→otp→reset) | ✅ done |
| register-org (Employer) | ✅ done |
| Google OAuth | todo (đợt 2) |

## B2C Candidate
| Feature | Trạng thái |
|---|---|
| Dashboard | ✅ done |
| Files CV/JD (upload multipart, list, xem, xoá) | ✅ done |
| Phân tích CV (tạo −1 credit, list, detail, jdMatch) | ✅ done |
| Luyện: tạo session + lịch sử | ✅ done |
| Luyện: màn session (poll, ghi âm MediaRecorder, nộp câu, submit, điểm) | ✅ done |
| Roadmap: tạo + list | ✅ done |
| Roadmap: detail (milestones/lessons, lý thuyết lazy, start lesson, resume 409) + report | ✅ done |
| Rubric cá nhân (xem seed/custom, CRUD FormArray, Σweight≈1, về seed) | ✅ done |
| Credit: gói + mua (redirect PayOS) + đơn + kiểm tra trạng thái | ✅ done |
| Payment return/cancel | ✅ done |

## B2B Candidate (ứng viên tuyển dụng)
| Feature | Trạng thái |
|---|---|
| Models + `CampaignApi` (invitation/join/my-campaigns/start + flags/face-enroll/face-check) | ✅ done |
| Landing lời mời `/invite/:token` (public) → join → lưu JWT access-only → vào campaign | ✅ done |
| My campaigns (list + chip trạng thái) + chi tiết (tiêu chí, deadline, start/tiếp tục, 402/409) | ✅ done |
| Trang thi `/candidate/campaigns/:id/interview` (từng câu, ghi âm, đếm ngược `timeLimitSec`, resume, submit) | ✅ done |
| Proctoring UI (webcam face-enroll/face-check + tab-switch/focus/paste flags + consent gate, chỉ B2B — `proctor.service.ts`/`webcam-capture.ts`/`proctoring-consent-dialog.ts` nối trong `campaign-interview.ts`) | ✅ done |

## Verify
| Việc | Trạng thái |
|---|---|
| `npm run build` sạch | ✅ done |
| `npm start` + smoke test (login render, routing, guard, 0 console error) | ✅ done |
| E2E với backend thật (login→CV→luyện→chấm→credit) | ⏳ chờ backend chạy |

## Backlog / đợt sau
- Unit test Vitest (authInterceptor refresh-queue, enum maps, guards, audio-recorder mock).
- ✅ Đếm ngược `timeLimitSec` mỗi câu + auto-nộp khi hết giờ (**đã có** ở trang thi B2B).
- Radar chart cho report (dùng skill **dataviz**) thay vì bar.
- Trang hồ sơ (`GET/PUT /auth/me`), đổi tên hiển thị.
- Xem `parsedText` của file; kéo-thả upload.
- Dark mode (Material `light dark`), i18n, a11y sweep.
- httpResource() cho các GET danh sách.
- ✅ B2B (Employer): campaign, screening CV, ranking (+HR override), invoice · Admin: package/close — **đã build** (console Employer + Admin routed).
- CI (build/lint/test) + Dockerfile/nginx + fileReplacements prod.
