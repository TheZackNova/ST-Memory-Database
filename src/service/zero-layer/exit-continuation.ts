import { CONTINUATION_FIRST_FLOOR_FIELD_ACU, validateContinuationEnvelope_ACU } from '../continuation/continuation-store';
import { AGENT_MODULE_FIELD_ACU, AGENT_CONVERSATION_FIELD_ACU } from '../continuation/agent/agent-model';
import { readAgentModuleFoldState_ACU } from '../continuation/agent/agent-module-store';
import { readAgentConversationRecordStrict_ACU } from '../continuation/agent/agent-conversation-store';
import { foldCheckpointContinuation_ACU } from './checkpoint-payload';
import { projectWorkingContinuation_ACU } from './checkpoint-projection';
import { continuationCheckpointPayload_ACU, checkpointFingerprint_ACU as fingerprint } from './checkpoint-payload';
import { requireExit_ACU, type captureExitSource_ACU } from './exit-source';
import type { ZeroLayerEnvelope_ACU } from './model';

type Source_ACU = ReturnType<typeof captureExitSource_ACU>;

/** 不将请求投影中的逻辑证据索引解释成普通物理楼层。 */
export function stageExitContinuation_ACU(source: ZeroLayerEnvelope_ACU,
  chat: Record<string, unknown>[], input: Source_ACU): void {
  const state = input.materials.continuation!;
  const envelope = state.envelope;
  requireExit_ACU(!envelope?.activeTask?.pendingHostTurn, 'Viết tiếp vẫn còn biên nhận nội dung chính đang chờ.');
  requireExit_ACU(!envelope?.activeTask || !['running', 'drafting', 'stopping_after_inflight'].includes(envelope.activeTask.status),
    'Tác vụ viết tiếp chưa dừng.');
  const projection = projectWorkingContinuation_ACU(source, input.timeline, state);
  const payload = continuationCheckpointPayload_ACU(projection.map(message => ({
    payload: message[AGENT_MODULE_FIELD_ACU], swipeId: String(message.swipe_id ?? 0),
  })));
  const snapshot = payload.checkpoint!.snapshot;
  const bridge = input.branch.bridge;
  requireExit_ACU(bridge?.phase === 'reconciled' && bridge.candidate, 'Viết tiếp thiếu bằng chứng nguồn của tài liệu vật lý gốc.');
  const original = foldCheckpointContinuation_ACU(bridge.activationCut.refs.map(ref => ({
    payload: bridge.candidate!.continuation.moduleFrames[JSON.stringify(ref)], swipeId: String(ref.swipeId),
  }))).snapshot;
  const sameCoordinates = <T extends { id: string }>(rows: T[], baseline: T[], coordinates: (row: T) => unknown) =>
    rows.every(row => {
      const old = baseline.find(item => item.id === row.id);
      return old !== undefined && fingerprint(coordinates(row)) === fingerprint(coordinates(old));
    });
  requireExit_ACU(sameCoordinates(snapshot.hooks, original.hooks, row => [row.plantedIndex, row.updatedIndex])
    && sameCoordinates(snapshot.infoGap, original.infoGap, row => row.revealIndex)
    && sameCoordinates(snapshot.constraints, original.constraints, row => row.createdIndex)
    && sameCoordinates(snapshot.chronology, original.chronology, row => [row.evidenceIndexes, row.updatedIndex])
    && fingerprint(snapshot.materialCompletion) === fingerprint(original.materialCompletion)
    && fingerprint(snapshot.settlementBoundary ?? null) === fingerprint(original.settlementBoundary ?? null),
  'Tài liệu viết tiếp chứa chỉ mục bằng chứng không thể chứng minh là nguồn vật lý gốc, định dạng tài liệu thường không thể tiếp nhận mà không mất dữ liệu.');
  requireExit_ACU(snapshot.pendingFixes.length === 0, 'Tài liệu viết tiếp vẫn còn mục chờ sửa.');
  // 非空资料的未结算逻辑范围不能通过重设水位隐藏。无资料来源时保留原空基底。
  const contributed = readAgentModuleFoldState_ACU(projection).contributed;
  requireExit_ACU(!contributed || snapshot.settledThroughIndex >= input.timeline.floors.length - 1,
    'Tài liệu viết tiếp vẫn còn lịch sử logic chưa quyết toán, mốc thường không thể biểu đạt khoảng trống này.');
  if (contributed) snapshot.settledThroughIndex = source.activationMessageCount - 1;
  payload.checkpoint!.swipeId = String(input.target.swipeId);
  for (const message of chat) {
    delete message[AGENT_MODULE_FIELD_ACU];
    delete message[AGENT_CONVERSATION_FIELD_ACU];
  }
  if (envelope) chat[0][CONTINUATION_FIRST_FLOOR_FIELD_ACU] = validateContinuationEnvelope_ACU(envelope, 'persist');
  else delete chat[0][CONTINUATION_FIRST_FLOOR_FIELD_ACU];
  chat[input.target.messageIndex][AGENT_MODULE_FIELD_ACU] = payload;
  chat[input.target.messageIndex][AGENT_CONVERSATION_FIELD_ACU] = structuredClone(state.conversation);
  const folded = readAgentModuleFoldState_ACU(chat);
  requireExit_ACU(!folded.salvaged && folded.candidates.every(item => item.valid)
    && fingerprint([folded.snapshot, folded.fields])
      === fingerprint([snapshot, payload.checkpoint!.fieldSnapshot]), 'Phát lại tài liệu viết tiếp khi thoát không tương đương.');
  requireExit_ACU(fingerprint(readAgentConversationRecordStrict_ACU(chat)) === fingerprint(state.conversation),
    'Phát lại hội thoại viết tiếp khi thoát không tương đương.');
}
