# API spec (FE) — bản rút gọn cho B2C + B2B (ứng viên)

> Nguồn đầy đủ: `ISAS-API-Spec-Frontend.docx` (bàn giao). Đây là phần FE B2C tiêu thụ. Backend đổi hợp đồng → cập nhật file này + `core/models` TRƯỚC khi sửa UI.

## Chung
- **Base:** mọi request qua Gateway `environment.apiBase` = `<gateway>/api/v1`. Dev gateway `http://localhost:5131`.
- **Auth:** header `Authorization: Bearer <accessToken>`. accessToken sống 15', refreshToken 7 ngày. 401 → `POST /auth/refresh`.
- **JSON:** camelCase. Enum: **Interview = CHUỖI**, **Payment = SỐ** (trừ `/order/{id}/status` = chuỗi).
- **Lỗi:** 400 (sai dữ liệu) · 401 (hết hạn) · **402 (hết credit)** · 403 · 404 · 409 · 502 (AI/PayOS bận).

## Auth — `/auth`
- `POST /register` `{email,password,fullName}` → `{accessToken,refreshToken,expiresAt}` (role Candidate).
- `POST /login` `{email,password}` → AuthResponse. 401 sai thông tin.
- `POST /refresh` `{refreshToken}` → AuthResponse (đủ 3 field).
- `POST /logout` `{refreshToken}` → 204.
- `GET /me` → `{id,fullName,email,location,title,createdAt,role}`.
- `POST /forgot-password` `{email}` · `POST /verify-otp` `{email,otp}` · `POST /reset-password` `{email,newPassword}` (trả **chuỗi** → responseType text).

## Files CV/JD — `/interview/files`
- `POST /upload` multipart `file` + query `fileType=cv|jd` (PDF ≤10MB) → UploadFileResponse.
- `GET /files` → FileRecord[] (path lặp `.../files/files`).
- `GET /{id}` · `GET /{id}/download` (blob) · `GET /{id}/parsed-text` · `DELETE /{id}`.

## Phân tích CV — `/interview/practice/cv-analysis`
- `POST` `{cvId, jobCategory(BA|BE|FE, bắt buộc), jdId?}` → CvAnalysisResponse. **−1 credit** (402 nếu hết). thiếu jobCategory → 400.
- `GET` (list) · `GET /{id}`.

## Luyện — `/interview/practice/sessions`
- `POST` `{jobCategory, cvId?, jdId?}` → PracticeSession. **−1 credit** (402). Poll `GeneratingQuestions→Ready`.
- `GET /history` → summary[]. `GET /{id}` → PracticeSession (questions + answer.scores + result).
- `POST /{sessionId}/answers` multipart `{questionId, file(audio), durationSec}` → UploadAnswerResult. Chấm dần khi upload. **INT-17 (phỏng vấn thích ứng):** response thêm `transcript?`, `nextAction? (follow_up|clarify|new_question|end)`, `nextQuestion?{id,orderNo,content,timeLimitSec,kind}`, `interviewComplete` — optional (client cũ bỏ qua vẫn chạy). `QuestionResponse`/`CampaignQuestion` thêm `kind? (Seed|FollowUp|Clarify|NewQuestion)`.
- `POST /{sessionId}/submit` → 204 (cần ≥1 câu). Poll tới `Scored` để lấy `result`.

## Roadmap — `/interview/practice/roadmaps`
- `POST` `{jobCategory, level(Fresher|Junior|Middle|Senior), cvId?}` → RoadmapResponse (miễn phí).
- `GET` · `GET /{id}` · `GET /{id}/lessons/{lessonId}` (theory lazy) · `GET /{id}/report`.
- `POST /{id}/lessons/{lessonId}/start` → PracticeSession (−1 credit). **409** body `{error, sessionId}` → resume.

## Rubric — `/interview/practice/rubrics/{jobCategory}`
- `GET` → `{jobCategory, isCustom, criteria[]}`. `PUT` `{criteria:[{name,description?,weight,maxScore}]}` (Σweight≈1, else 400). `DELETE` → về seed.

## Thanh toán — `/payment` (enum SỐ)
- `GET /package` (public) → PackageResponse[] (`type` 1=OneTime,2=Subscription).
- `POST /order` `{packageId}` → OrderResponse (**checkoutUrl** → redirect PayOS). HrMember→403.
- `GET /order/my-orders` · `GET /order/{id}` · `GET /order/{id}/status` (**status chuỗi**) · `DELETE /order/{id}` (huỷ Pending).
- `OrderStatus`: 1 Pending·2 Paid·3 Failed·4 Expired·5 Cancelled.

## Campaign B2B phía ứng viên — `/campaign` (enum CHUỖI)
- `GET /invitations/{token}` (**public**) → `{campaignId,title,orgName?,jobTitle,description,deadline,criteria[]}`.
- `POST /invitations/{token}/join` (**public**) → `{accessToken,campaignId,candidateId,membershipStatus}`. `accessToken` = JWT Candidate **KHÔNG kèm refreshToken** → `AuthStore.setAccessOnlySession()` (thay session hiện tại).
- `GET /my-campaigns` → summary[] `{campaignId,title,jobTitle,deadline,membershipStatus,interviewStatus}`.
- `GET /my-campaigns/{id}` → summary + `{description,criteria[],sessionId?,started}`.
- `POST /{id}/start` → `{sessionId,campaignId,questions[{id,orderNo,content,timeLimitSec}],faceEnrollRequired}`. Create-or-get (idempotent). **402** = ORG hết credit (errorInterceptor KHÔNG đẩy đi mua credit cá nhân với `/campaign/*`) · **409** = completed/closed.
- **Trả lời + nộp bài dùng lại endpoint Interview** (`/interview/practice/sessions/{sessionId}/answers|submit|GET`) — session B2B cùng shape.
- Proctoring (UI đã wire ở `features/candidate/campaigns`, API ở `CampaignApi`): `POST /{campaignId}/sessions/{sessionId}/flags` `{signalType: tab_switch|paste|focus_lost, note?}` · `POST .../face-enroll` + `.../face-check` (multipart `file`) → face-check trả `{match,faceCount,signals[]}`.

## KHÔNG gọi từ FE
AIService (internal-only, đã gỡ khỏi gateway) · `/internal/*` · webhook PayOS.
