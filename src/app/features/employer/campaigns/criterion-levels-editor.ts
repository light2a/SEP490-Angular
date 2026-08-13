import { Component, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CriterionLevelItem } from '../../../core/models';

/**
 * Nguồn của mốc điểm trong PHIÊN SỬA hiện tại — chỉ để chọn nhãn hiển thị, KHÔNG gửi lên server.
 * `hr` cũng dùng cho mốc nạp từ chiến dịch đã lưu (mốc đã được người chốt), phân biệt với `ai`
 * là mốc vừa nhận từ gợi ý và chưa ai đọc lại.
 */
export type CriterionLevelsSource = 'none' | 'ai' | 'hr';

/** Số mốc tối thiểu / tối đa cho một tiêu chí (khớp guard backend). */
export const MIN_LEVELS = 2;
export const MAX_LEVELS = 10;
/** Độ dài mô tả một mốc. Quá ngắn thì không quan sát được, quá dài thì AI đọc loãng. */
export const MIN_DESCRIPTOR = 20;
export const MAX_DESCRIPTOR = 500;

/** Khung gợi ý hai vế — vế "CÒN THIẾU" mới là thứ dựng BIÊN giữa mức n và n+1. */
export const DESCRIPTOR_TEMPLATE = 'CÓ: \nCÒN THIẾU: ';

/** Đọc FormArray mốc của một hàng tiêu chí (rỗng nếu hàng chưa có mảng). */
export function levelsArray(group: AbstractControl): FormArray<FormGroup> {
  return group.get('levels') as FormArray<FormGroup>;
}

/** Giá trị mốc của một hàng tiêu chí, đã sắp TĂNG DẦN theo điểm (thứ tự gửi lên server). */
export function readLevels(group: AbstractControl): CriterionLevelItem[] {
  const arr = levelsArray(group);
  if (!arr) return [];
  return arr.controls
    .map((g) => ({
      score: Number(g.get('score')?.value),
      descriptor: String(g.get('descriptor')?.value ?? ''),
    }))
    .sort((a, b) => a.score - b.score);
}

/**
 * Chuỗi hoá chuẩn hoá của bộ mốc — dùng để trả lời "HR có thật sự đổi mốc không".
 *
 * Đây là thứ quyết định gửi hay không gửi `levels` lên server, thay cho một lá cờ "đã chạm": lá
 * cờ chỉ bật được ở chỗ code chủ động bật (thêm/xoá mốc), nên HR chỉ sửa CHỮ trong ô mô tả sẽ
 * không bật được cờ nào ⇒ sửa xong bấm Lưu mà không có gì thay đổi, và không lỗi nào báo.
 */
export function canonicalLevels(levels: CriterionLevelItem[]): string {
  return JSON.stringify(
    [...levels]
      .sort((a, b) => a.score - b.score)
      .map((l) => [Number(l.score), String(l.descriptor ?? '').trim()]),
  );
}

/**
 * Validator ở tầng HÀNG TIÊU CHÍ (không phải tầng mốc) vì mọi luật đều cần biết `maxScore`.
 *
 * KHÔNG có mốc nào là trạng thái **hợp lệ** (bộ chấm rơi về dải mặc định) — luật chỉ áp khi đã có
 * ít nhất một mốc. Hai luật dễ bị coi là thừa nhưng lại là chỗ hỏng câm:
 * - **thiếu mốc 0**: bài trả lời TRỐNG sẽ neo về mốc thấp nhất (vd 4/10) ⇒ ứng viên không nói gì
 *   vẫn có điểm, mà không lỗi nào nổ.
 * - **thiếu mốc bằng maxScore**: luật "câu trả lời mẫu ở mức điểm tối đa" trỏ vào một mức không
 *   tồn tại.
 */
