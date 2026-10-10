import type { ZeroLayerBranch_ACU, ZeroLayerEnvelope_ACU } from './model';
import { checkpointFingerprint_ACU as fingerprint, checkpointRecord_ACU as record,
  checkpointInteger_ACU as integer, checkpointPath_ACU, checkpointTurnRef_ACU,
  foldCheckpointContinuation_ACU, requireCheckpoint_ACU as requireValue } from './checkpoint-payload';
import { AGENT_MODULE_FRAME_SCHEMA_VERSION_ACU } from '../continuation/agent/agent-model';

/** 工作帧是完整分栏基底；不接受损坏载荷、抢救结果或未确认增量。 */
export function validateZeroLayerWorkingFrame_ACU(raw: unknown): void {
  requireValue(record(raw) && typeof raw.branchId === 'string' && raw.branchId.trim()
    && record(raw.anchor) && ['host', 'logical'].includes(String(raw.anchor.kind))
    && Object.keys(raw).every(key => ['branchId', 'anchor', 'payload'].includes(key)),
  'Danh tính khung làm việc viết tiếp không hợp lệ.');
  const payload = raw.payload;
  requireValue(record(payload) && payload.schemaVersion === AGENT_MODULE_FRAME_SCHEMA_VERSION_ACU
    && record(payload.checkpoint) && payload.checkpoint.swipeId === '0'
    && integer(payload.checkpoint.operationSeq) && record(payload.checkpoint.fieldSnapshot)
    && Array.isArray(payload.deltas) && payload.deltas.length === 0,
  'Khung làm việc viết tiếp thiếu nền không mất dữ liệu hoặc mốc thao tác.');
  foldCheckpointContinuation_ACU([{ payload, swipeId: '0' }]);
}

/** 来源锚点只能是本分支当前 head 或未产生逻辑回合时的启用尾部。 */
export function validateZeroLayerWorkingFrameScope_ACU(source: ZeroLayerEnvelope_ACU,
  branch: ZeroLayerBranch_ACU): void {
  const working = branch.continuation?.workingFrame;
  if (working === undefined) return;
  validateZeroLayerWorkingFrame_ACU(working);
  const path = checkpointPath_ACU(source, branch.branchId);
  const head = path[path.length - 1];
  const hostRefs = branch.bridge?.activationCut.refs;
  const anchor = head ? checkpointTurnRef_ACU(source, head) : hostRefs?.[hostRefs.length - 1];
  requireValue(working.branchId === branch.branchId && anchor
    && fingerprint(working.anchor) === fingerprint(anchor), 'Khung làm việc viết tiếp không thuộc đầu nhánh hiện tại.');
}
