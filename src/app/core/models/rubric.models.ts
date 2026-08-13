import { CriterionLevelItem } from './campaign.models';
import { JobCategory } from './enums';

export interface RubricCriterionItem {
  id: string;
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
  /**
   * Mốc điểm của tiêu chí, sắp tăng dần theo `score`. Rỗng = chưa khai mốc (hợp lệ — bộ chấm rơi
   * về dải mặc định `0..maxScore` và không có mô tả nào để bám vào).
   *
   * Khi đang xem bộ mặc định (`isCustom=false`), đây là mốc do quản trị viên soạn. Bấm sửa là đã
   * có sẵn mốc để chỉnh — không phải bắt đầu từ trang trắng. Nếu thiếu vế này thì *dùng bộ mặc
   * định được thang có mô tả, còn tự tuỳ chỉnh lại bị thang rỗng nghĩa*, tức tự tuỳ chỉnh làm chất
   * lượng chấm TỆ ĐI mà người dùng không có cách nào biết.
   *
   * ⚠ Vẫn đọc phòng thủ (`?? []`): deploy backend cũ hơn không có field này.
   */
  levels?: CriterionLevelItem[];
}

export interface RubricResponse {
  jobCategory: JobCategory;
  isCustom: boolean; // true = rubric riêng, false = seed mặc định
  criteria: RubricCriterionItem[];
}

export interface RubricCriterionInput {
  name: string;
  description?: string | null;
  weight: number;
  maxScore: number;
  /**
   * Mốc điểm gửi lên. Luật giống hệt phía chiến dịch (2–10 mốc, phải có mốc `0` và mốc `maxScore`,
   * mô tả 20–500 ký tự) và được kiểm bằng **cùng một validator** — hai bản luật là hai bản sẽ lệch.
   *
   * `[]` = tiêu chí không có mốc, **hợp lệ**. Đây khác `CriterionItem.levels` của chiến dịch (nơi
   * `undefined` nghĩa là "không đổi"): rubric riêng lưu theo kiểu thay-toàn-bộ nên luôn gửi đủ.
   */
  levels?: CriterionLevelItem[];
}

export interface UpsertRubricRequest {
  criteria: RubricCriterionInput[]; // Σweight ≈ 1
}
