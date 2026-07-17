# Conventions — ISAS Frontend (Angular 21)

## Component
- **Standalone**, `imports: [...]` khai trực tiếp (không NgModule). Đặt tên file mới không hậu tố `.component` (theo scaffold: `xxx.ts` + class `Xxx`, template `xxx.html`).
- Template < ~40 dòng → inline; dài hơn → `templateUrl`.
- State bằng **signals** (`signal`/`computed`); input bằng `input()`/`input.required()`; output bằng `output()`.
- Route param → component input (đã bật `withComponentInputBinding`): khai `id = input.required<string>()` cho path `:id`.

## Zoneless
- Không có Zone.js. Thay đổi UI chỉ xảy ra khi **set signal** (hoặc event/async qua HttpClient). Trong callback `setInterval`/`MediaRecorder`, set signal để cập nhật (đã dùng ở polling & audio-recorder).
- KHÔNG dùng `ChangeDetectorRef.detectChanges()` như vá lỗi.

## Gọi API
- Service ở `core/api/*` trả `Observable`. Component `subscribe` và set signal. (Có thể chuyển GET sang `httpResource()` sau.)
- KHÔNG tự gắn `Authorization` — `authInterceptor` lo. KHÔNG bắt 401 trong component (interceptor refresh). Bắt **402** (hết credit — interceptor đã điều hướng) chỉ để tắt spinner; **400/404/409** hiển thị chi tiết bằng `extractErrorMessage`.

## Enum (QUAN TRỌNG)
- Interview/Campaign: string-literal union → so sánh trực tiếp `s.status === 'Scored'`.
- Payment: numeric enum `OrderStatus`/`PackageType`... → so sánh `o.status === OrderStatus.Pending`; hiển thị qua pipe `orderStatus`/`packageType`.

## Forms
- Mặc định **Reactive Forms** + Material (`mat-form-field`). Có thể thử **Signal Forms** cho form đơn giản (Angular 21 developer-preview) — nếu vướng Material thì quay lại Reactive.
- Validate client cơ bản (required/email/min) + luôn xử lý lỗi server (không tin mỗi client).

## Material
- Import `Mat*Module` vào `imports` của component. Button: dùng `mat-flat-button`/`mat-stroked-button`/`mat-icon-button` (classic, vẫn hỗ trợ ở v21) hoặc `matButton`/`matIconButton` (API mới) — nhất quán trong 1 file.
- Theme: Material 3, palette azure, cấu hình ở `src/styles.scss` (`mat.theme`). Dùng biến hệ thống `--mat-sys-*` cho màu.

## Token & bảo mật
- `accessToken` + `refreshToken` lưu `localStorage` (`core/auth/token-storage.ts`). **Tradeoff:** đọc được bởi JS (rủi ro XSS) đổi lấy đơn giản + bền qua reload. Nâng cấp sau: refreshToken httpOnly cookie (cần backend hỗ trợ).
- JWT giải mã ở `core/auth/jwt.util.ts` — **dò nhiều key** (`sub`/`nameid`/URI dài) vì backend .NET dùng `ClaimTypes.*`.

## Đặt tên & thư mục
- Feature gom theo mặt sản phẩm ở top-level: `features/{auth,candidate,employer,admin,invite,account}/`. 1 feature = 1 thư mục con (vd `features/candidate/practice/`). Component con (vd `audio-recorder`, `proctor.service`/`webcam-capture` trong `candidate/campaigns/`) đặt cạnh nơi dùng.
- Model/enum tập trung ở `core/models` (barrel `index.ts`).
