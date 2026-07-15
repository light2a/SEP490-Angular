/** Cấu hình môi trường prod. Đổi apiBase sang domain Gateway thật khi deploy. */
export const environment = {
  production: true,
  apiBase: '/api/v1', // cùng origin với Gateway khi deploy sau reverse-proxy; đổi thành URL tuyệt đối nếu tách host
};
