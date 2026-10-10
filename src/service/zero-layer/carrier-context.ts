import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getCurrentCharacterCardKey_ACU } from '../../data/gateways/host-state-gateway';
import { getActiveChatStorageIdentity_ACU } from '../../data/storage/chat-history';
import {
  ZERO_LAYER_CARRIER_FIELD_ACU, ZeroLayerError_ACU,
  type ZeroLayerEnvelope_ACU, type ZeroLayerScope_ACU,
} from './model';
import { validateZeroLayerEnvelope_ACU } from './validation';

type HostMessage_ACU = Record<string, unknown>;

/** 宿主保存必须暂挂候选；同步读侧在确认前仍读取原权威快照。 */
const savingSnapshots_ACU = new WeakMap<HostMessage_ACU, { before: ZeroLayerEnvelope_ACU | null }>();

export function isolateZeroLayerCarrierCandidate_ACU(
  context: ZeroLayerCarrierContext_ACU, before: ZeroLayerEnvelope_ACU | null,
): () => void {
  if (savingSnapshots_ACU.has(context.carrier)) {
    throw new ZeroLayerError_ACU('revision-conflict', 'Vật mang đã có ứng viên lưu, cấm vào lại.');
  }
  const entry = { before: structuredClone(before) };
  savingSnapshots_ACU.set(context.carrier, entry);
  return () => { if (savingSnapshots_ACU.get(context.carrier) === entry) savingSnapshots_ACU.delete(context.carrier); };
}

function message_ACU(value: unknown): value is HostMessage_ACU {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 只判断当前聊天是否带零层字段；不校验存档，也不计算物理指纹，可用于每次发送前的快速分流。 */
export function hasZeroLayerCarrierField_ACU(): boolean {
  return getChatArray_ACU().some(value => message_ACU(value)
    && Object.prototype.hasOwnProperty.call(value, ZERO_LAYER_CARRIER_FIELD_ACU));
}

export function carrierSwipeId_ACU(message: HostMessage_ACU): number {
  const value = message.swipe_id ?? 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ZeroLayerError_ACU('carrier-unavailable', 'Danh tính swipe của vật mang không hợp lệ.');
  }
  return value;
}

/** 不包含任何数据库私有字段；字段写入不改变源历史指纹。 */
export function physicalHistorySnapshot_ACU(chat: unknown[]): string {
  return JSON.stringify(chat.map(value => {
    if (!message_ACU(value) || typeof value.mes !== 'string') {
      throw new ZeroLayerError_ACU('source-changed', 'Lịch sử vật lý chứa tin nhắn không hợp lệ.');
    }
    const swipes = value.swipes;
    if (swipes !== undefined && (!Array.isArray(swipes) || swipes.some(body => typeof body !== 'string'))) {
      throw new ZeroLayerError_ACU('source-changed', 'Lịch sử vật lý chứa nội dung swipe không hợp lệ.');
    }
    return {
      role: value.is_user === true ? 'user' : value.is_system === true ? 'system' : 'assistant',
      body: value.mes, swipeId: carrierSwipeId_ACU(value), swipes: swipes ?? null,
    };
  }));
}

