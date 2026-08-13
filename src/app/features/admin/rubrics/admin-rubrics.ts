import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminRubricApi } from '../../../core/api/admin-rubric.api';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { NotifyService } from '../../../core/notify.service';
import {
  CriterionLevelItem,
  JOB_CATEGORIES,
  JobCategory,
  RUBRIC_LANGUAGES,
  RubricLanguage,
  SystemRubricCriterion,
  SystemRubricMatrixCell,
  SystemRubricResponse,
  UpdateSystemRubricCriterion,
} from '../../../core/models';
import {
  CriterionLevelsEditor,
  canonicalLevels,
  criterionLevelsValidator,
  levelErrorMessages,
  readLevels,
} from '../../../shared/rubric/criterion-levels-editor';
import { ConfirmDialog, ConfirmDialogData } from '../../../shared/ui/confirm-dialog';
import { Spinner } from '../../../shared/ui/spinner';
import { JobCategoryPipe } from '../../../shared/pipes';
import { AdminRubricPreview } from './admin-rubric-preview';

/**
 * Ký tự CHỈ có trong tiếng Việt (nguyên âm có dấu phụ riêng của quốc ngữ + `đ`) cùng các dấu
 * thanh tổ hợp. Dùng để phát hiện mô tả tiếng Việt còn nằm trong bộ tiếng Anh.
 */
const VIETNAMESE_CHARS =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵÁÀẢÃẠẮẰẲẴẶẤẦẨẪẬÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ̣̀́̃̉]/;

/**
 * Mô tả này gần như chắc chắn CHƯA được dịch.
 *
 * Chỉ soi được **một chiều** (VI lọt vào bộ EN): tiếng Việt có ký tự riêng nên nhận ra bằng cấu
 * trúc. Chiều ngược lại (EN lọt vào bộ VI) không có dấu hiệu nào chắc chắn — một câu tiếng Anh
 * và một câu tiếng Việt gõ thiếu dấu trông giống hệt nhau ⇒ CỐ Ý không đoán, vì gắn cờ sai ở đây
 * làm admin học cách phớt lờ cái cờ.
 */
export function looksUntranslated(descriptor: string, language: RubricLanguage): boolean {
  if (language !== 'en') return false;
  return VIETNAMESE_CHARS.test(descriptor ?? '');
}

/**
 * BỘ CHUẨN HỆ THỐNG — thước đo áp cho **mọi người luyện tập** (7 tiêu chí × 3 nghề × 2 ngôn ngữ).
 *
 * Một màn = đúng một ô `(nghề, ngôn ngữ)` vì đó cũng là đơn vị đánh phiên bản. Cho sửa xuyên nghề
 * thì một nút Lưu bump 6 phiên bản cùng lúc và nhãn phiên bản hết nghĩa.
 *
 * Rủi ro lớn nhất của màn này KHÔNG phải rối mà là **bỏ sót**: khai xong (BE, vi) rồi quên 5 ô còn
 * lại, và không có gì trên màn nói điều đó ⇒ ma trận 3×2 nằm ngay đầu trang.
 */
