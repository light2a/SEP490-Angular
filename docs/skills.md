# Claude Code Skills & Kỹ năng dev cho FE này

> Theo 2 nguồn user gửi: video "The Only Claude Skills You Need in 2026" (chọn ~8–12 skill, tránh "context tax") + khóa **Harness Engineering** (walkinglabs). Repo này áp harness: `AGENTS.md` + `docs/*` + WIP=1 + Định nghĩa "Xong" 3 lớp.

## ⭐ Claude skills / MCP nên dùng khi code FE
| Skill/MCP | Dùng cho |
|---|---|
| **Frontend Design** | Dựng UI/UX Angular Material đẹp, nhất quán |
| **Context7** (đã có trong phiên) | Tra docs Angular 21/Material mới (signals/zoneless/Signal Forms) — tránh code lệch version |
| **Playwright MCP** | Viết E2E test + drive app nghiệm thu luồng B2C (mic/record/upload/thanh toán) |
| **Skill Creator** | Tạo skill riêng "isas-angular" đóng gói convention repo (tự tạo skill) |
| **Doc Co-Authoring** | Viết/bảo trì `docs/*` (api-spec, conventions) |
| dataviz · verify · code-review (built-in) | Radar report · drive app kiểm luồng · cổng chất lượng |

## ◐ Cho workflow multi-agent (nếu chạy nhiều agent)
- **container-use** hoặc **claude-squad**: cô lập + song song agent an toàn (tránh đụng git worktree).
- **Superpowers** (nặng, bật khi cần) · **Task Master AI** (trùng `feature-list.md`, optional).

## ✕ Không liên quan dự án
autoresearch · gstack (Next.js) · Tavily · Marketing/SEO · Deep Research/GPT Researcher · Obsidian · n8n · Firecrawl · Langflow · Ghost OS. (Directory chỉ để tra cứu.)

## Kỹ năng dev cần có
- **Angular 21:** standalone, **signals** (signal/computed/effect), tư duy **zoneless/OnPush**, control flow `@if/@for/@switch`, `inject()`, functional guards/interceptors, lazy routing.
- **TypeScript** (union/discriminated union cho quirk response) · **Angular Material + CDK**.
- **Reactive Forms** (+ FormArray) · **HttpClient + interceptor** · **JWT auth/refresh** · RxJS căn bản / `httpResource()`.
- **Browser API:** MediaRecorder (ghi âm), FormData/multipart (upload), tải blob · luồng redirect **PayOS** + polling.
- Git + CI cơ bản · **Vitest** · đọc/hiểu API spec (enum-per-service, mã lỗi).
