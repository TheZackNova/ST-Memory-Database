import { ZeroLayerError_ACU } from './model';
import type { ZeroLayerHistoryErrorCode_ACU, ZeroLayerHistoryResult_ACU } from './history-model';

export class ZeroLayerHistoryReadError_ACU extends Error {
  constructor(readonly code: ZeroLayerHistoryErrorCode_ACU, message: string) {
    super(message);
    this.name = 'ZeroLayerHistoryReadError_ACU';
  }
}

const recovery_ACU: Record<ZeroLayerHistoryErrorCode_ACU, [boolean, string]> = {
  'mode-disabled': [false, 'Host bật chế độ Tầng 0 một cách rõ ràng.'],
  loading: [true, 'Chờ cuộc trò chuyện tải xong rồi đọc lại.'],
  'not-ready': [true, 'Chờ host hoàn tất lắp ráp Tầng 0 hoặc khôi phục cầu nối.'],
  'access-denied': [false, 'Host cấp quyền lại cho phạm vi chỉ đọc hiện tại.'],
  'unsupported-version': [false, 'Dùng giao diện hoặc phiên bản bản lưu được hỗ trợ.'],
  'invalid-query': [false, 'Sửa tham số truy vấn rồi đọc lại.'],
  'not-found': [false, 'Chọn lượt có trong snapshot hiện tại.'],
  'storage-read-failed': [true, 'Host kiểm tra lưu trữ và đọc lại rõ ràng; giao diện đọc không tự động khôi phục.'],
  'corrupt-data': [false, 'Host kiểm tra bản lưu bị hỏng, cấm thay bằng lịch sử rỗng.'],
  'snapshot-stale': [true, 'Lấy lại snapshot rồi bắt đầu lại phân trang.'],
  'scope-changed': [true, 'Lấy lại snapshot và đăng ký trong phạm vi hiện tại.'],
  'history-unavailable': [false, 'Host kiểm tra nguồn lịch sử và tài liệu khôi phục khả dụng.'],
};

/** 不把上游错误载荷、凭据或私有日志透传至公开 Interface。 */
export function zeroLayerHistoryFailure_ACU<T>(error: unknown): ZeroLayerHistoryResult_ACU<T> {
  let code: ZeroLayerHistoryErrorCode_ACU = 'storage-read-failed';
  let message = 'Đọc lịch sử Tầng 0 thất bại.';
  if (error instanceof ZeroLayerHistoryReadError_ACU) {
    code = error.code;
    message = error.message;
  } else if (error instanceof ZeroLayerError_ACU) {
    switch (error.code) {
      case 'mode-disabled': case 'scope-changed': case 'corrupt-data':
      case 'unsupported-version': case 'history-unavailable':
        code = error.code; break;
      case 'chat-unavailable': code = 'loading'; break;
      case 'carrier-unavailable': code = 'not-ready'; break;
      case 'source-changed': code = 'history-unavailable'; break;
      case 'revision-conflict': code = 'snapshot-stale'; break;
    }
    message = `Đọc lịch sử Tầng 0 bị từ chối (${code}).`;
  }
  const [retryable, recoveryAction] = recovery_ACU[code];
  return { ok: false, error: { code, message, retryable, recoveryAction } };
}