@Component({
  selector: 'app-admin-rubrics',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    CriterionLevelsEditor,
    JobCategoryPipe,
    Spinner,
    AdminRubricPreview,
  ],
  template: `
    <h1>Bộ chuẩn chấm điểm</h1>
    <p class="sub">
      Thước đo dùng cho <strong>mọi buổi luyện tập</strong>, và cũng là bộ mặc định mà nhà tuyển
      dụng chép về chiến dịch. Chỉ sửa được <strong>mô tả</strong> và <strong>mốc điểm</strong> —
      tên tiêu chí, trọng số, thang điểm và phạm vi chấm cố định để không cắt đôi chuỗi điểm lịch
      sử của người dùng.
    </p>

    <!--
      MA TRẬN 3×2 — thứ duy nhất trên màn trả lời "còn ô nào chưa khai mốc". Đếm tiêu chí ĐÃ CÓ
      MỐC chứ không đếm tổng tiêu chí: ô nào cũng có đủ 7 tiêu chí, cái thiếu là mốc.
    -->
    <mat-card class="matrix" data-testid="rubric-matrix">
      <h2>Tình trạng khai mốc</h2>
      <table>
        <thead>
          <tr>
            <th>Nghề</th>
            @for (l of languages; track l.value) {
              <th>{{ l.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (job of jobCategories; track job) {
            <tr>
              <th class="rh">{{ job | jobCategory }}</th>
              @for (l of languages; track l.value) {
                <td>
                  <button
                    mat-button
                    type="button"
                    class="cell"
                    [class.done]="isCellComplete(job, l.value)"
                    [class.on]="job === category() && l.value === language()"
                    (click)="goTo(job, l.value)"
                    [attr.data-testid]="'cell-' + job + '-' + l.value"
                  >
                    <span class="cnt">{{ cellText(job, l.value) }}</span>
                    <span class="ver">{{ cellVersionText(job, l.value) }}</span>
                  </button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
      @if (incompleteCount() > 0) {
        <p class="matrix-warn" data-testid="matrix-warn">
          Còn <strong>{{ incompleteCount() }}</strong> ô chưa khai đủ mốc. Ô chưa khai vẫn chấm
          được nhưng bộ chấm rơi về dải mặc định — không có mô tả nào để bám vào, nên không phân
          biệt được 3 với 6.
        </p>
      }
    </mat-card>

    <div class="pickers">
      <mat-button-toggle-group
        [value]="category()"
        (valueChange)="changeCategory($event)"
        aria-label="Nhóm nghề"
        data-testid="job-picker"
      >
        @for (c of jobCategories; track c) {
          <mat-button-toggle [value]="c">{{ c | jobCategory }}</mat-button-toggle>
        }
      </mat-button-toggle-group>

      <mat-button-toggle-group
        [value]="language()"
        (valueChange)="changeLanguage($event)"
        aria-label="Ngôn ngữ"
        data-testid="lang-picker"
      >
        @for (l of languages; track l.value) {
          <mat-button-toggle [value]="l.value">{{ l.label }}</mat-button-toggle>
        }
      </mat-button-toggle-group>

      <span class="spacer"></span>

      @if (rubric(); as r) {
        <span class="vchip" data-testid="version-chip">Phiên bản {{ r.version }}</span>
      }
    </div>

    @if (loading()) {
      <app-spinner />
    } @else if (rubric(); as r) {
      <mat-card class="editor">
        <div class="ed-head">
          <div>
            <h2>{{ category() | jobCategory }} · {{ languageLabel() }}</h2>
            <p class="hint">{{ withLevelsCount() }}/{{ r.criteria.length }} tiêu chí đã có mốc</p>
          </div>
          <div class="ed-actions">
            <button
              mat-stroked-button
              type="button"
              (click)="copyLevelsFromOtherLanguage()"
              [disabled]="copying() || saving()"
              [matTooltip]="copyTooltip()"
              data-testid="copy-levels"
            >
              <mat-icon>content_copy</mat-icon>
              Chép mốc {{ otherLanguageLabel() }} → {{ languageLabel() }}
            </button>
            <button
              mat-button
              type="button"
              (click)="resetToBaseline()"
              [disabled]="saving()"
              data-testid="reset-rubric"
            >
              Về bộ gốc
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              (click)="save()"
              [disabled]="saving() || form.invalid"
              data-testid="save-rubric"
            >
              <mat-icon>save</mat-icon>
              Lưu bộ chuẩn
            </button>
          </div>
        </div>

        @if (untranslatedCount() > 0) {
          <p class="warn-band" data-testid="untranslated-warn">
            <mat-icon>translate</mat-icon>
            <span>
              {{ untranslatedCount() }} mô tả đang là <strong>bản chép chưa dịch</strong>. Chúng vẫn
              đi vào prompt chấm nguyên văn — người luyện bài tiếng Anh sẽ bị chấm bằng mô tả tiếng
              Việt.
            </span>
          </p>
        }

        <form [formGroup]="form">
          <div formArrayName="criteria">
            @for (g of criteria.controls; track $index; let i = $index) {
              <mat-expansion-panel class="crit" [formGroupName]="i">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    <span class="c-name">{{ nameOf(i) }}</span>
                  </mat-panel-title>
                  <mat-panel-description>
                    <span class="c-w">{{ weightPct(i) }}% · thang {{ maxScoreOf(i) }}</span>
                    <span
                      class="tag"
                      [class.tag-always]="scopeOf(i) === 'Always'"
                      [attr.data-testid]="'scope-' + i"
                      [matTooltip]="scopeTooltip(i)"
                      >{{ scopeLabel(i) }}</span
                    >
                    <span
                      class="tag"
                      [class.tag-warn]="levelCount(i) === 0"
                      [attr.data-testid]="'haslevels-' + i"
                      >{{ levelCount(i) === 0 ? 'Chưa có mốc' : levelCount(i) + ' mốc' }}</span
                    >
                    @if (rowUntranslated(i)) {
                      <span class="tag tag-tr" [attr.data-testid]="'untranslated-' + i"
                        >Cần dịch</span
                      >
                    }
                  </mat-panel-description>
                </mat-expansion-panel-header>

                <mat-form-field appearance="outline" class="full">
                  <mat-label>Mô tả tiêu chí</mat-label>
                  <textarea matInput formControlName="description" rows="2"></textarea>
                </mat-form-field>

                <!--
                  Cùng editor với biểu mẫu chiến dịch: luật mốc (2–10 mốc, phải có mốc 0 và mốc
                  điểm tối đa, mô tả 20–500 ký tự) chỉ có MỘT bản, không lệch được giữa hai màn.
                  Ẩn nút AI vì bộ chuẩn không có đường gọi AI gợi ý mốc.
                -->
                <app-criterion-levels-editor [group]="g" [showAi]="false" />
              </mat-expansion-panel>
            }
          </div>
        </form>
      </mat-card>

      <!--
        Chấm thử nằm NGAY DƯỚI phần soạn, không phải một màn riêng: câu hỏi "mốc mình vừa viết có
        tách được ba mức không" chỉ có nghĩa khi nhìn cùng lúc với chính bộ mốc đó.
      -->
      <app-admin-rubric-preview
        [jobCategory]="category()"
        [language]="language()"
        [rubricVersion]="r.version"
        [sampleQuestions]="r.sampleQuestions ?? []"
        [dirty]="form.dirty"
      />
    }
  `,
  styles: [
    `
      h1 {
        margin-bottom: 4px;
      }
      .sub,
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
      }
      .sub {
        margin: 0 0 16px;
        max-width: 80ch;
      }
      .matrix {
        padding: 16px;
        margin-bottom: 16px;
      }
      .matrix h2 {
        margin: 0 0 8px;
        font-size: 16px;
      }
      .matrix table {
        border-collapse: collapse;
      }
      .matrix th,
      .matrix td {
        padding: 2px 6px;
        text-align: left;
        font-size: 13px;
      }
      .rh {
        font-weight: 500;
        white-space: nowrap;
      }
      .cell {
        display: flex;
        flex-direction: column;
        line-height: 1.3;
        min-width: 120px;
        border-radius: 8px;
        background: var(--mat-sys-surface-variant);
      }
      .cell.done {
        background: var(--mat-sys-primary-container);
        color: var(--mat-sys-on-primary-container);
      }
      .cell.on {
        outline: 2px solid var(--mat-sys-primary);
      }
      .cnt {
        font-size: 13px;
      }
      .ver {
        font-size: 11px;
        opacity: 0.75;
      }
      .matrix-warn,
      .warn-band {
        margin: 10px 0 0;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .warn-band {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      .pickers {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .spacer {
        flex: 1;
      }
      .vchip {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .editor {
        padding: 16px;
      }
      .ed-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ed-head h2 {
        margin: 0;
        font-size: 17px;
      }
      .ed-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .crit {
        margin-bottom: 6px;
      }
      .c-name {
        font-weight: 500;
      }
      .c-w {
        color: var(--mat-sys-on-surface-variant);
        margin-right: 10px;
        white-space: nowrap;
      }
      mat-panel-description {
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .tag {
        padding: 1px 8px;
        border-radius: 8px;
        font-size: 11px;
        white-space: nowrap;
        background: var(--mat-sys-surface-variant);
        color: var(--mat-sys-on-surface-variant);
      }
      .tag-always {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .tag-warn {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
      .tag-tr {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }
      .full {
        width: 100%;
      }
    `,
  ],
})
export class AdminRubrics {
  private fb = inject(FormBuilder);
  private api = inject(AdminRubricApi);
  private notify = inject(NotifyService);
  private dialog = inject(MatDialog);

