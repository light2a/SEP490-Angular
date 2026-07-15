# ISAS Frontend (Angular)

Frontend cho nền tảng phỏng vấn AI **ISAS**. Đợt 1: **B2C — Ứng viên luyện tập**.
Backend: 6 microservice .NET sau Gateway (repo `../isas-server`). FE chỉ gọi Gateway `/api/v1/*`.

## Bắt đầu nhanh
```bash
npm install
npm start        # http://localhost:4200  (Gateway dev: http://localhost:5131)
npm run build    # build production
npm test         # Vitest
```
Cần backend chạy (`../isas-server` → `docker compose up`) để dùng API thật. CORS Gateway đã cho phép `localhost:4200`.

## Tài liệu (harness)
- **[AGENTS.md](AGENTS.md)** — cửa vào: ràng buộc cứng, run/test, Định nghĩa "Xong", bản đồ code.
- [docs/conventions.md](docs/conventions.md) — quy ước Angular 21 (standalone/signals/zoneless/Material).
- [docs/api-spec.md](docs/api-spec.md) — hợp đồng API (B2C) FE tiêu thụ.
- [docs/feature-list.md](docs/feature-list.md) — feature + trạng thái (WIP=1).
- [docs/progress.md](docs/progress.md) — tiến độ + bước kế.
- [docs/skills.md](docs/skills.md) — Claude skills nên dùng + kỹ năng dev.

## Stack
Angular 21 (standalone · signals · zoneless) · Angular Material 3 · Vitest · TypeScript.
