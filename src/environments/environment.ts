/**
 * Cấu hình môi trường (dev). Prod override qua environment.prod.ts + fileReplacements (angular.json).
 * apiBase LUÔN trỏ vào Gateway (không gọi thẳng service, không gọi AIService).
 * Dev gateway: http://localhost:5131  ·  Docker gateway: http://localhost:5050
 */
export const environment = {
  production: false,
  /** Base URL của Gateway, gồm cả tiền tố /api/v1. Mọi request FE nối tiếp path sau cái này. */
  apiBase: 'http://localhost:5131/api/v1',
};