  readonly jobCategories = JOB_CATEGORIES;
  readonly languages = RUBRIC_LANGUAGES;

  readonly category = signal<JobCategory>('BA');
  readonly language = signal<RubricLanguage>('vi');
  readonly rubric = signal<SystemRubricResponse | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly copying = signal(false);

  /** Ma trận cho CẢ HAI ngôn ngữ — khoá `"<nghề>|<ngôn ngữ>"`. */
  readonly cells = signal<Record<string, SystemRubricMatrixCell>>({});

  /**
   * Tiêu chí vừa được chép mốc sang mà chưa dịch, giữ theo id.
   *
   * Đây chỉ là dấu vết trong PHIÊN sửa. Dấu hiệu sống lâu hơn nằm ở `looksUntranslated()` (đọc
   * chính nội dung mô tả), nên đóng tab rồi mở lại vẫn còn cảnh báo — không phụ thuộc cái tập này.
   */
  readonly copiedIds = signal<ReadonlySet<string>>(new Set());

  readonly form = this.fb.group({ criteria: this.fb.array<FormGroup>([]) });

  constructor() {
    this.loadMatrix();
    this.load();
  }

  get criteria(): FormArray<FormGroup> {
    return this.form.get('criteria') as FormArray<FormGroup>;
  }

