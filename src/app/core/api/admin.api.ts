import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminCampaignListItem,
  AdminUserResponse,
  OrderResponse,
  OrganizationResponse,
} from '../models';

/**
 * PlatformAdmin oversight (AUTH-7) — đọc toàn nền tảng, cross-org. Mọi endpoint `[Authorize(Roles="Admin")]`.
 * Gọi thẳng từng service qua Gateway (`/auth/admin/*`, `/campaign/admin/*`, `/payment/admin/*`).
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  /** GET /auth/admin/organizations */
  organizations(search?: string): Observable<OrganizationResponse[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<OrganizationResponse[]>(`${this.base}/auth/admin/organizations`, { params });
  }

  /** GET /auth/admin/users */
  users(opts?: { role?: string; search?: string }): Observable<AdminUserResponse[]> {
    let params = new HttpParams();
    if (opts?.role) params = params.set('role', opts.role);
    if (opts?.search) params = params.set('search', opts.search);
    return this.http.get<AdminUserResponse[]>(`${this.base}/auth/admin/users`, { params });
  }

  /** GET /campaign/admin/campaigns */
  campaigns(opts?: { status?: string; orgId?: string }): Observable<AdminCampaignListItem[]> {
    let params = new HttpParams();
    if (opts?.status) params = params.set('status', opts.status);
    if (opts?.orgId) params = params.set('orgId', opts.orgId);
    return this.http.get<AdminCampaignListItem[]>(`${this.base}/campaign/admin/campaigns`, { params });
  }

  /** GET /payment/admin/orders */
  orders(opts?: { status?: number; ownerType?: number }): Observable<OrderResponse[]> {
    let params = new HttpParams();
    if (opts?.status != null) params = params.set('status', String(opts.status));
    if (opts?.ownerType != null) params = params.set('ownerType', String(opts.ownerType));
    return this.http.get<OrderResponse[]>(`${this.base}/payment/admin/orders`, { params });
  }
}
