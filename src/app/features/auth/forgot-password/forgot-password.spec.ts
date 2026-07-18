import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { ForgotPassword } from './forgot-password';

/**
 * Khoá hợp đồng với BE task DB24.
 *
 * Trước DB24, `POST /auth/reset-password` KHÔNG so sánh OTP người dùng gửi — nó chỉ đọc
 * cờ đã-verify (khoá theo email). Nếu sửa mỗi phía server mà FE không gửi kèm `otp` thì
 * request luôn 400 và luồng quên-mật-khẩu chết hoàn toàn. Test này giữ cho `otp` không bị
 * ai đó "dọn dẹp" bỏ đi vì tưởng thừa (nó ĐÃ được gửi ở bước verify-otp rồi).
 */
describe('ForgotPassword', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  const EMAIL = 'a@b.test';
  const OTP = '482913';
  const NEW_PASSWORD = 'Str0ngPass!';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    // Router THẬT (template có routerLink nên stub sẽ làm vỡ DI của provideRouter),
    // chỉ chặn điều hướng thật bằng spy.
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true as never);
  });

  afterEach(() => http.verify());

  /** Đưa component qua bước 1 (gửi email) và bước 2 (verify OTP) tới bước 3. */
  function arriveAtStep3(): ForgotPassword {
    const c = TestBed.createComponent(ForgotPassword).componentInstance;
    c.form.setValue({ email: EMAIL, otp: OTP, newPassword: NEW_PASSWORD });

    c.submit();
    http.expectOne((r) => r.url.endsWith('/forgot-password')).flush('ok');

    c.submit();
    http.expectOne((r) => r.url.endsWith('/verify-otp')).flush('ok');

    expect(c.step()).toBe(3);
    return c;
  }

  it('gửi kèm otp ở bước reset, không chỉ ở verify-otp', () => {
    const c = arriveAtStep3();

    c.submit();
    const req = http.expectOne((r) => r.url.endsWith('/reset-password'));

    // Đây là điều kiện sống còn: thiếu `otp` → BE trả 400 (DB24).
    expect(req.request.body).toEqual({
      email: EMAIL,
      otp: OTP,
      newPassword: NEW_PASSWORD,
    });

    req.flush('ok');
    expect(navigate).toHaveBeenCalledWith('/auth/login');
  });

  it('otp gửi ở bước reset đúng bằng otp đã nhập ở bước verify', () => {
    const c = arriveAtStep3();

    c.submit();
    const req = http.expectOne((r) => r.url.endsWith('/reset-password'));
    expect(req.request.body.otp).toBe(OTP);
    req.flush('ok');
  });

  it('reset hỏng (OTP hết hạn) → quay về bước 1 để xin mã mới, không kẹt ở bước 3', () => {
    const c = arriveAtStep3();

    c.submit();
    http
      .expectOne((r) => r.url.endsWith('/reset-password'))
      .flush('OTP not verified or expired', { status: 400, statusText: 'Bad Request' });

    // Bước 3 chỉ hiện ô mật khẩu → kẹt lại đó là ngõ cụt: không có đường xin mã mới.
    expect(c.step()).toBe(1);
    expect(c.error()).toBeTruthy();
    // Mã cũ đã chết → không giữ lại để người dùng tưởng còn dùng được.
    expect(c.form.controls.otp.value).toBe('');
    expect(navigate).not.toHaveBeenCalled();
  });
});