export async function physicalHistoryFingerprint_ACU(snapshot: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export interface ZeroLayerCarrierContext_ACU {
  chat: unknown[];
  carrier: HostMessage_ACU;
  carrierIndex: number;
  swipeId: number;
  scope: ZeroLayerScope_ACU;
  key: string;
  source: string;
  messageRefs: unknown[];
}

/** 下标仅用于定位；提交时同时验证作用域、对象身份、swipe 和源历史。 */
export function captureZeroLayerCarrier_ACU(): ZeroLayerCarrierContext_ACU {
  const chat = getChatArray_ACU();
  const chatId = getActiveChatStorageIdentity_ACU(chat);
  const characterKey = getCurrentCharacterCardKey_ACU();
  if (!chatId || chatId === '__host_without_chat_id__' || !characterKey
    || characterKey.startsWith('charname:')) {
    throw new ZeroLayerError_ACU('chat-unavailable', 'Cuộc trò chuyện hiện tại thiếu danh tính ổn định của cuộc trò chuyện hoặc thẻ nhân vật.');
  }
  const carrierIndex = chat.findIndex(value => message_ACU(value)
    && value.is_user !== true && value.is_system !== true);
  const carrier = chat[carrierIndex];
  if (!message_ACU(carrier) || typeof carrier.mes !== 'string') {
    throw new ZeroLayerError_ACU('carrier-unavailable', 'Cuộc trò chuyện hiện tại không có vật mang lời mở đầu để gắn.');
  }
  if (chat.some((value, index) => index !== carrierIndex && message_ACU(value)
    && Object.prototype.hasOwnProperty.call(value, ZERO_LAYER_CARRIER_FIELD_ACU))) {
    throw new ZeroLayerError_ACU('carrier-unavailable', 'Trường Tầng 0 tồn tại ở tầng vật lý khác, từ chối gắn lại.');
  }
  return {
    chat, carrier, carrierIndex, swipeId: carrierSwipeId_ACU(carrier),
    scope: { chatId, characterKey }, key: JSON.stringify([characterKey, chatId]),
    source: physicalHistorySnapshot_ACU(chat), messageRefs: [...chat],
  };
}

export function assertZeroLayerCarrier_ACU(context: ZeroLayerCarrierContext_ACU): void {
  const current = captureZeroLayerCarrier_ACU();
  if (current.chat !== context.chat || current.key !== context.key
    || current.carrier !== context.carrier || current.swipeId !== context.swipeId) {
    throw new ZeroLayerError_ACU('scope-changed', 'Cuộc trò chuyện, vật mang hoặc active swipe đã thay đổi, từ chối ghi.');
  }
  if (current.source !== context.source || current.chat.length !== context.messageRefs.length
    || current.chat.some((message, index) => message !== context.messageRefs[index])) {
    throw new ZeroLayerError_ACU('source-changed', 'Lịch sử nguồn vật lý đã thay đổi, phiên Tầng 0 cần xác nhận lại.');
  }
}

export function readZeroLayerCarrier_ACU(context: ZeroLayerCarrierContext_ACU): ZeroLayerEnvelope_ACU | null {
  const saving = savingSnapshots_ACU.get(context.carrier);
  return validateCarrierValue_ACU(context, saving ? saving.before ?? undefined : context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU]);
}

/** 仅保存链核对暂挂候选；业务读侧使用 readZeroLayerCarrier_ACU。 */
export function readZeroLayerCarrierCandidate_ACU(context: ZeroLayerCarrierContext_ACU): ZeroLayerEnvelope_ACU | null {
  const raw = context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
  return validateCarrierValue_ACU(context, raw);
}

function validateCarrierValue_ACU(context: ZeroLayerCarrierContext_ACU, raw: unknown): ZeroLayerEnvelope_ACU | null {
  if (raw === undefined) return null;
  const envelope = validateZeroLayerEnvelope_ACU(raw);
  if (envelope.scope.chatId !== context.scope.chatId
    || envelope.scope.characterKey !== context.scope.characterKey
    || envelope.carrierSwipeId !== context.swipeId) {
    throw new ZeroLayerError_ACU('scope-changed', 'Bản lưu Tầng 0 không khớp với cuộc trò chuyện hoặc swipe hiện tại.');
  }
  const committed = envelope.exitManifest?.phase === 'committed';
  if (envelope.seedBody !== context.carrier.mes
    || (committed ? context.chat.length < envelope.activationMessageCount
      : envelope.activationMessageCount !== context.chat.length)) {
    throw new ZeroLayerError_ACU('source-changed', 'Lịch sử vật lý lúc bật Tầng 0 đã thay đổi.');
  }
  if (committed) {
    const journal = envelope.exitManifest!;
    const target = context.chat[journal.target.messageIndex];
    if (physicalHistorySnapshot_ACU(context.chat.slice(0, envelope.activationMessageCount)) !== journal.physicalPrefixSnapshot
      || !message_ACU(target) || target.is_user === true || target.is_system === true
      || carrierSwipeId_ACU(target) !== journal.target.swipeId) {
      throw new ZeroLayerError_ACU('source-changed', 'Tiền tố vật lý cố định hoặc điểm tiếp nhập của bản lưu thoát đã thay đổi.');
    }
  }
  return envelope;
}