import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { CampaignApi } from '../../../core/api/campaign.api';
import { NotifyService } from '../../../core/notify.service';
import {
  CAMPAIGN_LANGUAGE_OPTIONS,
  CAMPAIGN_SENIORITY_OPTIONS,
  CampaignResponse,
  CampaignLanguage,
  CampaignSeniority,
  CreateCampaignRequest,
  CriterionItem,
  CriterionLevelItem,
  ImportQuestionsResult,
  JD_TEXT_MAX_CHARS,
  QuestionItem,
  QuestionSource,
  UpdateCampaignRequest,
} from '../../../core/models';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { Spinner } from '../../../shared/ui/spinner';
import {
  CriterionLevelsEditor,
  CriterionLevelsSource,
  canonicalLevels,
  criterionLevelsValidator,
  levelErrorMessages,
  readLevels,
} from '../../../shared/rubric/criterion-levels-editor';
import { PreviewQuestionOption, RubricPreviewPanel } from './rubric-preview-panel';

/** ISO → giá trị datetime-local (theo giờ máy). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/** datetime-local → ISO string (UTC) hoặc null. */
function toIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

@Component({
  selector: 'app-campaign-form',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule,
    Spinner,
    CriterionLevelsEditor,
    RubricPreviewPanel,
  ],
  template: `
    <div class="head">
      <button mat-icon-button (click)="cancel()" aria-label="Quay lại">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h1>{{ campaignId() ? 'Sửa chiến dịch' : 'Tạo chiến dịch' }}</h1>
      @if (rubricVersion(); as v) {
        <span class="ruler-chip" [matTooltip]="rulerTooltip()" data-testid="ruler-chip"
          >Thước đo v{{ v }}</span
        >
      }
    </div>

    @if (loading()) {
      <app-spinner message="Đang tải..." />
    } @else {
      <!--
        Sửa mốc trên chiến dịch ĐANG CHẠY không hồi tố: người đã chấm giữ nguyên điểm, người thi
        sau dùng thước mới. Nói trước, vì "sửa tiêu chí" nghe như sửa cho cả bảng xếp hạng.
      -->
      @if (isActive()) {
        <mat-card class="notice ruler-notice" data-testid="active-ruler-banner">
          <mat-icon>published_with_changes</mat-icon>
          <span>
            Chiến dịch đang chạy. Sửa mốc điểm sẽ tạo <strong>thước đo v{{ nextRubricVersion() }}</strong>
            và chỉ áp cho ứng viên thi <strong>SAU khi lưu</strong> — người đã chấm bằng thước đo
            v{{ rubricVersion() }} giữ nguyên điểm.
          </span>
        </mat-card>
      }

      @if (readOnly()) {
        <mat-card class="notice">
          <mat-icon>lock</mat-icon>
          <span
            >Chiến dịch đã đóng hoặc lưu trữ — chỉ có thể xem, không chỉnh sửa được gì.</span
          >
        </mat-card>
      }

      <form [formGroup]="form" (ngSubmit)="submit()">
        <mat-card class="section">
          <h2>Thông tin chung</h2>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Tiêu đề *</mat-label>
            <input matInput formControlName="title" maxlength="200" />
          </mat-form-field>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Lĩnh vực / vị trí</mat-label>
              <input matInput formControlName="domain" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Cấp độ ứng viên</mat-label>
              <mat-select formControlName="seniority">
                @for (o of seniorityOptions; track o.value) {
                  <mat-option [value]="o.value">{{ o.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>AI ra đề khó/dễ theo mức này</mat-hint>
            </mat-form-field>
          </div>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Ngôn ngữ bài phỏng vấn</mat-label>
              <mat-select formControlName="language">
                @for (o of languageOptions; track o.value) {
                  <mat-option [value]="o.value">{{ o.label }}</mat-option>
                }
              </mat-select>
              <mat-hint>Câu hỏi + nhận xét AI theo ngôn ngữ này (không phải ngôn ngữ giao diện)</mat-hint>
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full">
            <mat-label>Mô tả công việc (JD)</mat-label>
            <!-- maxlength + bộ đếm: cho HR thấy giới hạn TRƯỚC khi gửi, thay vì ăn 400 từ BE
                 (BE mới là nơi enforce thật — xem TextInputLimits.JdTextMaxChars). -->
            <textarea
              matInput
              formControlName="jdText"
              rows="5"
              [maxlength]="jdTextMaxChars"
            ></textarea>
            <mat-hint align="end">{{ jdTextLength() }} / {{ jdTextMaxChars }}</mat-hint>
          </mat-form-field>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Số ứng viên tối đa</mat-label>
              <input matInput type="number" formControlName="maxCandidates" min="1" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Thời gian mỗi câu (phút) *</mat-label>
              <input matInput type="number" formControlName="timeLimitMinutes" min="1" />
            </mat-form-field>
          </div>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Điểm đạt (%)</mat-label>
              <input matInput type="number" formControlName="passScorePct" min="0" max="100" />
            </mat-form-field>
            <!--
              Trần thi đồng thời: guard backend là "running >= max", nên 0/số âm khoá chiến dịch
              vĩnh viễn ngay từ ứng viên ĐẦU TIÊN (mọi lượt Start trả 429). Chặn min=1 ở cả
              validator lẫn thuộc tính input.
            -->
            <mat-form-field appearance="outline">
              <mat-label>Số người thi cùng lúc tối đa</mat-label>
              <input
                matInput
                type="number"
                formControlName="maxConcurrentInterviews"
                min="1"
              />
              @if (form.controls.maxConcurrentInterviews.hasError('min')) {
                <mat-error>Phải từ 1 trở lên — đặt 0 sẽ khoá chiến dịch.</mat-error>
              } @else {
                <mat-hint>Để trống = không giới hạn</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Số câu mỗi ứng viên thi</mat-label>
              <input matInput type="number" min="1" formControlName="questionsPerSession" />
              @if (form.controls.questionsPerSession.hasError('min')) {
                <mat-error>Phải từ 1 trở lên.</mat-error>
              } @else {
                <mat-hint>
                  Để trống = ứng viên thi HẾT bộ câu hỏi. Đặt số nhỏ hơn = mỗi người bốc ngẫu nhiên
                  ngần đó câu (câu đánh dấu "Bắt buộc" thì ai cũng gặp), rút đều theo nhóm chủ đề.
                </mat-hint>
              }
            </mat-form-field>
          </div>

          <div class="two">
            <mat-form-field appearance="outline">
              <mat-label>Bắt đầu</mat-label>
              <input matInput type="datetime-local" formControlName="startsAt" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Kết thúc</mat-label>
              <input matInput type="datetime-local" formControlName="expiresAt" />
            </mat-form-field>
          </div>

          <div class="toggles">
            <mat-slide-toggle formControlName="antiCheatEnabled">Bật chống gian lận</mat-slide-toggle>
            <mat-slide-toggle formControlName="faceVerifyEnabled"
              >Bật xác thực khuôn mặt</mat-slide-toggle
            >
            <mat-slide-toggle formControlName="adaptiveEnabled"
              >Bật phỏng vấn thích ứng</mat-slide-toggle
            >
          </div>

          @if (form.controls.adaptiveEnabled.value) {
            <p class="hint-adaptive">
              Mọi ứng viên vẫn nhận đủ bộ câu hỏi bạn đã soạn. Sau khi trả lời hết, AI hỏi thêm vài
              câu bám theo câu trả lời của từng người — vẫn chấm theo đúng tiêu chí của chiến dịch.
            </p>
            <div class="two">
              <mat-form-field appearance="outline">
                <mat-label>Số câu AI hỏi thêm tối đa</mat-label>
                <input matInput type="number" min="0" formControlName="maxFollowUps" />
                <mat-hint>Để trống = dùng mặc định hệ thống</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Tổng số câu tối đa</mat-label>
                <input matInput type="number" min="0" formControlName="maxQuestions" />
                <mat-hint>Gồm cả câu bạn soạn + câu AI hỏi thêm</mat-hint>
              </mat-form-field>
            </div>
          }
        </mat-card>

        <mat-card class="section">
          <div class="section-head">
            <h2>Tiêu chí đánh giá</h2>
            <div class="head-right">
              <!--
                Ngang cấp với "Nhờ AI sinh câu hỏi" ở card dưới: đây là hành động của CẢ bộ tiêu
                chí (một lời gọi cho mọi tiêu chí), không phải của riêng hàng nào.
              -->
              @if (!readOnly()) {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="suggestLevels(null)"
                  [disabled]="!canSuggestLevels()"
                  data-testid="suggest-levels-all"
                >
                  @if (suggestingLevels()) {
                    <mat-icon class="spin">progress_activity</mat-icon>
                  } @else {
                    <mat-icon>auto_awesome</mat-icon>
                  }
                  {{ suggestingLevels() ? 'Đang gợi ý...' : 'Nhờ AI gợi ý mốc' }}
                </button>
              }
              <div class="w-total" [class.bad]="criteria.length > 0 && !weightOk()">
                Σ trọng số: {{ totalWeight().toFixed(2) }}
              </div>
            </div>
          </div>
          <p class="hint">Tổng trọng số nên xấp xỉ 1.00 (backend chuẩn hoá về 1).</p>

          <!--
            Ô mô tả tiêu chí dạng tự do. Backend đã nhận criteriaText từ lâu nhưng chưa màn hình
            nào cho nhập ⇒ HR không có cách nào mô tả tiêu chí bằng lời. Danh sách có cấu trúc bên
            dưới ƯU TIÊN CAO HƠN: có dòng nào ở đó thì lúc xuất bản backend dùng nó và bỏ qua text.
          -->
          <mat-form-field appearance="outline" class="full">
            <mat-label>Mô tả tiêu chí (tuỳ chọn)</mat-label>
            <textarea
              matInput
              formControlName="criteriaText"
              rows="4"
              [maxlength]="jdTextMaxChars"
              placeholder="Ví dụ: ưu tiên ứng viên có kinh nghiệm hệ phân tán, giao tiếp tiếng Anh tốt…"
            ></textarea>
            <mat-hint align="end">{{ criteriaTextLength() }} / {{ jdTextMaxChars }}</mat-hint>
          </mat-form-field>
          @if (criteria.length > 0 && criteriaTextLength() > 0) {
            <p class="hint warn-hint">
              Đang có tiêu chí dạng bảng bên dưới — khi xuất bản, hệ thống dùng bảng đó và
              <strong>bỏ qua phần mô tả tự do</strong>.
            </p>
          }

          <div formArrayName="criteria">
            @for (g of criteria.controls; track $index; let i = $index) {
              <div class="crit-block">
                <div class="crit-row" [formGroupName]="i">
                  <mat-form-field appearance="outline" class="c-name">
                    <mat-label>Tên tiêu chí *</mat-label>
                    <input matInput formControlName="name" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="c-num">
                    <mat-label>Trọng số</mat-label>
                    <input matInput type="number" formControlName="weight" step="0.05" min="0" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="c-num">
                    <mat-label>Điểm tối đa</mat-label>
                    <input matInput type="number" formControlName="maxScore" min="1" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="c-desc">
                    <mat-label>Mô tả</mat-label>
                    <input matInput formControlName="description" />
                  </mat-form-field>
                  <button
                    mat-icon-button
                    type="button"
                    (click)="removeCriterion(i)"
                    aria-label="Xoá tiêu chí"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
                <!--
                  Mốc điểm nằm NGOÀI [formGroupName] ở trên: component con tự bind [formGroup] cho
                  đúng hàng, nên lồng thêm một tầng tên nữa sẽ làm Angular tìm control sai đường.
                -->
                <app-criterion-levels-editor
                  [group]="g"
                  [disabled]="readOnly()"
                  [aiBusy]="suggestingLevels()"
                  (aiRequest)="suggestLevels(i)"
                />
              </div>
            }
          </div>
          <button mat-stroked-button type="button" (click)="addCriterion()">
            <mat-icon>add</mat-icon>
            Thêm tiêu chí
          </button>
        </mat-card>

        <mat-card class="section">
          <h2>Câu hỏi phỏng vấn *</h2>
          @if (questionsReadOnly() && !readOnly()) {
            <p class="hint warn-hint" data-testid="questions-locked-note">
              Chiến dịch đã xuất bản nên <strong>câu hỏi không sửa được nữa</strong> — mọi ứng viên
              phải nhận cùng một bộ đề. Tiêu chí và mốc điểm thì vẫn sửa được ở phần trên.
            </p>
          } @else {
            <p class="hint">Cần ít nhất 1 câu hỏi.</p>
          }

          @if (!questionsReadOnly()) {
            <div class="ai-gen">
              <div class="ai-gen-row">
                <mat-form-field appearance="outline" class="ai-count">
                  <mat-label>Số câu</mat-label>
                  <!-- Input thuần (không ngModel) để không trộn template-driven vào form reactive. -->
                  <input
                    matInput
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Tự động"
                    [value]="aiCount() ?? ''"
                    (input)="onAiCountInput($any($event.target).value)"
                  />
                </mat-form-field>
                <button
                  mat-stroked-button
                  type="button"
                  (click)="generateQuestions()"
                  [disabled]="!canGenerate()"
                >
                  @if (generating()) {
                    <mat-icon class="spin">progress_activity</mat-icon>
                  } @else {
                    <mat-icon>auto_awesome</mat-icon>
                  }
                  {{ generating() ? 'Đang sinh...' : 'Nhờ AI sinh từ JD' }}
                </button>
              </div>
              <p class="hint">
                @if (!campaignId()) {
                  Hãy tạo chiến dịch trước — AI đọc JD <strong>đã lưu</strong> để sinh câu hỏi.
                } @else {
                  AI đọc JD <strong>đã lưu</strong> của chiến dịch. Mỗi lần sinh sẽ
                  <strong>thay các câu AI trước đó</strong> nhưng <strong>giữ nguyên câu bạn tự gõ</strong>.
                }
              </p>
            </div>
          }

          @if (!questionsReadOnly()) {
            <div class="import-box">
              <div class="import-row">
                <button mat-stroked-button type="button" (click)="downloadTemplate()">
                  <mat-icon>download</mat-icon>
                  Tải file mẫu
                </button>
                <input
                  #csvInput
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  (change)="onCsvPicked($any($event.target).files)"
                />
                <button
                  mat-stroked-button
                  type="button"
                  (click)="csvInput.click()"
                  [disabled]="importing()"
                >
                  @if (importing()) {
                    <mat-icon class="spin">progress_activity</mat-icon>
                  } @else {
                    <mat-icon>upload_file</mat-icon>
                  }
                  {{ importing() ? 'Đang đọc file...' : 'Nhập từ file CSV' }}
                </button>
              </div>
              <p class="hint">
                Tải file mẫu, điền bằng Excel rồi lưu lại dạng
                <strong>CSV UTF-8 (Comma delimited)</strong>. Nội dung trong file
                <strong>chưa được lưu</strong> — bạn xem trước rồi bấm Lưu như bình thường.
              </p>

              @if (importPreview(); as preview) {
                <div class="import-preview">
                  <p>
                    Đọc được <strong>{{ preview.questions.length }}</strong> câu hỏi hợp lệ
                    trên tổng {{ preview.totalRows }} dòng.
                  </p>

                  @if (preview.errors.length) {
                    <ul class="import-errors">
                      @for (e of preview.errors; track $index) {
                        <li>Dòng {{ e.line }}{{ e.column ? ' (' + e.column + ')' : '' }}: {{ e.message }}</li>
                      }
                    </ul>
                  }

                  <div class="import-actions">
                    <button
                      mat-flat-button
                      type="button"
                      (click)="applyImport('replace')"
                      [disabled]="!preview.questions.length"
                    >
                      Thay toàn bộ câu hỏi
                    </button>
                    <button
                      mat-stroked-button
                      type="button"
                      (click)="applyImport('append')"
                      [disabled]="!preview.questions.length"
                    >
                      Thêm vào cuối
                    </button>
                    <button mat-button type="button" (click)="cancelImport()">Huỷ</button>
                  </div>
                </div>
              }
            </div>
          }

          <div formArrayName="questions">
            @for (g of questions.controls; track $index; let i = $index) {
              <div class="q-row" [formGroupName]="i">
                <mat-form-field appearance="outline" class="q-text">
                  <mat-label>
                    Câu hỏi #{{ i + 1 }} *
                    @if (isAiQuestion(i)) {
                      <span class="ai-badge">AI sinh</span>
                    }
                  </mat-label>
                  <textarea matInput formControlName="questionText" rows="2"></textarea>
                </mat-form-field>
                <mat-form-field appearance="outline" class="q-text">
                  <mat-label>Đáp án mẫu (không bắt buộc)</mat-label>
                  <textarea matInput formControlName="sampleAnswer" rows="2"></textarea>
                  <mat-hint>
                    AI dùng làm mốc để chấm sát chuẩn của công ty. Đây là MỘT đáp án tốt, ứng viên
                    diễn đạt khác mà đúng vẫn được điểm.
                  </mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="q-group">
                  <mat-label>Nhóm chủ đề</mat-label>
                  <input matInput formControlName="questionGroup" placeholder="VD: Thuật toán" />
                </mat-form-field>
                <mat-checkbox formControlName="isRequired">Bắt buộc</mat-checkbox>
                <button
                  mat-icon-button
                  type="button"
                  [disabled]="questionsReadOnly()"
                  (click)="removeQuestion(i)"
                  aria-label="Xoá câu hỏi"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
          @if (!questionsReadOnly()) {
            <button mat-stroked-button type="button" (click)="addQuestion()">
              <mat-icon>add</mat-icon>
              Thêm câu hỏi
            </button>
          }
        </mat-card>

        <!--
          Chấm thử chạy trên bộ tiêu chí + câu hỏi ĐÃ LƯU (không phải bản đang gõ dở), nên chỉ có
          nghĩa khi chiến dịch đã tồn tại. Danh sách câu hỏi lấy từ bản tải về, không lấy từ form.
        -->
        @if (campaignId(); as cid) {
          @if (previewQuestions().length > 0) {
            <app-rubric-preview-panel
              [campaignId]="cid"
              [questions]="previewQuestions()"
              [rubricVersion]="original()?.rubricVersion ?? null"
              [formDirty]="form.dirty"
            />
          }
        }

        <div class="actions">
          <button mat-button type="button" (click)="cancel()">Huỷ</button>
          <!--
            Khoá luôn khi mốc hỏng: thang méo (thiếu mốc 0, mốc trùng điểm) KHÔNG sinh lỗi nào lúc
            chấm — nó chỉ lặng lẽ cho điểm sai, nên phải chặn ngay tại chỗ nhập.
          -->
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="saving() || readOnly() || hasLevelIssues()"
          >
            @if (saving()) {
              <mat-icon class="spin">progress_activity</mat-icon>
            }
            {{ campaignId() ? 'Lưu thay đổi' : 'Tạo chiến dịch' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      .ai-gen {
        margin-bottom: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .ai-gen-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ai-count {
        width: 120px;
      }
      .ai-badge {
        margin-left: 6px;
        padding: 1px 8px;
        border-radius: 8px;
        font-size: 11px;
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .section {
        padding: 20px;
        margin-bottom: 16px;
      }
      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .head-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .crit-block {
        padding: 4px 0 8px;
        border-bottom: 1px solid var(--mat-sys-outline-variant);
        margin-bottom: 8px;
      }
      .ruler-chip {
        margin-left: auto;
        padding: 3px 10px;
        border-radius: 12px;
        font-size: 12px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .ruler-notice {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .notice {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        margin-bottom: 16px;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .full {
        width: 100%;
      }
      .two {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .toggles {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .hint-adaptive {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        background: var(--mat-sys-surface-container);
        border-radius: 8px;
        padding: 10px 12px;
        margin: 12px 0;
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin: 0 0 12px;
      }
      .warn-hint {
        padding: 8px 12px;
        border-radius: 8px;
        background: #fff8e1;
        color: #6d4c00;
      }
      .w-total {
        font-weight: 600;
      }
      .w-total.bad {
        color: var(--mat-sys-error);
      }
      .crit-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .c-name {
        flex: 2;
        min-width: 160px;
      }
      .c-num {
        flex: 1;
        min-width: 90px;
      }
      .c-desc {
        flex: 2;
        min-width: 160px;
      }
      .q-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .q-text {
        flex: 1;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
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
export class CampaignForm implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(CampaignApi);
  private notify = inject(NotifyService);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  /** Có param → chế độ sửa. */
  readonly campaignId = input<string>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  /**
   * Khoá TOÀN BỘ biểu mẫu — chỉ `Closed`/`Archived`.
   *
   * Trước đây cờ này bật cho mọi trạng thái khác `Draft`, nên chiến dịch `Active` bị khoá cứng và
   * quyền "sửa mốc điểm khi đang chạy" không có đường nào dùng được từ giao diện.
   */
  readonly readOnly = signal(false);

  /**
   * Khoá riêng phần CÂU HỎI. Bật cho mọi trạng thái khác `Draft` vì CAMP-2 giữ nguyên cho câu hỏi:
   * `PUT /campaign/{id}/questions` trên `Active` vẫn trả **409**. Tiêu chí + mốc điểm thì backend
   * đã mở, nên hai thứ này KHÔNG còn dùng chung một cờ được nữa.
   */
  readonly questionsReadOnly = signal(false);
  /** Đang gọi AI sinh câu hỏi (F9) — khoá nút để không bắn 2 lần. */
  readonly generating = signal(false);
  /** Đang gọi AI gợi ý mốc điểm — khoá cả nút chung lẫn nút từng hàng. */
  readonly suggestingLevels = signal(false);
  /** Số câu muốn AI sinh (1..20); null = để backend tự quyết. */
  readonly aiCount = signal<number | null>(null);
  /** Đang đọc file CSV — khoá nút để không bắn 2 lần. */
  readonly importing = signal(false);
  /**
   * Kết quả đọc file, CHƯA lưu. Backend chỉ đọc file và trả về; muốn lưu thì HR bấm Lưu như bình
   * thường. Nhờ thế file hỏng mã hoá chỉ làm HR thấy chữ lỗi ở đây rồi bấm Huỷ.
   */
  readonly importPreview = signal<ImportQuestionsResult | null>(null);
  /** Bản tải về từ máy chủ — nguồn cho những thứ backend chấm/sinh dựa trên dữ liệu ĐÃ LƯU. */
  readonly original = signal<CampaignResponse | null>(null);

  /**
   * Câu hỏi cho ô chọn của chấm thử — lấy từ bản ĐÃ LƯU chứ không phải từ form: máy chủ chấm thử
   * theo `questionId` trong DB, câu vừa gõ chưa Lưu thì chưa có id để gửi đi.
   */
  /**
   * Phiên bản thước đo hiện tại. `null` khi chiến dịch tạo trước tính năng này (hoặc deploy backend
   * cũ hơn) — lúc đó KHÔNG vẽ chip, vì "không biết" mà hiện "v1" là bịa.
   */
  rubricVersion(): number | null {
    return this.original()?.rubricVersion ?? null;
  }

  /** Số phiên bản sẽ nhận nếu HR sửa mốc bây giờ — dùng trong lời cảnh báo cho chiến dịch Active. */
  nextRubricVersion(): number {
    return (this.rubricVersion() ?? 1) + 1;
  }

  isActive(): boolean {
    return this.original()?.status === 'Active';
  }

  rulerTooltip(): string {
    const c = this.original();
    if (!c?.rubricVersionUpdatedAt) return 'Thước đo gốc — chưa ai sửa mốc điểm.';
    const when = new Date(c.rubricVersionUpdatedAt).toLocaleString('vi-VN');
    return c.rubricVersionUpdatedBy
      ? `Sửa lần cuối ${when} bởi ${c.rubricVersionUpdatedBy}`
      : `Sửa lần cuối ${when}`;
  }

  previewQuestions(): PreviewQuestionOption[] {
    return (this.original()?.questions ?? [])
      .filter((q) => !!q.id)
      .map((q) => ({ id: q.id, questionText: q.questionText }));
  }

  /** Giới hạn ký tự JD nhập tay — khớp hằng số BE (vượt → 400). */
  readonly jdTextMaxChars = JD_TEXT_MAX_CHARS;

  /** Độ dài JD hiện tại cho bộ đếm dưới textarea (theo dõi cả patchValue lúc load bản nháp). */
  readonly jdTextLength = signal(0);

  /** Độ dài mô tả tiêu chí — cùng ngưỡng với JD (BE dùng chung `TextInputLimits.JdTextMaxChars`). */
  readonly criteriaTextLength = signal(0);

  readonly seniorityOptions = CAMPAIGN_SENIORITY_OPTIONS;
  readonly languageOptions = CAMPAIGN_LANGUAGE_OPTIONS;

  readonly form = this.fb.group({
    title: ['', [Validators.required]],
    domain: [''],
    // Luôn có giá trị hợp lệ trong 4 mức — ô này KHÔNG có lựa chọn rỗng, vì backend trả 400 với ''.
    seniority: ['Junior' as CampaignSeniority, [Validators.required]],
    // Cùng luật với seniority: không có lựa chọn rỗng, vì backend trả 400 với ''.
    language: ['vi' as CampaignLanguage, [Validators.required]],
    jdText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
    criteriaText: ['', [Validators.maxLength(JD_TEXT_MAX_CHARS)]],
    maxCandidates: [null as number | null],
    timeLimitMinutes: [15 as number | null, [Validators.required, Validators.min(1)]],
    passScorePct: [null as number | null],
    // >= 1 bắt buộc: 0/âm biến `running >= max` thành đúng luôn ⇒ khoá chiến dịch vĩnh viễn.
    maxConcurrentInterviews: [null as number | null, [Validators.min(1)]],
    // NGÂN HÀNG ĐỀ — số câu mỗi ứng viên thi. Để trống = thi hết bộ (hành vi trước tính năng này).
    // >= 1 bắt buộc: 0 nghĩa là buổi thi không câu nào, backend sẽ từ chối lúc ứng viên bấm Bắt đầu.
    questionsPerSession: [null as number | null, [Validators.min(1)]],
    startsAt: [''],
    expiresAt: [''],
    antiCheatEnabled: [false],
    faceVerifyEnabled: [false],
    // INT-17: phỏng vấn thích ứng — AI hỏi thêm ở ĐUÔI sau khi ứng viên trả lời hết câu seed.
    // Trần để trống = dùng mặc định phía backend. form.disable() (ngoài Draft) tự cascade xuống.
    adaptiveEnabled: [false],
    maxFollowUps: [null as number | null, [Validators.min(0)]],
    maxQuestions: [null as number | null, [Validators.min(0)]],
    criteria: this.fb.array<FormGroup>([]),
    questions: this.fb.array<FormGroup>([]),
  });

  constructor() {
    // Đồng bộ bộ đếm ký tự với control (bắt cả gõ tay lẫn patchValue khi load campaign để sửa).
    this.form.controls.jdText.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.jdTextLength.set(v?.length ?? 0));
    this.form.controls.criteriaText.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v) => this.criteriaTextLength.set(v?.length ?? 0));
  }

  get criteria(): FormArray<FormGroup> {
    return this.form.get('criteria') as FormArray<FormGroup>;
  }
  get questions(): FormArray<FormGroup> {
    return this.form.get('questions') as FormArray<FormGroup>;
  }

  ngOnInit(): void {
    const id = this.campaignId();
    if (!id) {
      // Tạo mới — mặc định 1 câu hỏi + startsAt = bây giờ + 5 phút để tránh 400 "quá khứ".
      const start = new Date(Date.now() + 5 * 60000);
      const end = new Date(Date.now() + 7 * 24 * 60 * 60000);
      this.form.patchValue({
        startsAt: toLocalInput(start.toISOString()),
        expiresAt: toLocalInput(end.toISOString()),
      });
      this.addQuestion();
      return;
    }

    this.loading.set(true);
    this.api.getCampaign(id).subscribe({
      next: (c) => {
        this.original.set(c);
        this.hydrate(c);
        this.readOnly.set(c.status === 'Closed' || c.status === 'Archived');
        this.questionsReadOnly.set(c.status !== 'Draft');
        if (this.readOnly()) {
          this.form.disable();
        } else if (this.questionsReadOnly()) {
          // Chỉ khoá mảng câu hỏi: phần còn lại (metadata + tiêu chí + mốc) vẫn sửa được, và
          // `getRawValue()` lúc gửi vẫn đọc được giá trị của control đã khoá.
          this.questions.disable();
        }
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được chiến dịch.');
        this.router.navigate(['/employer/campaigns']);
      },
    });
  }

  private hydrate(c: CampaignResponse): void {
    this.form.patchValue({
      title: c.title,
      domain: c.domain ?? '',
      // Chiến dịch cũ (trước khi có cột) không trả seniority → về mặc định backend, KHÔNG để rỗng.
      seniority: c.seniority ?? 'Junior',
      // Chiến dịch tạo trước khi có cột không trả language → mặc định backend, KHÔNG để rỗng.
      language: c.language ?? 'vi',
      jdText: c.jdText ?? '',
      criteriaText: c.criteriaText ?? '',
      maxCandidates: c.maxCandidates ?? null,
      timeLimitMinutes: c.timeLimitMinutes ?? 15,
      passScorePct: c.passScorePct ?? null,
      maxConcurrentInterviews: c.maxConcurrentInterviews ?? null,
      questionsPerSession: c.questionsPerSession ?? null,
      startsAt: toLocalInput(c.startsAt),
      expiresAt: toLocalInput(c.expiresAt),
      antiCheatEnabled: c.antiCheatEnabled,
      faceVerifyEnabled: c.faceVerifyEnabled,
      adaptiveEnabled: c.adaptiveEnabled,   // INT-17
      maxFollowUps: c.maxFollowUps ?? null,
      maxQuestions: c.maxQuestions ?? null,
    });
    this.criteria.clear();
    c.criteria.forEach((cr) =>
      this.criteria.push(
        this.critRow(
          cr.name,
          cr.weight,
          cr.maxScore,
          cr.description ?? '',
          // `?? []` chứ không bind thẳng: chiến dịch tạo trước tính năng mốc điểm (hoặc deploy
          // backend cũ hơn) không có field này, `undefined.sort()` sẽ làm trắng cả trang sửa.
          cr.levels ?? [],
          'hr',
        ),
      ),
    );
    this.questions.clear();
    c.questions.forEach((q) =>
      // F10 — nạp kèm `id` để lần Lưu kế echo lại được (thiếu id = BE xoá-và-tạo-lại, mất id câu AI).
      this.questions.push(
        this.questionRow(
          q.questionText,
          q.isRequired,
          q.source,
          q.id ?? null,
          q.sampleAnswer ?? '',
          q.questionGroup ?? '',
        ),
      ),
    );
    if (this.questions.length === 0) this.addQuestion();
  }

  // ── Criteria ───────────────────────────────────────────────────────────────
  /**
   * Một hàng tiêu chí, kèm phần MỐC ĐIỂM.
   *
   * Ba control không hiện trên màn nhưng quyết định việc "có gửi `levels` lên server hay không":
   * - `levels`: mảng mốc, giữ theo thứ tự GIẢM DẦN để khớp cách đọc của editor.
   * - `levelsOriginal`: ảnh chụp chuẩn hoá lúc nạp. So với nó mới biết HR có đổi gì thật không —
   *   nếu cứ gửi mảng hiện tại vô điều kiện thì mỗi lần Lưu là **xoá sạch mốc** (mảng khởi tạo
   *   rỗng ⇒ BE hiểu `[]` = xoá), mà không có lỗi nào để ai nhận ra.
   * - `originalName`: tên lúc nạp. BE ghép mốc cũ sang tiêu chí mới theo TÊN (vì PUT là
   *   replace-all sinh id mới), nên đổi tên mà không gửi kèm `levels` là mốc bay mất.
   */
  private critRow(
    name = '',
    weight = 0.25,
    maxScore = 10,
    description = '',
    levels: CriterionLevelItem[] = [],
    source: CriterionLevelsSource = 'none',
  ): FormGroup {
    return this.fb.group(
      {
        name: [name, [Validators.required]],
        weight: [weight, [Validators.required, Validators.min(0)]],
        maxScore: [maxScore, [Validators.required, Validators.min(1)]],
        description: [description],
        // Hiển thị giảm dần: HR nghĩ theo "thế nào là điểm tối đa" rồi bóc dần xuống.
        levels: this.fb.array<FormGroup>(
          [...levels]
            .sort((a, b) => b.score - a.score)
            .map((l) => this.fb.group({ score: [l.score], descriptor: [l.descriptor] })),
        ),
        levelsOriginal: [canonicalLevels(levels)],
        levelsSource: [levels.length ? source : 'none'],
        originalName: [name || null],
      },
      { validators: criterionLevelsValidator },
    );
  }
  addCriterion(): void {
    this.criteria.push(this.critRow());
  }
  removeCriterion(i: number): void {
    this.criteria.removeAt(i);
  }
  // ── Mốc điểm: nhờ AI gợi ý ──────────────────────────────────────────────────
  /**
   * Backend đọc bộ tiêu chí **đã lưu trong DB** (giống F9 đọc JD đã lưu), rồi trả mốc về cho HR
   * xem/sửa — **không ghi gì**. Vì thế tiêu chí vừa gõ mà chưa Lưu sẽ không có trong kết quả:
   * nói thẳng ra thay vì để HR tưởng AI "bỏ sót" tiêu chí của mình.
   */
  canSuggestLevels(): boolean {
    return (
      !!this.campaignId() &&
      !this.readOnly() &&
      !this.suggestingLevels() &&
      this.criteria.length > 0
    );
  }

  /** `index = null` → áp cho mọi tiêu chí; có số → chỉ áp cho đúng hàng đó. */
  suggestLevels(index: number | null): void {
    const id = this.campaignId();
    if (!id) {
      this.notify.warn('Hãy tạo (lưu) chiến dịch trước — AI cần bộ tiêu chí đã lưu.');
      return;
    }
    if (this.readOnly()) {
      this.notify.warn('Chiến dịch đã xuất bản — không sửa được tiêu chí ở đây.');
      return;
    }
    if (this.criteria.length === 0) {
      this.notify.warn('Hãy thêm ít nhất 1 tiêu chí trước khi nhờ AI gợi ý mốc.');
      return;
    }

    const targets =
      index == null ? this.criteria.controls : [this.criteria.controls[index]].filter(Boolean);
    // Chỉ cảnh báo về mốc do NGƯỜI chốt (nạp từ chiến dịch đã lưu hoặc vừa sửa tay). Mốc AI gợi ý
    // lần trước mà chưa ai đụng vào thì ghi đè không mất gì của HR.
    const overwritten = targets
      .filter(
        (g) =>
          (g.get('levels') as FormArray).length > 0 && g.get('levelsSource')?.value === 'hr',
      )
      .map((g) => (g.get('name')?.value as string) || '(chưa đặt tên)');

    const run = () => this.runSuggestLevels(id, index);
    if (overwritten.length === 0 && !this.form.dirty) {
      run();
      return;
    }

    const data: ConfirmDialogData = {
      title: 'Nhờ AI gợi ý mốc điểm?',
      message:
        'AI đọc bộ tiêu chí đã lưu của chiến dịch rồi viết mốc điểm cho từng tiêu chí. Kết quả chỉ hiện trên biểu mẫu — bấm Lưu mới ghi lại.',
      bullets: overwritten.length
        ? [`Mốc hiện có sẽ bị THAY của: ${overwritten.join(', ')}.`]
        : ['Chưa có mốc nào bị ghi đè.'],
      warning: this.form.dirty
        ? 'Biểu mẫu đang có thay đổi CHƯA LƯU. AI đọc bộ tiêu chí đã lưu trên máy chủ, nên tiêu chí bạn vừa thêm/đổi tên sẽ không có trong kết quả.'
        : undefined,
      confirmLabel: 'Gợi ý mốc',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '520px' })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) run();
      });
  }

  private runSuggestLevels(id: string, index: number | null): void {
    this.suggestingLevels.set(true);
    this.api.suggestCriterionLevels(id).subscribe({
      next: (res) => {
        this.suggestingLevels.set(false);
        const applied = this.applySuggestedLevels(res.criteria ?? [], index);
        if (applied === 0) {
          this.notify.warn(
            'AI không trả về mốc cho tiêu chí nào khớp. Kiểm tra xem tiêu chí đã được lưu chưa.',
          );
        } else {
          this.notify.success(`Đã điền mốc cho ${applied} tiêu chí. Bấm Lưu để ghi lại.`);
        }
      },
      error: (e: HttpErrorResponse) => {
        this.suggestingLevels.set(false);
        // Cố ý KHÔNG điền dải mặc định thay thế: mốc bịa ("Mức 3/10") trông y như mốc thật.
        this.notify.error(extractErrorMessage(e) ?? 'Gợi ý mốc bằng AI thất bại.');
      },
    });
  }

  /**
   * Ghép kết quả AI vào form theo **TÊN** (không phân biệt hoa/thường) chứ không theo id: PUT là
   * replace-all mint id mới nên id trong form có thể đã cũ, còn tên chính là khoá BE dùng để ghép
   * mốc — dùng chung một khoá thì hai bên không lệch nhau được.
   */
  private applySuggestedLevels(
    suggested: { name: string; levels: CriterionLevelItem[] }[],
    index: number | null,
  ): number {
    const byName = new Map(suggested.map((s) => [(s.name ?? '').trim().toLowerCase(), s]));
    let applied = 0;
    this.criteria.controls.forEach((g, i) => {
      if (index != null && i !== index) return;
      const hit = byName.get(((g.get('name')?.value as string) ?? '').trim().toLowerCase());
      if (!hit?.levels?.length) return;
      const arr = g.get('levels') as FormArray<FormGroup>;
      arr.clear();
      [...hit.levels]
        .sort((a, b) => b.score - a.score)
        .forEach((l) =>
          arr.push(this.fb.group({ score: [l.score], descriptor: [l.descriptor] })),
        );
      g.get('levelsSource')?.setValue('ai');
      g.updateValueAndValidity();
      applied++;
    });
    return applied;
  }

  totalWeight(): number {
    return this.criteria.controls.reduce((s, g) => s + Number(g.get('weight')?.value || 0), 0);
  }
  weightOk(): boolean {
    const t = this.totalWeight();
    return t >= 0.99 && t <= 1.01;
  }

  /**
   * Giá trị `seniority` an toàn để gửi đi. Trả `undefined` (⇒ bỏ hẳn field) thay vì `''` khi ô
   * bằng cách nào đó rỗng: chuỗi rỗng bị backend trả **400** — có chủ đích, vì trước đây nó
   * âm thầm hạ mức đã chọn về Junior. Bỏ field = "không đổi" (update) / "mặc định Junior" (create).
   */
  private seniorityValue(): CampaignSeniority | undefined {
    const v = this.form.controls.seniority.value;
    return v ? v : undefined;
  }

  /**
   * Giá trị `language` an toàn để gửi đi — cùng bẫy với `seniority`: backend coi `null` là
   * "không khai" (mặc định 'vi') nhưng trả **400** với chuỗi rỗng. Bỏ hẳn field thay vì gửi ''.
   */
  private languageValue(): CampaignLanguage | undefined {
    const v = this.form.controls.language.value;
    return v ? v : undefined;
  }

  // ── Questions ────────────────────────────────────────────────────────────────
  /**
   * `source` được MANG THEO trong form chứ không phải hằng số lúc gửi đi: trước đây
   * `buildQuestions()` gán cứng `'CustomHr'` cho mọi câu, nên chỉ cần HR bấm "Lưu thay đổi"
   * một lần là toàn bộ dấu vết `AiGenerated` bị xoá sạch — badge "AI sinh" biến mất và lần
   * sinh lại kế tiếp không còn biết câu nào của AI để thay (F9/F10).
   */
  private questionRow(
    questionText = '',
    isRequired = true,
    source: QuestionSource = 'CustomHr',
    id: string | null = null,
    sampleAnswer = '',
    questionGroup = '',
  ): FormGroup {
    return this.fb.group({
      questionText: [questionText, [Validators.required]],
      isRequired: [isRequired],
      source: [source],
      // Đáp án mẫu + nhóm chủ đề. Ô trống = ý định XOÁ của HR, và buildQuestions() gửi chuỗi rỗng
      // đúng như thế — BE hiểu '' là xoá, còn "không gửi field" là giữ nguyên.
      sampleAnswer: [sampleAnswer],
      questionGroup: [questionGroup],
      // F10 — `id` KHÔNG hiện trên form nhưng phải sống sót qua vòng đọc→sửa→lưu: BE merge theo id để
      // sửa TẠI CHỖ. Thiếu id thì mỗi lần Lưu là xoá-và-tạo-lại ⇒ id câu AI đổi hết, đúng thứ F10
      // sinh ra để chặn. (Ghép từ nhánh F10 vòng 2 — bản F9 vòng 3 không mang id.)
      id: [id],
    });
  }

  /**
   * Nguồn gốc câu hỏi thứ `i` (F10). Trả nguyên giá trị chứ không phải cờ boolean: một câu có thể
   * mang nguồn khác `AiGenerated`/`CustomHr` nếu BE thêm giá trị mới, và lúc đó cờ boolean sẽ nói dối
   * ("không phải AI" ≠ "do HR gõ").
   */
  questionSource(i: number): QuestionSource | null {
    return this.questions.at(i)?.get('source')?.value ?? null;
  }

  /** Câu do AI sinh (để hiện badge). */
  isAiQuestion(i: number): boolean {
    return this.questionSource(i) === 'AiGenerated';
  }
  addQuestion(): void {
    this.questions.push(this.questionRow());
  }
  removeQuestion(i: number): void {
    this.questions.removeAt(i);
  }

  // ── Sinh câu hỏi bằng AI (F9) ────────────────────────────────────────────────
  /**
   * Backend đọc JD **đã lưu trong DB**, không phải chữ đang gõ trong form. Nên nếu HR vừa dán JD
   * mà chưa bấm Lưu thì AI sẽ đọc JD cũ (hoặc rỗng → 400) — im lặng làm sai chứ không báo lỗi gì
   * rõ ràng. Chặn trước ở đây và nói thẳng lý do.
   */
  canGenerate(): boolean {
    return !!this.campaignId() && !this.questionsReadOnly() && !this.generating();
  }

  /** Ô trống = để backend tự quyết số câu (null), không phải 0. */
  onAiCountInput(raw: string): void {
    const t = (raw ?? '').trim();
    this.aiCount.set(t === '' ? null : Number(t));
  }

  // ── Nhập câu hỏi từ file CSV ──────────────────────────────────────────────
  //
  // Backend CHỈ ĐỌC file và trả danh sách; không ghi gì. HR xem trước ở đây rồi bấm Lưu như bình
  // thường, nên guard "chỉ sửa khi Draft", nhật ký thao tác và luật trộn câu F10 vẫn nằm đúng một
  // chỗ — và file hỏng mã hoá chỉ làm HR thấy chữ lỗi trên màn hình rồi bấm Huỷ.

  downloadTemplate(): void {
    this.api.downloadQuestionsTemplate().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mau-cau-hoi.csv';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.notify.error('Không tải được file mẫu.'),
    });
  }

  onCsvPicked(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;

    const id = this.campaignId();
    if (!id) {
      this.notify.warn('Hãy tạo (lưu) chiến dịch trước khi nhập câu hỏi từ file.');
      return;
    }

    this.importing.set(true);
    this.api.importQuestions(id, file).subscribe({
      next: (result) => {
        this.importing.set(false);
        this.importPreview.set(result);
        if (!result.questions.length) {
          this.notify.warn('Không đọc được câu hỏi hợp lệ nào trong file.');
        }
      },
      error: (e) => {
        this.importing.set(false);
        this.importPreview.set(null);
        // Thông báo của backend nói rõ sai gì và sửa thế nào (sai định dạng, thiếu cột, sai mã hoá)
        // — hữu ích hơn hẳn câu chung chung của bộ chặn lỗi toàn cục.
        this.notify.error(extractErrorMessage(e) ?? 'Không đọc được file.');
      },
    });
  }

  /**
   * `replace` = thay toàn bộ; `append` = thêm vào cuối.
   *
   * ⚠ Câu nhập từ file luôn là câu MỚI (không có `id`). Nên `replace` sẽ xoá câu đang có kể cả câu
   * AI đã sinh — nói rõ trong nhãn nút, đừng để HR hiểu là "trộn".
   */
  applyImport(mode: 'replace' | 'append'): void {
    const preview = this.importPreview();
    if (!preview?.questions.length) return;

    if (mode === 'replace') this.questions.clear();

    for (const q of preview.questions) {
      this.questions.push(
        this.questionRow(
          q.questionText,
          q.isRequired,
          'CustomHr',
          null,
          q.sampleAnswer ?? '',
          q.questionGroup ?? '',
        ),
      );
    }

    this.importPreview.set(null);
    this.notify.info(
      `Đã đưa ${preview.questions.length} câu vào biểu mẫu. Bấm Lưu để ghi lại.`,
    );
  }

  cancelImport(): void {
    this.importPreview.set(null);
  }

  generateQuestions(): void {
    const id = this.campaignId();
    if (!id) {
      this.notify.warn('Hãy tạo (lưu) chiến dịch trước — AI cần JD đã lưu để sinh câu hỏi.');
      return;
    }
    if (this.questionsReadOnly()) {
      this.notify.warn('Chiến dịch đã xuất bản — không sửa được câu hỏi nữa.');
      return;
    }

    const jdCtrl = this.form.get('jdText');
    if (!jdCtrl?.value?.trim()) {
      this.notify.warn('Chiến dịch chưa có JD. Hãy nhập JD và lưu lại trước khi nhờ AI sinh câu hỏi.');
      return;
    }

    const count = this.aiCount();
    if (count != null && (count < 1 || count > 20)) {
      this.notify.warn('Số câu cần sinh phải trong khoảng 1–20.');
      return;
    }

    const aiCount = this.questions.controls.filter(
      (g) => g.get('source')?.value === 'AiGenerated',
    ).length;
    const hrCount = this.questions.length - aiCount;

    const bullets = [
      aiCount > 0
        ? `${aiCount} câu do AI sinh trước đó sẽ bị THAY bằng câu mới.`
        : 'Hiện chưa có câu nào do AI sinh.',
      hrCount > 0
        ? `${hrCount} câu bạn tự gõ được GIỮ NGUYÊN.`
        : 'Bạn chưa tự gõ câu nào.',
      'Danh sách câu hỏi sẽ được tải lại từ máy chủ sau khi sinh.',
    ];

    const dirty = this.form.dirty;
    const data: ConfirmDialogData = {
      title: 'Nhờ AI sinh câu hỏi từ JD?',
      message:
        'AI đọc JD đã lưu của chiến dịch để sinh bộ câu hỏi phỏng vấn. Gọi lại nhiều lần không cộng dồn câu hỏi.',
      bullets,
      warning: dirty
        ? 'Biểu mẫu đang có thay đổi CHƯA LƯU (kể cả JD vừa sửa). AI đọc bản đã lưu trên máy chủ, và các thay đổi chưa lưu sẽ bị bỏ khi danh sách tải lại. Nên bấm Huỷ, lưu lại, rồi sinh.'
        : undefined,
      confirmLabel: 'Sinh câu hỏi',
    };

    this.dialog
      .open(ConfirmDialog, { data, width: '520px' })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.generating.set(true);
        this.api.generateQuestions(id, count).subscribe({
          next: (c) => {
            this.generating.set(false);
            this.hydrate(c);
            const n = c.questions.filter((q) => q.source === 'AiGenerated').length;
            this.notify.success(`AI đã sinh ${n} câu hỏi.`);
          },
          error: (e: HttpErrorResponse) => {
            this.generating.set(false);
            this.notify.error(extractErrorMessage(e) ?? 'Sinh câu hỏi bằng AI thất bại.');
          },
        });
      });
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  /**
   * `levels` theo hợp đồng BA TRẠNG THÁI — đây là chỗ dễ mất dữ liệu nhất của cả tính năng, và
   * kiểu mất là **im lặng** (HTTP 200, không lỗi, mốc biến mất ở lần Lưu sau).
   *
   * Gửi khi và chỉ khi:
   * - bộ mốc khác ảnh chụp lúc nạp (HR thêm/xoá/sửa chữ, hoặc vừa nhận gợi ý AI), HOẶC
   * - **tên tiêu chí đổi** — BE ghép mốc cũ sang bộ tiêu chí mới theo TÊN, nên đổi tên mà không
   *   gửi kèm mốc là carry-over trượt và mốc bay mất mà không ai biết.
   *
   * Không gửi (bỏ hẳn field) khi HR chỉ sửa những thứ khác: BE hiểu "vắng field = không đổi".
   */
  private buildCriteria(): CriterionItem[] {
    return this.criteria.controls.map((g) => {
      const name = g.get('name')!.value as string;
      const originalName = g.get('originalName')!.value as string | null;
      const levels = readLevels(g);
      const changed = canonicalLevels(levels) !== (g.get('levelsOriginal')!.value as string);
      const renamed = originalName != null && originalName !== name;
      return {
        name,
        weight: Number(g.get('weight')!.value),
        maxScore: Number(g.get('maxScore')!.value),
        description: g.get('description')!.value || null,
        ...(changed || renamed ? { levels } : {}),
      };
    });
  }

  /** Tên các tiêu chí đang có mốc không hợp lệ, kèm lý do — để nói thẳng sai ở đâu. */
  criteriaLevelIssues(): { name: string; messages: string[] }[] {
    return this.criteria.controls
      .map((g) => ({
        name: (g.get('name')?.value as string) || '(chưa đặt tên)',
        messages: levelErrorMessages(
          criterionLevelsValidator(g),
          Number(g.get('maxScore')?.value ?? 10),
        ),
      }))
      .filter((x) => x.messages.length > 0);
  }

  /** Có tiêu chí nào mốc hỏng không — khoá nút Lưu, vì thang méo không sinh lỗi lúc chạy. */
  hasLevelIssues(): boolean {
    return this.criteriaLevelIssues().length > 0;
  }
  private buildQuestions(): QuestionItem[] {
    return this.questions.controls.map((g) => {
      const id = g.get('id')?.value as string | null;
      return {
        // F10 — echo id để BE merge TẠI CHỖ. Câu mới thì BỎ HẲN field (không gửi `null`): hợp đồng là
        // "vắng id = thêm mới", nên gửi null làm client nói một điều mình không có ý nói.
        ...(id ? { id } : {}),
        questionText: g.get('questionText')!.value,
        // CỐ Ý không gửi `source`: F10 làm nguồn gốc thành sự thật do SERVER sở hữu và BE bỏ qua giá
        // trị client gửi. Gửi lên chỉ khiến người đọc sau tưởng client khai được nguồn — đúng hiểu lầm
        // đã đẻ ra dòng hardcode `source:'CustomHr'` xoá sạch provenance câu AI.
        // Cờ vẫn nằm trong form (questionRow) để badge hiển thị đúng trong phiên sửa hiện tại.
        isRequired: !!g.get('isRequired')!.value,
        // LUÔN gửi hai field này, kể cả khi rỗng. BE phân biệt ba trạng thái: không gửi = giữ nguyên,
        // '' = xoá, có nội dung = ghi đè. Bỏ field khi ô trống thì HR xoá đáp án xong bấm Lưu, đáp án
        // cũ sống lại — mà không có lỗi nào để họ hiểu vì sao.
        sampleAnswer: (g.get('sampleAnswer')?.value ?? '') as string,
        questionGroup: (g.get('questionGroup')?.value ?? '') as string,
      };
    });
  }

  submit(): void {
    if (this.readOnly()) {
      this.notify.warn('Chiến dịch đã xuất bản — không thể sửa.');
      return;
    }
    // Nói thẳng hậu quả thay vì để rơi vào câu "điền đủ trường bắt buộc" chung chung: đây là ô
    // duy nhất mà một giá trị "hợp lệ về kiểu" (0) lại khoá chiến dịch không ai vào thi được.
    if (this.form.controls.maxConcurrentInterviews.hasError('min')) {
      this.form.markAllAsTouched();
      this.notify.warn(
        'Số người thi cùng lúc phải từ 1 trở lên. Bỏ trống nếu không muốn giới hạn.',
      );
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.warn('Vui lòng điền đủ các trường bắt buộc.');
      return;
    }
    if (this.questions.length === 0) {
      this.notify.warn('Cần ít nhất 1 câu hỏi.');
      return;
    }
    if (this.criteria.length > 0 && !this.weightOk()) {
      this.notify.warn(`Tổng trọng số tiêu chí phải ≈ 1 (hiện tại ${this.totalWeight().toFixed(2)}).`);
      return;
    }
    // Nêu đích danh tiêu chí nào hỏng: mốc điểm nằm trong panel có thể đang đóng, câu "điền đủ
    // trường bắt buộc" chung chung sẽ khiến HR đi tìm ở ô khác.
    const levelIssues = this.criteriaLevelIssues();
    if (levelIssues.length > 0) {
      this.form.markAllAsTouched();
      this.notify.warn(
        `Mốc điểm chưa hợp lệ: ${levelIssues
          .map((x) => `${x.name} (${x.messages[0]})`)
          .join(' · ')}`,
      );
      return;
    }

    // Sửa thước đo của chiến dịch ĐANG CHẠY là hành động khó đảo: nó tăng phiên bản và làm điểm
    // của người thi sau không so trực tiếp được với người đã chấm. Hỏi trước khi gửi.
    if (this.isActive() && this.rubricChanged()) {
      const data: ConfirmDialogData = {
        title: `Lưu thay đổi sẽ tạo thước đo v${this.nextRubricVersion()}?`,
        message:
          'Chiến dịch đang chạy và bạn vừa đổi tiêu chí hoặc mốc điểm. Thay đổi này KHÔNG hồi tố.',
        bullets: [
          `Ứng viên đã chấm bằng thước đo v${this.rubricVersion() ?? 1} giữ nguyên điểm.`,
          'Ứng viên thi SAU khi lưu sẽ được chấm bằng thước đo mới.',
          'Bảng xếp hạng sẽ hiện cột "Thước đo" vì hai nhóm không so sánh trực tiếp được.',
        ],
        confirmLabel: 'Lưu và tạo phiên bản mới',
      };
      this.dialog
        .open(ConfirmDialog, { data, width: '520px' })
        .afterClosed()
        .subscribe((ok) => {
          if (ok) this.performSave();
        });
      return;
    }

    this.performSave();
  }

  /**
   * Bộ tiêu chí + mốc có khác bản đã lưu không.
   *
   * So bằng cùng cách backend so (chuẩn hoá số về 4 chữ số thập phân) để `0.5` và `0.5000` không
   * bị coi là đổi — cảnh báo oan mỗi lần bấm Lưu sẽ nhanh chóng bị bấm qua theo phản xạ, và lúc
   * đó nó hết tác dụng đúng vào lần thay đổi thật.
   */
  private rubricChanged(): boolean {
    const before = (this.original()?.criteria ?? []).map((c) => ({
      name: c.name,
      weight: c.weight,
      maxScore: c.maxScore,
      levels: c.levels ?? [],
    }));
    const after = this.criteria.controls.map((g) => ({
      name: (g.get('name')?.value as string) ?? '',
      weight: Number(g.get('weight')?.value),
      maxScore: Number(g.get('maxScore')?.value),
      levels: readLevels(g),
    }));
    return this.criteriaFingerprint(before) !== this.criteriaFingerprint(after);
  }

  private criteriaFingerprint(
    rows: { name: string; weight: number; maxScore: number; levels: CriterionLevelItem[] }[],
  ): string {
    return JSON.stringify(
      [...rows]
        .map((r) => [
          r.name.trim().toLowerCase(),
          Number(r.weight).toFixed(4),
          Number(r.maxScore).toFixed(4),
          canonicalLevels(r.levels),
        ])
        .sort(),
    );
  }

  /** Gửi thật — tách khỏi `submit()` để nhánh hỏi-xác-nhận không phải nhân bản cả thân hàm. */
  private performSave(): void {
    const v = this.form.getRawValue();
    const criteria = this.buildCriteria();
    this.saving.set(true);

    const id = this.campaignId();
    if (!id) {
      const body: CreateCampaignRequest = {
        title: v.title!,
        domain: v.domain || null,
        seniority: this.seniorityValue(),
        language: this.languageValue(),
        jdText: v.jdText || null,
        criteriaText: v.criteriaText || null,
        maxCandidates: v.maxCandidates ?? null,
        timeLimitMinutes: v.timeLimitMinutes ?? null,
        passScorePct: v.passScorePct ?? null,
        maxConcurrentInterviews: v.maxConcurrentInterviews ?? null,
        questionsPerSession: v.questionsPerSession ?? null,
        antiCheatEnabled: !!v.antiCheatEnabled,
        faceVerifyEnabled: !!v.faceVerifyEnabled,
        adaptiveEnabled: !!v.adaptiveEnabled,   // INT-17
        maxFollowUps: v.maxFollowUps ?? null,
        maxQuestions: v.maxQuestions ?? null,
        startsAt: toIso(v.startsAt),
        expiresAt: toIso(v.expiresAt),
        criteria: criteria.length ? criteria : undefined,
        questions: this.buildQuestions(),
      };
      this.api.createCampaign(body).subscribe({
        next: (c) => {
          this.saving.set(false);
          this.notify.success('Đã tạo chiến dịch.');
          this.router.navigate(['/employer/campaigns', c.id]);
        },
        error: (e: HttpErrorResponse) => {
          this.saving.set(false);
          this.notify.error(extractErrorMessage(e) ?? 'Tạo chiến dịch thất bại.');
        },
      });
      return;
    }

    // Sửa: cập nhật metadata trước, câu hỏi sau.
    const body: UpdateCampaignRequest = {
      title: v.title!,
      domain: v.domain || null,
      seniority: this.seniorityValue(),
      language: this.languageValue(),
      jdText: v.jdText || null,
      criteriaText: v.criteriaText || null,
      maxCandidates: v.maxCandidates ?? null,
      timeLimitMinutes: v.timeLimitMinutes ?? null,
      passScorePct: v.passScorePct ?? null,
      maxConcurrentInterviews: v.maxConcurrentInterviews ?? null,
      questionsPerSession: v.questionsPerSession ?? null,
      antiCheatEnabled: !!v.antiCheatEnabled,
      faceVerifyEnabled: !!v.faceVerifyEnabled,
      adaptiveEnabled: !!v.adaptiveEnabled,   // INT-17
      maxFollowUps: v.maxFollowUps ?? null,
      maxQuestions: v.maxQuestions ?? null,
      startsAt: toIso(v.startsAt),
      expiresAt: toIso(v.expiresAt),
      criteria: criteria.length ? criteria : undefined,
    };
    this.api.updateCampaign(id, body).subscribe({
      next: () => {
        // 🔴 Chiến dịch đã xuất bản: CAMP-2 vẫn giữ nguyên cho câu hỏi, `PUT /questions` trả 409.
        // Gọi nó ở đây là tự tạo ra kiểu hỏng tệ nhất của đường Lưu: request thứ nhất ĐÃ THÀNH
        // CÔNG (tiêu chí + mốc đã ghi, phiên bản thước đo có thể đã tăng) mà người dùng lại thấy
        // thông báo lỗi ⇒ họ bấm Lưu lại, hoặc tưởng mất hết và sửa lại từ đầu.
        // Xử tường minh bằng một nhánh, KHÔNG gộp hai request rồi bắt lỗi chung.
        if (this.questionsReadOnly()) {
          this.saving.set(false);
          this.notify.success('Đã lưu thay đổi.');
          this.router.navigate(['/employer/campaigns', id]);
          return;
        }
        this.api.updateQuestions(id, this.buildQuestions()).subscribe({
          next: () => {
            this.saving.set(false);
            this.notify.success('Đã lưu thay đổi.');
            this.router.navigate(['/employer/campaigns', id]);
          },
          error: (e: HttpErrorResponse) => {
            this.saving.set(false);
            this.notify.error(extractErrorMessage(e) ?? 'Lưu câu hỏi thất bại.');
          },
        });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Lưu thay đổi thất bại.');
      },
    });
  }

  cancel(): void {
    const id = this.campaignId();
    if (id) this.router.navigate(['/employer/campaigns', id]);
    else this.router.navigate(['/employer/campaigns']);
  }
}
