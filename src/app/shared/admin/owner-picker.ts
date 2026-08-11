import { Component, OnInit, computed, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AdminApi } from '../../core/api/admin.api';
import { AdminUserResponse, OrganizationResponse, OwnerType } from '../../core/models';

/** Một dòng gợi ý — gộp user và org về cùng hình dạng để template khỏi phải rẽ nhánh. */
interface OwnerOption {
  id: string;
  /** Dòng chính: email (user) hoặc tên tổ chức (org). */
  primary: string;
  /** Dòng phụ: tên người dùng, hoặc mã số thuế — để phân biệt hai dòng trùng dòng chính. */
  secondary: string | null;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chọn chủ ví (người dùng / tổ chức) cho các màn admin thao tác TIỀN: cấp credit, cấp gói thuê bao,
 * xem ví.
 *
 * Trước đây ba màn đó đều là một ô text đòi dán GUID. Đó không chỉ bất tiện: cấp credit hay cấp gói
 * nhầm người thì **không có endpoint nào thu hồi**, mà một GUID dán lệch trông y hệt một GUID đúng —
 * không có bước nào để người cấp nhận ra mình đang nhìn sai người.
 *
 * ⚠ Tìm người dùng khớp theo **email** (hợp đồng hiện tại của `GET /auth/admin/users?search=`), tổ
 * chức khớp theo **tên**. Gõ tên người sẽ KHÔNG ra kết quả — đã nói thẳng trong nhãn ô nhập thay vì
 * để admin tự đoán vì sao không tìm thấy.
 *
 * Vẫn nhận GUID dán thẳng: admin thường cầm sẵn id từ ticket/log, chặn đường đó chỉ tổ bắt họ đi tìm
 * ngược lại email.
 */
@Component({
  selector: 'app-owner-picker',
  imports: [FormsModule, MatAutocompleteModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <mat-form-field appearance="outline" class="owner-picker">
      <mat-label>{{ isOrg() ? 'Tổ chức' : 'Người dùng' }} *</mat-label>
      <input
        matInput
        [matAutocomplete]="auto"
        [ngModel]="query()"
        (ngModelChange)="onQuery($event)"
        [placeholder]="isOrg() ? 'Tên tổ chức hoặc GUID' : 'Email hoặc GUID'"
      />
      @if (loading()) {
        <mat-icon matSuffix>hourglass_empty</mat-icon>
      } @else if (ownerId()) {
        <mat-icon matSuffix class="ok">check_circle</mat-icon>
      }
      <!--
        Trạng thái phải nói ra bằng chữ. Không có nó thì "chưa gõ gì", "đang tìm" và "tìm không ra"
        đều hiện ra y hệt nhau: một ô trống không phản ứng — người dùng không biết nên chờ, gõ thêm,
        hay đi tìm chỗ khác.
      -->
      <mat-hint>
        @if (selected(); as s) {
          Đã chọn: {{ s.primary }}{{ s.secondary ? ' — ' + s.secondary : '' }}
        } @else if (ownerId()) {
          Dùng GUID đã nhập.
        } @else if (loading()) {
          Đang tìm…
        } @else if (noMatch()) {
          Không tìm thấy {{ isOrg() ? 'tổ chức' : 'người dùng' }} nào khớp “{{ query().trim() }}”.
        } @else {
          {{ isOrg() ? 'Tìm theo tên tổ chức.' : 'Tìm theo email (chưa tìm được theo tên).' }}
        }
      </mat-hint>
      <mat-autocomplete #auto="matAutocomplete" (optionSelected)="pick($event.option.value)">
        @for (o of options(); track o.id) {
          <mat-option [value]="o">
            <span class="opt-primary">{{ o.primary }}</span>
            @if (o.secondary) {
              <span class="opt-secondary">{{ o.secondary }}</span>
            }
          </mat-option>
        }
        @if (noMatch()) {
          <!-- Option disabled để panel THẬT SỰ mở ra: panel không mở nhìn giống hệt "app đơ". -->
          <mat-option disabled>Không có kết quả</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [
    `
      .owner-picker {
        width: 100%;
      }
      .ok {
        color: var(--mat-sys-primary);
      }
      .opt-primary {
        margin-right: 8px;
      }
      .opt-secondary {
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
      }
    `,
  ],
})
export class OwnerPicker implements OnInit {
  private admin = inject(AdminApi);

  readonly ownerType = input.required<OwnerType>();
  /** GUID chủ ví đã chọn — rỗng khi chưa chọn được ai. Two-way qua `[(ownerId)]`. */
  readonly ownerId = model<string>('');

  readonly query = signal('');
  readonly options = signal<OwnerOption[]>([]);
  readonly selected = signal<OwnerOption | null>(null);
  readonly loading = signal(false);
  /** Đã có ít nhất một lượt tra cứu TRẢ VỀ cho từ khoá hiện tại — để phân biệt "chưa tìm" với "tìm rồi mà không ra". */
  readonly searched = signal(false);

  /** Tìm xong và không ra gì. Chỉ đúng sau khi có kết quả về, không đúng lúc đang gõ dở. */
  readonly noMatch = computed(
    () => this.searched() && !this.loading() && this.options().length === 0 && !this.ownerId(),
  );

  readonly isOrg = computed(() => this.ownerType() === OwnerType.Org);

  private readonly term$ = new Subject<string>();

  constructor() {
    // Đổi loại ví ⇒ id cũ thuộc bảng khác, giữ lại là mời cấp nhầm sang một tổ chức trùng id.
    let first = true;
    effect(() => {
      this.ownerType();
      if (first) {
        first = false;
        return;
      }
      this.reset();
    });
  }

  ngOnInit(): void {
    this.term$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          this.loading.set(true);
          return this.isOrg()
            ? this.admin.organizations(term)
            : this.admin.users({ search: term });
        }),
      )
      .subscribe({
        next: (rows) => {
          this.loading.set(false);
          this.searched.set(true);
          this.options.set(this.isOrg()
            ? (rows as OrganizationResponse[]).map(toOrgOption)
            : (rows as AdminUserResponse[]).map(toUserOption));
        },
        // Lỗi tra cứu không được khoá cả màn: admin vẫn dán được GUID để làm việc.
        error: () => {
          this.loading.set(false);
          this.searched.set(true);
          this.options.set([]);
        },
      });
  }