  // ── Nạp ─────────────────────────────────────────────────────────────────────
  private loadMatrix(): void {
    for (const l of this.languages) {
      this.api.matrix(l.value).subscribe({
        next: (rows) => {
          const next = { ...this.cells() };
          for (const c of rows ?? []) next[`${c.jobCategory}|${c.language}`] = c;
          this.cells.set(next);
        },
        // Mất ma trận chỉ mất phần "còn ô nào chưa khai", không chặn việc sửa → im lặng.
        error: () => {},
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.copiedIds.set(new Set());
    this.api.get(this.category(), this.language()).subscribe({
      next: (r) => {
        this.rubric.set(r);
        this.fill(r.criteria);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.rubric.set(null);
        this.criteria.clear();
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được bộ chuẩn.');
      },
    });
  }

  private fill(criteria: SystemRubricCriterion[]): void {
    this.criteria.clear();
    for (const c of criteria) this.criteria.push(this.row(c));
    this.form.markAsPristine();
  }

  /**
   * Một hàng tiêu chí.
   *
   * `name`/`weight`/`maxScore`/`scoringScope` nằm trong FormGroup để hiển thị và để editor mốc đọc
   * `maxScore`, nhưng **không có ô nhập nào** cho chúng và payload gửi lên **không khai** chúng —
   * xem `UpdateSystemRubricCriterion`.
   */
  private row(c: SystemRubricCriterion): FormGroup {
    const levels = c.levels ?? [];
    return this.fb.group(
      {
        id: [c.id],
        name: [c.name],
        weight: [c.weight],
        maxScore: [c.maxScore],
        scoringScope: [c.scoringScope],
        description: [c.description ?? ''],
        // Giảm dần: admin nghĩ theo "thế nào là điểm tối đa" rồi bóc dần xuống.
        levels: this.fb.array<FormGroup>(
          [...levels]
            .sort((a, b) => b.score - a.score)
            .map((l) => this.fb.group({ score: [l.score], descriptor: [l.descriptor] })),
        ),
        levelsOriginal: [canonicalLevels(levels)],
        levelsSource: [levels.length ? 'hr' : 'none'],
      },
      { validators: criterionLevelsValidator },
    );
  }

  // ── Đọc hàng ────────────────────────────────────────────────────────────────
  private val<T>(i: number, key: string): T {
    return this.criteria.at(i)?.get(key)?.value as T;
  }
  nameOf(i: number): string {
    return this.val<string>(i, 'name') ?? '';
  }
  maxScoreOf(i: number): number {
    return Number(this.val<number>(i, 'maxScore') ?? 0);
  }
  weightPct(i: number): number {
    return Math.round(Number(this.val<number>(i, 'weight') ?? 0) * 100);
  }
  scopeOf(i: number): string {
    return this.val<string>(i, 'scoringScope') ?? 'Always';
  }
  scopeLabel(i: number): string {
    return this.scopeOf(i) === 'Always' ? 'Luôn chấm' : 'Chấm khi được hỏi';
  }
  scopeTooltip(i: number): string {
    return this.scopeOf(i) === 'Always'
      ? 'Tiêu chí về CÁCH NÓI — chấm ở mọi câu trả lời.'
      : 'Tiêu chí về NỘI DUNG — chỉ chấm khi câu hỏi nhắm tới nó. Không câu nào hỏi thì tiêu chí bị loại khỏi điểm, không tính 0.';
  }
  levelsOf(i: number): CriterionLevelItem[] {
    const g = this.criteria.at(i);
    return g ? readLevels(g) : [];
  }
  levelCount(i: number): number {
    return this.levelsOf(i).length;
  }

  rowUntranslated(i: number): boolean {
    const id = this.val<string>(i, 'id');
    if (id && this.copiedIds().has(id)) return true;
    return this.levelsOf(i).some((l) => looksUntranslated(l.descriptor, this.language()));
  }

  untranslatedCount(): number {
    return this.criteria.controls.filter((_, i) => this.rowUntranslated(i)).length;
  }

  withLevelsCount(): number {
    return this.criteria.controls.filter((_, i) => this.levelCount(i) > 0).length;
  }

  // ── Ma trận ─────────────────────────────────────────────────────────────────
  private cell(job: JobCategory, lang: RubricLanguage): SystemRubricMatrixCell | undefined {
    return this.cells()[`${job}|${lang}`];
  }
  cellText(job: JobCategory, lang: RubricLanguage): string {
    const c = this.cell(job, lang);
    return c ? `${c.criteriaWithLevels}/${c.total} tiêu chí` : '—';
  }
  cellVersionText(job: JobCategory, lang: RubricLanguage): string {
    const c = this.cell(job, lang);
    return c ? `phiên bản ${c.version}` : 'chưa tải được';
  }
  /** Đủ mốc = MỌI tiêu chí đều có mốc. `total = 0` không tính là xong (chưa tải được số thật). */
  isCellComplete(job: JobCategory, lang: RubricLanguage): boolean {
    const c = this.cell(job, lang);
    return !!c && c.total > 0 && c.criteriaWithLevels >= c.total;
  }
  readonly incompleteCount = computed(() => {
    const map = this.cells();
    const all = Object.values(map);
    if (all.length === 0) return 0;
    return all.filter((c) => c.total > 0 && c.criteriaWithLevels < c.total).length;
  });

  // ── Điều hướng ──────────────────────────────────────────────────────────────
  /**
   * ⚠ Vế "giá trị có nằm trong danh sách không" KHÔNG phải phòng thủ dư: `mat-button-toggle-group`
   * bắn `valueChange` với **`undefined`** trong lúc dựng (các nút con đăng ký sau khi `[value]` đã
   * bind). Không chặn thì màn vừa mở đã gọi `GET /rubrics/undefined?language=undefined`, `category`
   * bị đặt thành `undefined`, và mọi thao tác sau đó chạy trên một ô không tồn tại — HTTP 404 chứ
   * không phải lỗi biên dịch, nên không có gì cản.
   */
  goTo(job: JobCategory, lang: RubricLanguage): void {
    if (!this.jobCategories.includes(job)) return;
    if (!this.languages.some((l) => l.value === lang)) return;
    if (job === this.category() && lang === this.language()) return;
    this.guardDirty(() => {
      this.category.set(job);
      this.language.set(lang);
      this.load();
    });
  }
  changeCategory(job: JobCategory): void {
    this.goTo(job, this.language());
  }
  changeLanguage(lang: RubricLanguage): void {
    this.goTo(this.category(), lang);
  }

  /** Đổi ô khi đang sửa dở = mất sửa đổi. Hỏi trước, đừng vứt im lặng. */
  private guardDirty(run: () => void): void {
    if (!this.form.dirty) {
      run();
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Bỏ các thay đổi chưa lưu?',
      message: 'Bạn đang sửa bộ chuẩn này mà chưa Lưu. Chuyển sang ô khác sẽ mất phần đã sửa.',
      confirmLabel: 'Bỏ thay đổi',
      danger: true,
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) run();
      });
  }

  languageLabel(): string {
    return this.languages.find((l) => l.value === this.language())?.label ?? this.language();
  }
  otherLanguage(): RubricLanguage {
    return this.language() === 'vi' ? 'en' : 'vi';
  }
  otherLanguageLabel(): string {
    const o = this.otherLanguage();
    return this.languages.find((l) => l.value === o)?.label ?? o;
  }
  copyTooltip(): string {
    return `Chép nguyên văn mốc của bộ ${this.otherLanguageLabel()} sang đây làm bản nháp. KHÔNG dịch tự động — phần chép sẽ được đánh dấu "Cần dịch".`;
  }

  // ── Chép mốc từ ngôn ngữ kia ────────────────────────────────────────────────
  /**
   * Chép **nguyên văn** mô tả mốc từ bộ ngôn ngữ kia làm bản nháp.
   *
   * Không có nút này thì thực tế nửa bộ tiếng Anh **không bao giờ được khai** — soạn lại 7 tiêu chí
   * từ trắng cho ngôn ngữ thứ hai là việc không ai làm. CỐ Ý không gọi AI dịch: bản dịch máy của
   * mô tả mốc mà không ai đọc lại sẽ trở thành thước đo thật cho người dùng thật.
   *
   * ⚠ Ghép hai bộ theo **thứ tự** vì tên tiêu chí hai ngôn ngữ khác nhau nên không khớp theo tên
   * được. Số tiêu chí lệch nhau ⇒ **từ chối chép** thay vì ghép lệch hàng — ghép lệch nghĩa là dán
   * mô tả của tiêu chí này sang tiêu chí khác, mà không có gì báo.
   */
  copyLevelsFromOtherLanguage(): void {
    if (this.copying() || this.saving()) return;
    const src = this.otherLanguage();
    this.copying.set(true);
    this.api.get(this.category(), src).subscribe({
      next: (other) => {
        this.copying.set(false);
        this.applyCopiedLevels(other);
      },
      error: (e: HttpErrorResponse) => {
        this.copying.set(false);
        this.notify.error(
          extractErrorMessage(e) ?? `Không tải được bộ ${this.otherLanguageLabel()} để chép.`,
        );
      },
    });
  }

  private applyCopiedLevels(other: SystemRubricResponse): void {
    const source = other?.criteria ?? [];
    if (source.length !== this.criteria.length) {
      this.notify.error(
        `Bộ ${this.otherLanguageLabel()} có ${source.length} tiêu chí, bộ này có ${this.criteria.length} — không ghép được theo thứ tự nên không chép.`,
      );
      return;
    }

    const marked = new Set(this.copiedIds());
    let copied = 0;
    this.criteria.controls.forEach((g, i) => {
      const from = source[i]?.levels ?? [];
      if (from.length === 0) return;
      const arr = g.get('levels') as FormArray<FormGroup>;
      arr.clear();
      for (const l of [...from].sort((a, b) => b.score - a.score)) {
        arr.push(this.fb.group({ score: [l.score], descriptor: [l.descriptor] }));
      }
      g.get('levelsSource')?.setValue('hr');
      g.updateValueAndValidity();
      const id = g.get('id')?.value as string;
      if (id) marked.add(id);
      copied++;
    });

    if (copied === 0) {
      this.notify.warn(`Bộ ${this.otherLanguageLabel()} cũng chưa khai mốc nào.`);
      return;
    }
    this.copiedIds.set(marked);
    this.form.markAsDirty();
    this.notify.info(
      `Đã chép mốc của ${copied} tiêu chí. Đây là bản nháp CHƯA DỊCH — sửa lại trước khi Lưu.`,
    );
  }

  // ── Lưu ─────────────────────────────────────────────────────────────────────
  /** Lỗi mốc của từng hàng, gộp lại để nói rõ hàng nào sai thay vì chỉ khoá nút Lưu. */
  invalidRows(): string[] {
    return this.criteria.controls
      .map((g, i) => {
        const msgs = levelErrorMessages(criterionLevelsValidator(g), this.maxScoreOf(i));
        return msgs.length ? `${this.nameOf(i)}: ${msgs.join(' ')}` : '';
      })
      .filter(Boolean);
  }

  save(): void {
    const bad = this.invalidRows();
    if (bad.length > 0) {
      this.notify.warn(bad[0]);
      return;
    }

    const data: ConfirmDialogData = {
      title: 'Lưu bộ chuẩn này?',
      message: `Thước đo ${this.category()} · ${this.languageLabel()} sẽ đổi cho toàn hệ thống.`,
      bullets: [
        `Áp cho MỌI người luyện ${this.category()} · ${this.languageLabel()}, kể từ buổi bắt đầu sau thời điểm này.`,
        'Buổi đang dở giữ nguyên thước đo cũ — người đang thi không bị đổi giữa chừng.',
        'Điểm cũ KHÔNG chấm lại. So điểm trước và sau phiên bản này là so hai thước đo khác nhau.',
      ],
      confirmLabel: 'Lưu bộ chuẩn',
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '560px' })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.doSave();
      });
  }

  private doSave(): void {
    this.saving.set(true);
    const criteria: UpdateSystemRubricCriterion[] = this.criteria.controls.map((g, i) => ({
      id: g.get('id')!.value as string,
      description: ((g.get('description')!.value as string) || '').trim() || null,
      levels: this.levelsOf(i),
    }));

    this.api.update(this.category(), this.language(), { criteria }).subscribe({
      next: (res) => {
        this.saving.set(false);
        // `changed:false` là câu trả lời ĐÚNG (nội dung không khác bản đang chạy) chứ không phải
        // lỗi — nói thẳng, đừng báo "đã lưu" rồi để admin tưởng đã sang phiên bản mới.
        if (res?.changed === false) {
          this.notify.info(`Nội dung không khác bản đang chạy — vẫn ở phiên bản ${res.version}.`);
        } else {
          this.notify.success(`Đã lưu — bộ chuẩn nay ở phiên bản ${res?.version ?? '?'}.`);
        }
        this.copiedIds.set(new Set());
        this.form.markAsPristine();
        this.loadMatrix();
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không lưu được bộ chuẩn.');
      },
    });
  }

  resetToBaseline(): void {
    const data: ConfirmDialogData = {
      title: 'Đưa bộ này về bản gốc?',
      message: `Mọi mô tả và mốc điểm mà admin đã soạn cho ${this.category()} · ${this.languageLabel()} sẽ được thay bằng bản gốc của hệ thống.`,
      bullets: [
        'Bản gốc KHÔNG có mốc điểm — bộ chấm sẽ quay về dải mặc định cho tới khi khai lại.',
        'Lịch sử phiên bản vẫn giữ; đây là một phiên bản MỚI có nội dung gốc, không phải xoá.',
      ],
      confirmLabel: 'Về bộ gốc',
      danger: true,
    };
    this.dialog
      .open(ConfirmDialog, { data, width: '520px' })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.api.reset(this.category(), this.language()).subscribe({
          next: () => {
            this.notify.success('Đã đưa về bộ gốc.');
            this.loadMatrix();
            this.load();
          },
          error: (e: HttpErrorResponse) =>
            this.notify.error(extractErrorMessage(e) ?? 'Không đưa về bộ gốc được.'),
        });
      });
  }
}