export function criterionLevelsValidator(group: AbstractControl): ValidationErrors | null {
  const arr = levelsArray(group);
  if (!arr || arr.length === 0) return null;

  const maxScore = Number(group.get('maxScore')?.value);
  const rows = arr.controls.map((g) => ({
    score: g.get('score')?.value,
    descriptor: String(g.get('descriptor')?.value ?? ''),
  }));
  const scores = rows.map((r) => Number(r.score));
  const errors: ValidationErrors = {};

  if (arr.length < MIN_LEVELS || arr.length > MAX_LEVELS) errors['levelsCount'] = true;
  if (scores.some((s) => !Number.isFinite(s))) errors['levelsRange'] = true;
  else {
    if (scores.some((s) => s < 0 || (Number.isFinite(maxScore) && s > maxScore)))
      errors['levelsRange'] = true;
    if (new Set(scores).size !== scores.length) errors['levelsDuplicate'] = true;
    if (!scores.includes(0)) errors['levelsMissingZero'] = true;
    if (Number.isFinite(maxScore) && !scores.includes(maxScore)) errors['levelsMissingMax'] = true;
  }
  if (
    rows.some(
      (r) => r.descriptor.trim().length < MIN_DESCRIPTOR || r.descriptor.length > MAX_DESCRIPTOR,
    )
  )
    errors['levelsDescriptor'] = true;

  return Object.keys(errors).length ? errors : null;
}

/** Câu chữ tiếng Việt cho từng lỗi mốc — dùng chung cho editor và cho thông báo lúc bấm Lưu. */
export function levelErrorMessages(errors: ValidationErrors | null, maxScore: number): string[] {
  if (!errors) return [];
  const out: string[] = [];
  if (errors['levelsCount']) out.push(`Cần từ ${MIN_LEVELS} đến ${MAX_LEVELS} mốc.`);
  if (errors['levelsRange']) out.push(`Điểm mỗi mốc phải nằm trong khoảng 0–${maxScore}.`);
  if (errors['levelsDuplicate']) out.push('Hai mốc không được trùng điểm.');
  if (errors['levelsMissingZero'])
    out.push('Thiếu mốc 0 — không có mốc này thì bài bỏ trống vẫn được điểm.');
  if (errors['levelsMissingMax']) out.push(`Thiếu mốc điểm tối đa (${maxScore}).`);
  if (errors['levelsDescriptor'])
    out.push(`Mỗi mốc cần mô tả ${MIN_DESCRIPTOR}–${MAX_DESCRIPTOR} ký tự.`);
  return out;
}

/**
 * Soạn MỐC ĐIỂM cho một tiêu chí, mở ngay trong hàng tiêu chí của biểu mẫu chiến dịch.
 *
 * Vì sao không phải một bước riêng trong wizard: mốc là thuộc tính của tiêu chí, tách ra thì HR
 * phải nhớ tên tiêu chí ở màn khác. Dải chip thu gọn (`0 ─ 4 ─ 7 ─ 10`) là thứ duy nhất cần liếc
 * ở trạng thái bình thường.
 *
 * Danh sách mở rộng sắp **giảm dần từ mốc cao xuống thấp**: HR nghĩ theo "thế nào là 10 điểm" rồi
 * bóc dần xuống, chứ không dựng từ 0 lên. Mô tả là `<textarea>` chứ không phải `<input>` một dòng —
 * khung hai vế `CÓ:` / `CÒN THIẾU:` cần đúng hai dòng để đọc được.
 */