  onQuery(value: string): void {
    const term = (value ?? '').trim();
    this.query.set(value ?? '');
    this.selected.set(null);

    // GUID dán thẳng: nhận luôn, KHÔNG bắn tìm kiếm (search theo email sẽ không bao giờ khớp GUID).
    if (GUID.test(term)) {
      this.ownerId.set(term);
      this.options.set([]);
      this.searched.set(false);
      return;
    }

    this.ownerId.set('');
    this.searched.set(false);
    // Tìm ngay từ 1 ký tự. Ngưỡng 2 ký tự (bản đầu) làm ô nhập câm lặng ở đúng lần gõ đầu tiên, mà
    // dữ liệu ở đây nhỏ (hàng chục org, hàng trăm user) nên chẳng tiết kiệm được gì đáng kể.
    if (term.length < 1) {
      this.options.set([]);
      return;
    }
    this.term$.next(term);
  }

  pick(option: OwnerOption): void {
    this.searched.set(false);
    this.selected.set(option);
    this.ownerId.set(option.id);
    this.query.set(option.primary);
    this.options.set([]);
  }

  /** Hiện dòng đã chọn thay vì `[object Object]` khi Material ghi giá trị option vào ô nhập. */
  display = (value: OwnerOption | string | null): string =>
    typeof value === 'string' ? value : (value?.primary ?? '');

  private reset(): void {
    this.query.set('');
    this.ownerId.set('');
    this.selected.set(null);
    this.options.set([]);
    this.searched.set(false);
  }
}

function toUserOption(u: AdminUserResponse): OwnerOption {
  return {
    id: u.id,
    primary: u.email ?? u.id,
    // Tên + org để phân biệt hai account cùng tiền tố email — thứ GUID không nói được gì.
    secondary: [u.fullName, u.orgName].filter(Boolean).join(' · ') || null,
  };
}

function toOrgOption(o: OrganizationResponse): OwnerOption {
  return { id: o.id, primary: o.name, secondary: o.taxCode ?? null };
}
