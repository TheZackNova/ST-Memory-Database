import { ZeroLayerError_ACU, type ZeroLayerEnvelope_ACU } from './model';
import type { ZeroLayerExitSelection_ACU } from './exit-model';
import { checkpointFingerprint_ACU as fingerprint, checkpointTurnRef_ACU } from './checkpoint-payload';
import { carrierSwipeId_ACU } from './carrier-context';
import { readZeroLayerPublishedMaterials_ACU } from './published-materials';
import { readCheckpointMaterials_ACU } from './checkpoint-materials';
import { buildZeroLayerTimeline_ACU } from './timeline';
import { captureBridgeConfig_ACU } from './bridge-config';

export function requireExit_ACU(value: unknown, message: string): asserts value {
  if (!value) throw new ZeroLayerError_ACU('migration-conflict', `${message} Hãy khôi phục trạng thái hoặc tiếp tục chế độ Tầng 0.`);
}

/** 来源只能由显式选择的原 FloorRef 证明；位置不生成逻辑身份。 */
export function captureExitSource_ACU(source: ZeroLayerEnvelope_ACU,
  chat: Record<string, unknown>[], selection: ZeroLayerExitSelection_ACU) {
  requireExit_ACU(!source.enabled && source.exitManifest === undefined, 'Phải xác nhận đóng trước, và không được ghi đè journal thoát hiện có.');
  requireExit_ACU(source.revision === selection.expectedRevision, 'Revision thoát đã thay đổi.');
  requireExit_ACU(source.turns.every(turn => ['published', 'failed', 'cancelled'].includes(turn.phase)), 'Vẫn còn lượt logic chưa kết thúc.');
  const branch = source.branches.find(item => item.branchId === source.activeBranchId);
  const head = source.turns.find(item => item.turnId === branch?.headTurnId);
  requireExit_ACU(head?.phase === 'published'
    && fingerprint(selection.head) === fingerprint(checkpointTurnRef_ACU(source, head)), 'Head thoát phải là đầu nhánh đã phát hành được chọn.');
  requireExit_ACU(!branch?.checkpoints?.pending && !branch?.checkpoints?.cleanupPending, 'Checkpoint logic chưa kết thúc.');
  const target = selection.target;
  const message = chat[target.messageIndex];
  requireExit_ACU(target.kind === 'host' && fingerprint(target.scope) === fingerprint(source.scope)
    && target.sourceFingerprint === source.activationFingerprint
    && target.messageIndex === source.activationMessageCount - 1 && chat.length === source.activationMessageCount
    && message && message.is_user !== true && message.is_system !== true
    && carrierSwipeId_ACU(message) === target.swipeId, 'Điểm tiếp nhập thường phải là assistant ở cuối tiền tố vật lý gốc, không được đoán tầng mới.');
  const materials = readZeroLayerPublishedMaterials_ACU(source);
  requireExit_ACU(materials.continuation && materials.simulation, 'Ba loại tài liệu khôi phục khi thoát chưa đầy đủ.');
  const table = readCheckpointMaterials_ACU(source).table;
  requireExit_ACU(table, 'Thoát thiếu quyết toán bảng của head đã chọn.');
  return { branch: branch!, head, target, materials, table,
    timeline: buildZeroLayerTimeline_ACU(source, chat), config: captureBridgeConfig_ACU(chat) };
}
