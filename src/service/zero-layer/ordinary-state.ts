import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getCurrentCharacterCardKey_ACU } from '../../data/gateways/host-state-gateway';
import { getActiveChatStorageIdentity_ACU } from '../../data/storage/chat-history';
import { captureZeroLayerCarrier_ACU, readZeroLayerCarrier_ACU } from './carrier-context';
import { ZERO_LAYER_CARRIER_FIELD_ACU, ZeroLayerError_ACU } from './model';
import { pendingZeroLayerPersistence_ACU } from './persistence-state';

/** 无零层字段的普通聊天不进入零层校验；未知保存即使本地字段已回滚也不能放行。 */
export function readOrdinaryZeroLayerState_ACU(allowActive = false) {
  const chat = getChatArray_ACU();
  const key = JSON.stringify([getCurrentCharacterCardKey_ACU(), getActiveChatStorageIdentity_ACU(chat)]);
  if (pendingZeroLayerPersistence_ACU.has(key)) {
    throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu chưa rõ, hãy đọc lại từ máy chủ để khôi phục rõ ràng, cấm tạo thường.');
  }
  if (!chat.some(message => message && typeof message === 'object'
    && Object.prototype.hasOwnProperty.call(message, ZERO_LAYER_CARRIER_FIELD_ACU))) return null;
  const context = captureZeroLayerCarrier_ACU();
  const envelope = readZeroLayerCarrier_ACU(context);
  if (!envelope) throw new ZeroLayerError_ACU('persist-unknown', 'Việc lưu vật mang chưa được xác nhận, cấm tạo thường.');
  if (allowActive && envelope.enabled && !envelope.exitManifest) return null;
  if (envelope.exitManifest?.phase !== 'committed') {
    throw new ZeroLayerError_ACU('mode-disabled', 'Trước khi tạo thường phải hoàn tất cầu nối thoát một cách rõ ràng; ý định prepared hoặc chỉ tắt chế độ thì không được cho qua.');
  }
  return { context, envelope };
}
