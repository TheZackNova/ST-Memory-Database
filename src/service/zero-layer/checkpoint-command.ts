import type { ZeroLayerEnvelope_ACU } from './model';
import { ZeroLayerError_ACU } from './model';
import type { ZeroLayerCheckpointSet_ACU } from './checkpoint-model';
import { buildZeroLayerTimeline_ACU } from './timeline';
import { checkpointReplayFrames_ACU, projectCheckpointContinuation_ACU } from './checkpoint-projection';
import { checkpointFingerprint_ACU as fingerprint, checkpointRecord_ACU as record,
  continuationCheckpointPayload_ACU, foldCheckpointContinuation_ACU, requireCheckpoint_ACU as requireValue } from './checkpoint-payload';
import { validateZeroLayerCheckpointSet_ACU } from './checkpoint-validation';
import { AGENT_MODULE_FIELD_ACU } from '../continuation/agent/agent-model';
import { assertCheckpointSource_ACU } from './checkpoint-source';

export type ZeroLayerCheckpointCommand_ACU =
  | { type: 'stage-checkpoint'; candidate: ZeroLayerCheckpointSet_ACU }
  | { type: 'activate-checkpoint'; checkpointId: string }
  | { type: 'clean-checkpoint'; checkpointId: string };

/** 同一 carrier 保存队列中的阶段迁移；这里不保存，不调用物理重定位。 */
export function applyZeroLayerCheckpointCommand_ACU(source: ZeroLayerEnvelope_ACU,
  command: ZeroLayerCheckpointCommand_ACU, physical: readonly Record<string, unknown>[]): ZeroLayerEnvelope_ACU {
  if (!source.enabled) throw new ZeroLayerError_ACU('mode-disabled', 'Checkpoint Tầng 0 cần vật mang đã được bật.');
  if (source.turns.some(turn => !['published', 'failed', 'cancelled'].includes(turn.phase))) {
    throw new ZeroLayerError_ACU('pending-turn', 'Lượt đang chạy không thể chuyển hoặc dọn checkpoint.');
  }
  const candidate = structuredClone(source);
  const branch = candidate.branches.find(item => item.branchId === candidate.activeBranchId)!;
  const timeline = buildZeroLayerTimeline_ACU(source, physical);
  const state = branch.checkpoints ??= { schemaVersion: 1, active: null, pending: null,
    cleanupPending: false, replayFrames: {} };
  if (command.type === 'stage-checkpoint') {
    if (state.pending || state.cleanupPending) throw new ZeroLayerError_ACU('invalid-transition', 'Giai đoạn checkpoint cũ chưa được xác nhận.');
    if (command.candidate.sourceRevision !== source.revision || command.candidate.sourceHeadTurnId !== branch.headTurnId) {
      throw new ZeroLayerError_ACU('revision-conflict', 'Nguồn lập kế hoạch checkpoint đã thay đổi.');
    }
    candidate.revision += 1;
    validateZeroLayerCheckpointSet_ACU(command.candidate, candidate, branch);
    assertCheckpointSource_ACU(source, timeline, command.candidate);
    state.pending = structuredClone(command.candidate);
  } else if (command.type === 'activate-checkpoint') {
    if (!state.pending || state.pending.checkpointId !== command.checkpointId || state.cleanupPending) {
      throw new ZeroLayerError_ACU('invalid-transition', 'Ứng viên checkpoint chưa được xác nhận.');
    }
    assertCheckpointSource_ACU(source, timeline, state.pending);
    state.active = state.pending;
    state.pending = null;
    state.cleanupPending = true;
    candidate.revision += 1;
  } else {
    if (!state.active || state.active.checkpointId !== command.checkpointId || !state.cleanupPending || state.pending) {
      throw new ZeroLayerError_ACU('invalid-transition', 'Kích hoạt checkpoint chưa được xác nhận, cấm dọn dẹp.');
    }

    const active = state.active;
    const cut = timeline.floors.findIndex(floor => fingerprint(floor.ref) === fingerprint(active.position.ref));
    requireValue(cut >= 0, 'Điểm cắt dọn checkpoint không tồn tại.');
    const replayFrames = checkpointReplayFrames_ACU(source, timeline);
    const rebuilt = continuationCheckpointPayload_ACU(replayFrames.slice(0, cut + 1));
    requireValue(fingerprint(rebuilt) === fingerprint(active.continuation), 'Tiền tố checkpoint bao phủ không tương đương với phát lại gốc.');
    const before = foldCheckpointContinuation_ACU(replayFrames);
    for (let index = 0; index <= cut; index += 1) {
      const key = JSON.stringify(timeline.floors[index].ref);
      const payload = replayFrames[index].payload;
      if (payload !== undefined) state.replayFrames[key] = structuredClone(payload);
      if (branch.continuation) delete branch.continuation.moduleFrames[key];
    }
    // 新基线只由 active manifest 提供，不把它重新写成回放源帧。
    state.cleanupPending = false;
    candidate.revision += 1;
    const projection = projectCheckpointContinuation_ACU(candidate, timeline);
    const after = foldCheckpointContinuation_ACU(projection.map(message => ({
      payload: message[AGENT_MODULE_FIELD_ACU], swipeId: String(message.swipe_id ?? 0),
    })));
    requireValue(fingerprint([before.snapshot, before.fields]) === fingerprint([after.snapshot, after.fields]),
      'Phát lại đầy đủ sau khi dọn checkpoint không tương đương, cấm lưu.');
  }
  return candidate;
}
