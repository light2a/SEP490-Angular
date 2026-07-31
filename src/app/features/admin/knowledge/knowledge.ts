import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { extractErrorMessage } from '../../../core/api/http-utils';
import { KnowledgeApi } from '../../../core/api/knowledge.api';
import { NotifyService } from '../../../core/notify.service';
import {
  AddKnowledgeSourceRequest,
  Context7Candidate,
  Context7IngestRequest,
  JOB_CATEGORIES,
  JOB_CATEGORY_LABEL,
  JobCategory,
  KNOWLEDGE_SOURCE_TYPE_LABEL,
  KnowledgeSource,
  KnowledgeSourceType,
} from '../../../core/models';
import { EmptyState } from '../../../shared/ui/empty-state';
import { Spinner } from '../../../shared/ui/spinner';

/**
 * "Nguồn tri thức" (RAG grounding) — admin quản kho nguồn uy tín để AI *sinh* câu hỏi/lý thuyết có
 * chỗ bấm kiểm chứng. Hai lối nạp: dán tay / URL, và nạp tự động từ Context7.
 */
@Component({
  selector: 'app-admin-knowledge',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    Spinner,
    EmptyState,
  ],
  template: `
    <div class="page">
      <div class="tabs">
        <button
          mat-flat-button
          [color]="tab() === 'sources' ? 'primary' : undefined"
          (click)="tab.set('sources')"
        >
          <mat-icon>menu_book</mat-icon> Nguồn đã nạp
        </button>
        <button
          mat-flat-button
          [color]="tab() === 'context7' ? 'primary' : undefined"
          (click)="tab.set('context7')"
        >
          <mat-icon>cloud_download</mat-icon> Nạp từ Context7
        </button>
      </div>

      @if (tab() === 'sources') {
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Thêm nguồn (dán tay / URL)</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <form class="add-form" [formGroup]="form" (ngSubmit)="add()">
              <mat-form-field appearance="outline" class="f-title">
                <mat-label>Tiêu đề</mat-label>
                <input matInput formControlName="title" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-cat">
                <mat-label>Nghề</mat-label>
                <mat-select formControlName="jobCategory">
                  @for (c of jobCategories; track c) {
                    <mat-option [value]="c">{{ catLabel(c) }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-type">
                <mat-label>Loại</mat-label>
                <mat-select formControlName="sourceType">
                  <mat-option value="Manual">Dán tay</mat-option>
                  <mat-option value="Url">Đường dẫn</mat-option>
                </mat-select>
              </mat-form-field>
              @if (isManual()) {
                <mat-form-field appearance="outline" class="f-full">
                  <mat-label>Nội dung (markdown / plain)</mat-label>
                  <textarea matInput formControlName="content" rows="6"></textarea>
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline" class="f-full">
                  <mat-label>URL nguồn</mat-label>
                  <input matInput formControlName="url" placeholder="https://..." />
                </mat-form-field>
              }
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="adding() || form.invalid"
              >
                <mat-icon>add</mat-icon> Nạp nguồn
              </button>
            </form>
          </mat-card-content>
        </mat-card>

        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Nguồn đã nạp</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (loading()) {
              <app-spinner [diameter]="32" message="Đang tải danh sách nguồn..." />
            } @else if (!sources().length) {
              <app-empty-state icon="menu_book" message="Chưa có nguồn nào." />
            } @else {
              <table mat-table [dataSource]="sources()" class="tbl">
                <ng-container matColumnDef="title">
                  <th mat-header-cell *matHeaderCellDef>Tiêu đề</th>
                  <td mat-cell *matCellDef="let s">{{ s.title }}</td>
                </ng-container>
                <ng-container matColumnDef="jobCategory">
                  <th mat-header-cell *matHeaderCellDef>Nghề</th>
                  <td mat-cell *matCellDef="let s">{{ s.jobCategory ? catLabel(s.jobCategory) : '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="sourceType">
                  <th mat-header-cell *matHeaderCellDef>Loại</th>
                  <td mat-cell *matCellDef="let s">{{ typeLabel(s.sourceType) }}</td>
                </ng-container>
                <ng-container matColumnDef="reputation">
                  <th mat-header-cell *matHeaderCellDef>Uy tín</th>
                  <td mat-cell *matCellDef="let s">{{ s.reputation ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Trạng thái</th>
                  <td mat-cell *matCellDef="let s">
                    <mat-chip>{{ s.status === 'Active' ? 'Đang dùng' : 'Lưu trữ' }}</mat-chip>
                  </td>
                </ng-container>
                <ng-container matColumnDef="chunkCount">
                  <th mat-header-cell *matHeaderCellDef>Số chunk</th>
                  <td mat-cell *matCellDef="let s">{{ s.chunkCount }}</td>
                </ng-container>
                <ng-container matColumnDef="createdAt">
                  <th mat-header-cell *matHeaderCellDef>Ngày tạo</th>
                  <td mat-cell *matCellDef="let s">{{ s.createdAt | date: 'short' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let s">
                    <button
                      mat-icon-button
                      [disabled]="busyId() === s.id"
                      (click)="reindex(s)"
                      title="Nạp lại (re-index)"
                    >
                      <mat-icon>refresh</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      color="warn"
                      [disabled]="busyId() === s.id"
                      (click)="remove(s)"
                      title="Xoá"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols"></tr>
              </table>
              @if (nextCursor()) {
                <button mat-stroked-button class="more" [disabled]="loadingMore()" (click)="loadMore()">
                  <mat-icon>expand_more</mat-icon> Tải thêm
                </button>
              }
            }
          </mat-card-content>
        </mat-card>
      } @else {
        <mat-card class="card">
          <mat-card-header>
            <mat-card-title>Tìm thư viện trên Context7</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="c7-search">
              <mat-form-field appearance="outline" class="f-lib">
                <mat-label>Tên thư viện</mat-label>
                <input
                  matInput
                  [value]="libraryName()"
                  (input)="libraryName.set($any($event.target).value)"
                  placeholder="react"
                />
              </mat-form-field>
              <mat-form-field appearance="outline" class="f-query">
                <mat-label>Chủ đề tìm (tuỳ chọn)</mat-label>
                <input
                  matInput
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                  placeholder="useEffect"
                />
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                [disabled]="searching() || !libraryName().trim()"
                (click)="search()"
              >
                <mat-icon>search</mat-icon> Tìm
              </button>
            </div>

            @if (searching()) {
              <app-spinner [diameter]="32" message="Đang tìm trên Context7..." />
            } @else if (searched() && !candidates().length) {
              <app-empty-state icon="search_off" message="Không tìm thấy thư viện phù hợp." />
            } @else if (candidates().length) {
              <table mat-table [dataSource]="candidates()" class="tbl">
                <ng-container matColumnDef="title">
                  <th mat-header-cell *matHeaderCellDef>Thư viện</th>
                  <td mat-cell *matCellDef="let c">
                    <div class="c7-title">{{ c.title }}</div>
                    <div class="c7-id">{{ c.id }}</div>
                  </td>
                </ng-container>
                <ng-container matColumnDef="reputation">
                  <th mat-header-cell *matHeaderCellDef>Uy tín</th>
                  <td mat-cell *matCellDef="let c">{{ c.reputation ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="snippets">
                  <th mat-header-cell *matHeaderCellDef>Snippet</th>
                  <td mat-cell *matCellDef="let c">{{ c.snippets ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="pick">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let c">
                    <button
                      mat-stroked-button
                      [color]="selectedLibraryId() === c.id ? 'primary' : undefined"
                      (click)="selectedLibraryId.set(c.id)"
                    >
                      {{ selectedLibraryId() === c.id ? 'Đã chọn' : 'Chọn' }}
                    </button>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="c7Cols"></tr>
                <tr mat-row *matRowDef="let row; columns: c7Cols"></tr>
              </table>
            }
          </mat-card-content>
        </mat-card>

        @if (selectedLibraryId(); as lib) {
          <mat-card class="card">
            <mat-card-header>
              <mat-card-title>Nạp thư viện: {{ lib }}</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="ingest-form">
                <mat-form-field appearance="outline" class="f-full">
                  <mat-label>Chủ đề (mỗi dòng / phân cách bằng dấu phẩy)</mat-label>
                  <textarea
                    matInput
                    rows="3"
                    [value]="topicsText()"
                    (input)="topicsText.set($any($event.target).value)"
                    placeholder="useEffect&#10;useState&#10;rendering"
                  ></textarea>
                </mat-form-field>
                <mat-form-field appearance="outline" class="f-cat">
                  <mat-label>Nghề</mat-label>
                  <mat-select [value]="ingestJobCategory()" (selectionChange)="ingestJobCategory.set($event.value)">
                    @for (c of jobCategories; track c) {
                      <mat-option [value]="c">{{ catLabel(c) }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  [disabled]="ingesting() || !parsedTopics().length"
                  (click)="ingest()"
                >
                  <mat-icon>download</mat-icon> Nạp vào kho
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [
    `
      .page {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .tabs {
        display: flex;
        gap: 8px;
      }
      .card {
        width: 100%;
      }
      .add-form,
      .c7-search,
      .ingest-form {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: wrap;
      }
      .f-title {
        width: 260px;
      }
      .f-cat {
        width: 200px;
      }
      .f-type {
        width: 160px;
      }
      .f-lib {
        width: 220px;
      }
      .f-query {
        width: 260px;
      }
      .f-full {
        flex: 1 1 100%;
        width: 100%;
      }
      .tbl {
        width: 100%;
      }
      .more {
        margin-top: 12px;
      }
      .c7-title {
        font-weight: 500;
      }
      .c7-id {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class AdminKnowledge {
  private fb = inject(FormBuilder);
  private api = inject(KnowledgeApi);
  private notify = inject(NotifyService);

  readonly jobCategories = JOB_CATEGORIES;
  readonly cols = [
    'title',
    'jobCategory',
    'sourceType',
    'reputation',
    'status',
    'chunkCount',
    'createdAt',
    'actions',
  ];
  readonly c7Cols = ['title', 'reputation', 'snippets', 'pick'];

  readonly tab = signal<'sources' | 'context7'>('sources');

  // ── Danh sách + thêm nguồn ──────────────────────────────────────────────────
  readonly sources = signal<KnowledgeSource[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly adding = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly nextCursor = signal<string | null>(null);

  readonly form = this.fb.group({
    title: ['', [Validators.required]],
    jobCategory: ['FE' as JobCategory, [Validators.required]],
    sourceType: ['Manual' as 'Manual' | 'Url', [Validators.required]],
    content: [''],
    url: [''],
  });

  // ── Context7 ────────────────────────────────────────────────────────────────
  readonly libraryName = signal('');
  readonly query = signal('');
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly candidates = signal<Context7Candidate[]>([]);
  readonly selectedLibraryId = signal<string | null>(null);
  readonly topicsText = signal('');
  readonly ingestJobCategory = signal<JobCategory>('FE');
  readonly ingesting = signal(false);

  readonly parsedTopics = computed(() =>
    this.topicsText()
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );

  constructor() {
    this.load();
  }

  isManual(): boolean {
    return this.form.controls.sourceType.value === 'Manual';
  }

  catLabel(c: JobCategory): string {
    return JOB_CATEGORY_LABEL[c] ?? String(c);
  }
  typeLabel(t: KnowledgeSourceType): string {
    return KNOWLEDGE_SOURCE_TYPE_LABEL[t] ?? String(t);
  }

  load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (page) => {
        this.sources.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải được danh sách nguồn.');
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor) return;
    this.loadingMore.set(true);
    this.api.list({ cursor }).subscribe({
      next: (page) => {
        this.sources.update((cur) => [...cur, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.loadingMore.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Không tải thêm được.');
      },
    });
  }

  add(): void {
    const v = this.form.getRawValue();
    const title = (v.title ?? '').trim();
    if (!title) {
      this.notify.warn('Nhập tiêu đề nguồn.');
      return;
    }
    const manual = v.sourceType === 'Manual';
    const content = (v.content ?? '').trim();
    const url = (v.url ?? '').trim();
    if (manual && !content) {
      this.notify.warn('Dán nội dung nguồn.');
      return;
    }
    if (!manual && !url) {
      this.notify.warn('Nhập URL nguồn.');
      return;
    }
    const body: AddKnowledgeSourceRequest = {
      title,
      jobCategory: (v.jobCategory ?? 'FE') as JobCategory,
      sourceType: manual ? 'Manual' : 'Url',
      content: manual ? content : null,
      url: manual ? null : url,
    };
    this.adding.set(true);
    this.api.add(body).subscribe({
      next: () => {
        this.adding.set(false);
        this.notify.success('Đã nạp nguồn.');
        this.form.reset({ title: '', jobCategory: 'FE', sourceType: 'Manual', content: '', url: '' });
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.adding.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Nạp nguồn thất bại.');
      },
    });
  }

  reindex(s: KnowledgeSource): void {
    this.busyId.set(s.id);
    this.api.reindex(s.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success('Đã nạp lại nguồn.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Nạp lại thất bại.');
      },
    });
  }

  remove(s: KnowledgeSource): void {
    if (!confirm(`Xoá nguồn "${s.title}"? Các vector liên quan cũng bị xoá.`)) return;
    this.busyId.set(s.id);
    this.api.remove(s.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notify.success('Đã xoá nguồn.');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.busyId.set(null);
        this.notify.error(extractErrorMessage(e) ?? 'Xoá nguồn thất bại.');
      },
    });
  }

  search(): void {
    const name = this.libraryName().trim();
    if (!name) {
      this.notify.warn('Nhập tên thư viện.');
      return;
    }
    this.searching.set(true);
    this.searched.set(false);
    this.api.context7Search(name, this.query().trim()).subscribe({
      next: (list) => {
        this.candidates.set(list);
        this.searching.set(false);
        this.searched.set(true);
      },
      error: (e: HttpErrorResponse) => {
        this.searching.set(false);
        this.searched.set(true);
        this.candidates.set([]);
        this.notify.error(extractErrorMessage(e) ?? 'Tìm trên Context7 thất bại.');
      },
    });
  }

  ingest(): void {
    const libraryId = this.selectedLibraryId();
    const topics = this.parsedTopics();
    if (!libraryId) {
      this.notify.warn('Chọn một thư viện trước.');
      return;
    }
    if (!topics.length) {
      this.notify.warn('Nhập ít nhất một chủ đề.');
      return;
    }
    const body: Context7IngestRequest = {
      libraryId,
      topics,
      jobCategory: this.ingestJobCategory(),
    };
    this.ingesting.set(true);
    this.api.context7Ingest(body).subscribe({
      next: () => {
        this.ingesting.set(false);
        this.notify.success('Đã nạp thư viện vào kho.');
        this.topicsText.set('');
        this.selectedLibraryId.set(null);
        this.tab.set('sources');
        this.load();
      },
      error: (e: HttpErrorResponse) => {
        this.ingesting.set(false);
        this.notify.error(extractErrorMessage(e) ?? 'Nạp thư viện thất bại.');
      },
    });
  }
}