@Component({
  selector: 'app-criterion-levels-editor',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  template: `
    <div class="levels" [formGroup]="group()">
      <div class="strip-row">
        <span class="strip-label">Mốc điểm</span>

        @if (chips().length === 0) {
          <span class="strip-empty">chưa đặt</span>
        } @else {
          <span class="strip" data-testid="levels-strip">
            @for (c of chips(); track $index; let last = $last) {
              <span class="chip" [matTooltip]="c.descriptor">{{ c.score }}</span>
              @if (!last) {
                <span class="dash">─</span>
              }
            }
          </span>
        }

        <span class="badge" [class]="'badge-' + badgeKind()" data-testid="levels-badge">{{
          badgeText()
        }}</span>

        <span class="spacer"></span>

        <button
          mat-stroked-button
          type="button"
          class="ai-btn"
          [disabled]="disabled() || aiBusy()"
          (click)="aiRequest.emit()"
          data-testid="levels-ai-btn"
        >
          @if (aiBusy()) {
            <mat-icon class="spin">progress_activity</mat-icon>
          } @else {
            <mat-icon>auto_awesome</mat-icon>
          }
          AI gợi ý
        </button>

        <button
          mat-button
          type="button"
          (click)="expanded.set(!expanded())"
          data-testid="levels-toggle"
        >
          Sửa mốc
          <mat-icon>{{ expanded() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
      </div>

      @if (errorMessages().length > 0) {
        <ul class="lv-errors" data-testid="levels-errors">
          @for (m of errorMessages(); track m) {
            <li>{{ m }}</li>
          }
        </ul>
      }

      @if (expanded()) {
        <div class="lv-body" formArrayName="levels">
          <p class="lv-hint">
            Mô tả phải nói ứng viên <strong>làm/nói gì</strong> ở mốc đó — tránh "khá", "tốt",
            "chưa đạt" vì đó chỉ là đổi tên con số. Viết hai vế
            <strong>CÓ:</strong> … / <strong>CÒN THIẾU:</strong> … để AI có biên phân biệt giữa hai
            mốc liền nhau.
          </p>

          @if (rows().length === 0) {
            <p class="lv-empty">
              Chưa có mốc nào. Bộ chấm sẽ dùng dải mặc định 0–{{ maxScore() }} và không phân biệt
              được các mức. Bấm <strong>AI gợi ý</strong> hoặc thêm tay.
            </p>
          }

          @for (g of rows(); track g; let i = $index) {
            <div class="lv-row" [formGroupName]="i">
              <mat-form-field appearance="outline" class="lv-score">
                <mat-label>Điểm</mat-label>
                <input matInput type="number" formControlName="score" min="0" [max]="maxScore()" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="lv-desc">
                <mat-label>Ứng viên ở mốc này làm/nói gì</mat-label>
                <textarea
                  matInput
                  formControlName="descriptor"
                  rows="3"
                  [maxlength]="maxDescriptor"
                  placeholder="CÓ: nêu đúng khái niệm và cho 1 ví dụ cụ thể&#10;CÒN THIẾU: chưa nói được đánh đổi khi áp dụng"
                ></textarea>
                <mat-hint align="end">{{ descriptorLength(i) }} / {{ maxDescriptor }}</mat-hint>
              </mat-form-field>
              <button
                mat-icon-button
                type="button"
                [disabled]="disabled()"
                (click)="removeLevel(i)"
                aria-label="Xoá mốc"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }

          <div class="lv-actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="disabled() || rows().length >= maxLevels"
              (click)="addLevel()"
              data-testid="levels-add"
            >
              <mat-icon>add</mat-icon>
              Thêm mốc
            </button>
            @if (rows().length > 0) {
              <button
                mat-button
                type="button"
                [disabled]="disabled()"
                (click)="clearLevels()"
                data-testid="levels-clear"
              >
                Xoá hết mốc
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .levels {
        margin: -4px 0 12px;
      }
      .strip-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .strip-label {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .strip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .chip {
        min-width: 22px;
        padding: 1px 6px;
        border-radius: 10px;
        font-size: 12px;
        text-align: center;
        background: var(--mat-sys-surface-variant);
      }
      .dash {
        color: var(--mat-sys-outline);
        font-size: 12px;
      }
      .strip-empty {
        font-size: 12px;
        font-style: italic;
        color: var(--mat-sys-on-surface-variant);
      }
      .badge {
        padding: 1px 8px;
        border-radius: 8px;
        font-size: 11px;
      }
      .badge-none {
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .badge-ai {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .badge-hr {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .spacer {
        flex: 1;
      }
      .lv-errors {
        margin: 6px 0 0;
        padding-left: 20px;
        font-size: 12px;
        color: var(--mat-sys-error);
      }
      .lv-body {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-container);
      }
      .lv-hint,
      .lv-empty {
        margin: 0 0 10px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .lv-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .lv-score {
        width: 96px;
      }
      .lv-desc {
        flex: 1;
      }
      .lv-actions {
        display: flex;
        gap: 8px;
      }
      .spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class CriterionLevelsEditor {
  private fb = inject(FormBuilder);

  /** Hàng tiêu chí (FormGroup có `levels`, `maxScore`, `levelsTouched`, `levelsSource`). */
  readonly group = input.required<FormGroup>();
  /** Chiến dịch ngoài trạng thái Nháp → chỉ xem. */
  readonly disabled = input(false);
  /** Đang gọi AI gợi ý mốc (do cha giữ, vì request là của cả chiến dịch). */
  readonly aiBusy = input(false);
  /** Cha thực hiện lời gọi AI — component này không tự gọi mạng. */
  readonly aiRequest = output<void>();

  readonly expanded = signal(false);
  readonly maxLevels = MAX_LEVELS;
  readonly maxDescriptor = MAX_DESCRIPTOR;

  private arr(): FormArray<FormGroup> {
    return levelsArray(this.group());
  }

  /** Các hàng mốc theo đúng thứ tự đang giữ trong FormArray (đã sắp GIẢM DẦN lúc nạp/thêm). */
  rows(): FormGroup[] {
    return this.arr()?.controls ?? [];
  }

  maxScore(): number {
    return Number(this.group().get('maxScore')?.value ?? 10);
  }

  descriptorLength(i: number): number {
    return String(this.arr()?.at(i)?.get('descriptor')?.value ?? '').length;
  }

  /**
   * Dải chip thu gọn — sắp TĂNG DẦN để đọc như một cái thước.
   *
   * CỐ Ý là hàm thường chứ không phải `computed()`: nguồn dữ liệu là FormArray, không phải signal,
   * nên `computed()` sẽ nhớ giá trị cũ và dải chip đứng im sau khi HR sửa điểm.
   */
  chips(): CriterionLevelItem[] {
    return readLevels(this.group());
  }

  badgeKind(): CriterionLevelsSource {
    if (this.chips().length === 0) return 'none';
    return (this.group().get('levelsSource')?.value as CriterionLevelsSource) === 'ai' ? 'ai' : 'hr';
  }

  badgeText(): string {
    switch (this.badgeKind()) {
      case 'none':
        return 'Chưa có mốc';
      case 'ai':
        return 'AI gợi ý';
      default:
        return 'Đã sửa';
    }
  }

  errorMessages(): string[] {
    return levelErrorMessages(criterionLevelsValidator(this.group()), this.maxScore());
  }

  /** Điểm gợi ý cho mốc mới: ưu tiên 0, rồi maxScore, rồi số nguyên nhỏ nhất chưa dùng. */
  private suggestScore(): number {
    const used = new Set(this.chips().map((c) => c.score));
    const max = this.maxScore();
    if (!used.has(0)) return 0;
    if (Number.isFinite(max) && !used.has(max)) return max;
    for (let s = 1; s < max; s++) if (!used.has(s)) return s;
    return 0;
  }

  addLevel(): void {
    const arr = this.arr();
    if (!arr || arr.length >= MAX_LEVELS) return;
    arr.push(
      this.fb.group({ score: [this.suggestScore()], descriptor: [DESCRIPTOR_TEMPLATE] }),
    );
    this.markTouched();
    this.expanded.set(true);
  }

  removeLevel(i: number): void {
    this.arr()?.removeAt(i);
    this.markTouched();
  }

  /**
   * Xoá hết mốc = ý định XOÁ của HR, và đó là một trạng thái GỬI LÊN server (`levels: []`), không
   * phải "thôi không gửi nữa". Phép so với ảnh chụp lúc nạp (`levelsOriginal`) lo việc đó.
   */
  clearLevels(): void {
    this.arr()?.clear();
    this.markTouched();
  }

  /**
   * Chỉ đổi NHÃN hiển thị. Việc "có gửi `levels` lên server hay không" KHÔNG dựa vào đây mà dựa
   * vào so sánh với ảnh chụp lúc nạp — nếu dựa vào một lá cờ do editor tự bật thì HR chỉ sửa chữ
   * trong ô mô tả (không thêm/bớt mốc nào) sẽ không bật được cờ ⇒ **mất sửa đổi trong im lặng**.
   */
  private markTouched(): void {
    this.group().get('levelsSource')?.setValue('hr');
    this.group().updateValueAndValidity();
  }
}
