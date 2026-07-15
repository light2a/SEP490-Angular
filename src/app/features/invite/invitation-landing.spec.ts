import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignApi } from '../../core/api/campaign.api';
import { AuthStore } from '../../core/auth/auth.store';
import { NotifyService } from '../../core/notify.service';
import { InvitationInfo, JoinCampaignResult } from '../../core/models';
import { InvitationLanding } from './invitation-landing';

const INV: InvitationInfo = {
  campaignId: 'c1',
  title: 'Tuyển Backend .NET',
  orgName: 'FPT Software',
  jobTitle: 'Backend Developer',
  description: 'Phỏng vấn AI 5 câu',
  deadline: null,
  criteria: [{ name: 'OOP', weight: 0.5, maxScore: 10 }],
};

const JOIN: JoinCampaignResult = {
  accessToken: 'header.eyJzdWIiOiJjYW5kLTEiLCJyb2xlIjoiQ2FuZGlkYXRlIn0.sig',
  campaignId: 'c1',
  candidateId: 'cand-1',
  membershipStatus: 'Joined',
};

describe('InvitationLanding', () => {
  let api: { invitation: ReturnType<typeof vi.fn>; join: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    api = { invitation: vi.fn().mockReturnValue(of(INV)), join: vi.fn().mockReturnValue(of(JOIN)) };

    TestBed.configureTestingModule({
      imports: [InvitationLanding],
      providers: [
        // AuthStore thật (AuthApi cần HttpClient testing) — để verify token đi qua đúng cơ chế lưu.
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: CampaignApi, useValue: api },
        { provide: NotifyService, useValue: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(InvitationLanding);
    fixture.componentRef.setInput('token', 'tok-1');
    fixture.detectChanges();
    return fixture;
  }

  it('renders invitation metadata from the token', () => {
    const fixture = render();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(api.invitation).toHaveBeenCalledWith('tok-1');
    expect(text).toContain('Tuyển Backend .NET');
    expect(text).toContain('Backend Developer');
    expect(text).toContain('OOP');
  });

  it('join() stores the returned JWT via AuthStore (access-only) and navigates to the campaign', () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.join();

    expect(api.join).toHaveBeenCalledWith('tok-1');
    // Token lưu đúng cơ chế chung → authInterceptor sẽ tự gắn Bearer cho các call sau.
    expect(localStorage.getItem('isas.accessToken')).toBe(JOIN.accessToken);
    expect(localStorage.getItem('isas.refreshToken')).toBeNull();
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/candidate/campaigns', 'c1']);
  });
});
