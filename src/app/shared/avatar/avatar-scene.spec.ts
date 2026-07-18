import { AvatarScene } from './avatar-scene';

/**
 * Hình ảnh 3D (nhép miệng có khớp không, ánh nhìn có tự nhiên không) chỉ mắt người mới kiểm được.
 * Ở đây chỉ khoá phần đúng-sai kiểm được bằng máy: dò WebGL và dọn dẹp không được ném lỗi,
 * vì mọi lỗi ở lớp này đều phải degrade thành "ẩn avatar", không được làm vỡ trang phỏng vấn.
 */
describe('AvatarScene', () => {
  it('báo không có WebGL trong môi trường không hỗ trợ (jsdom) thay vì ném lỗi', () => {
    expect(AvatarScene.isWebGLAvailable()).toBe(false);
  });

  it('dispose() an toàn khi chưa init (component destroy sớm)', () => {
    expect(() => new AvatarScene().dispose()).not.toThrow();
  });

  it('dispose() an toàn khi gọi nhiều lần', () => {
    const scene = new AvatarScene();
    scene.dispose();
    expect(() => scene.dispose()).not.toThrow();
  });

  it('setMouthOpen / setSpeaking không ném lỗi khi cảnh chưa dựng', () => {
    const scene = new AvatarScene();
    expect(() => {
      scene.setMouthOpen(0.7);
      scene.setSpeaking(true);
      scene.setSpeaking(false);
    }).not.toThrow();
  });

  it('init() sau khi dispose() không dựng cảnh (tránh rò rỉ khi destroy giữa chừng)', async () => {
    const scene = new AvatarScene();
    scene.dispose();
    const canvas = document.createElement('canvas');

    // Thoát sớm ngay sau khi nạp xong Three.js → resolve rỗng, không đụng tới WebGL.
    await expect(scene.init(canvas)).resolves.toBeUndefined();
  });
});
