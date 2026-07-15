import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FaceCheckResult,
  InvitationInfo,
  JoinCampaignResult,
  MyCampaignDetail,
  MyCampaignSummary,
  ProctorSignalType,
  StartInterviewResult,
} from '../models';

/**
 * /api/v1/campaign/* — luồng B2B phía ứng viên (invitation → join → my-campaigns → start).
 * Answers/submit của bài phỏng vấn dùng lại PracticeApi (endpoint Interview chung B2C/B2B).
 */
@Injectable({ providedIn: 'root' })
export class CampaignApi {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/campaign`;

  /** Public — metadata lời mời từ magic-link. */
  invitation(token: string): Observable<InvitationInfo> {
    return this.http.get<InvitationInfo>(`${this.base}/invitations/${encodeURIComponent(token)}`);
  }

  /** Public — join: backend provision Candidate + trả JWT (KHÔNG refreshToken → AuthStore.setAccessOnlySession). */
  join(token: string): Observable<JoinCampaignResult> {
    return this.http.post<JoinCampaignResult>(
      `${this.base}/invitations/${encodeURIComponent(token)}/join`,
      {},
    );
  }

  myCampaigns(): Observable<MyCampaignSummary[]> {
    return this.http.get<MyCampaignSummary[]>(`${this.base}/my-campaigns`);
  }

  myCampaign(campaignId: string): Observable<MyCampaignDetail> {
    return this.http.get<MyCampaignDetail>(`${this.base}/my-campaigns/${campaignId}`);
  }

  /** Create-or-get session phỏng vấn. 402 = org hết credit · 409 = completed/closed. */
  start(campaignId: string): Observable<StartInterviewResult> {
    return this.http.post<StartInterviewResult>(`${this.base}/${campaignId}/start`, {});
  }

  /** Proctoring: gửi cờ anti-cheat (tab_switch/paste/focus_lost) — UI proctoring dùng (agent khác). */
  reportFlag(
    campaignId: string,
    sessionId: string,
    signalType: ProctorSignalType,
    note?: string,
  ): Observable<unknown> {
    return this.http.post(`${this.base}/${campaignId}/sessions/${sessionId}/flags`, {
      signalType,
      note,
    });
  }

  /** Proctoring: đăng ký ảnh khuôn mặt tham chiếu (multipart `file`). */
  faceEnroll(
    campaignId: string,
    sessionId: string,
    image: Blob,
    filename = 'face.jpg',
  ): Observable<unknown> {
    const form = new FormData();
    form.append('image', image, filename);
    return this.http.post(`${this.base}/${campaignId}/sessions/${sessionId}/face-enroll`, form);
  }

  /** Proctoring: đối chiếu khuôn mặt trong lúc thi (multipart `image`). */
  faceCheck(
    campaignId: string,
    sessionId: string,
    image: Blob,
    filename = 'face.jpg',
  ): Observable<FaceCheckResult> {
    const form = new FormData();
    form.append('image', image, filename);
    return this.http.post<FaceCheckResult>(
      `${this.base}/${campaignId}/sessions/${sessionId}/face-check`,
      form,
    );
  }
}
