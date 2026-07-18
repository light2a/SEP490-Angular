/**
 * Ngưỡng độ dài cho JD/tiêu chí người dùng nhập THẲNG dạng text (không qua file PDF).
 *
 * PHẢI khớp hằng số BE `Isas.Shared.Validation.TextInputLimits.JdTextMaxChars` — BE mới là nơi
 * enforce thật (vượt → 400). `maxlength` + bộ đếm ký tự ở FE chỉ để người dùng THẤY giới hạn
 * trước khi bấm gửi, thay vì ăn lỗi 400 sau khi đã gõ xong.
 *
 * Một ngưỡng DUY NHẤT cho cả B2B (JD campaign của Employer) lẫn B2C (JD buổi luyện + phân tích CV).
 * Vì sao 20.000: JD thật khuyến nghị 300–700 từ (~2.000–5.000 ký tự), JD dài dòng hiếm khi quá
 * 8.000–10.000 → rộng gấp 2–4 lần nên không chặn nhầm JD hợp lệ; đồng thời giữ phần đóng góp của
 * JD vào mỗi lời gọi Gemini ở mức bounded (chi phí token + chống lạm dụng).
 */
export const JD_TEXT_MAX_CHARS = 20_000;
