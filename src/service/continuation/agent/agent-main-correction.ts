/** 主会话纠正：领域 SQL 沿用逐栏提交；追溯边界单独保存，不推进结算水位。 */
import type { AgentConversationSnapshot_ACU, AgentCorrectMaterialsAction_ACU, AgentModuleSnapshot_ACU, AgentPendingFix_ACU } from './agent-model';
import { commitAgentModuleFieldWrites_ACU, hostAgentModuleCommitStorage_ACU, reconcileAgentFieldPending_ACU, reconcileAgentOperationOnlyPending_ACU, confirmAgentEmptyPatchPending_ACU, reconcileAgentEmptyPatchPending_ACU, type AgentModuleRevisionWindow_ACU, type AgentModuleCommitStorage_ACU, type AgentModuleFieldReceipt_ACU } from './agent-module-field-commit';
import { agentStoryEvidenceFloorIndexes_ACU } from './agent-placeholder-resolver';
import { readMessageSwipeId_ACU } from './agent-module-frame';

export function renderAgentCorrectionGuide_ACU(conversation: AgentConversationSnapshot_ACU, snapshot: AgentModuleSnapshot_ACU): string {
  const users = conversation.messages.filter(message => message.kind === 'user');
  const user = users[users.length - 1];
  return [
    '【主会话纠正权限】Có thể dùng sql của correct_materials để trực tiếp chỉnh hooks, info_gap, chronology, story_arc; nộp theo bằng chứng chính văn và số hiệu chỉnh hiện tại, chỉ biên nhận committed mới chứng minh đã lưu. Không được ghi yêu cầu người dùng, mức nước quyết toán hay các bảng khác.',
    'Khi người dùng rõ ràng yêu cầu bỏ qua lịch sử cũ và bắt đầu từ tầng AI chỉ định, hãy đưa riêng settlementStartIndex (bao gồm tầng đó), userMessageId và reason. Không được tự bỏ qua chỉ vì thất bại về dung lượng. Chỗ thiếu cũ được giữ làm bản ghi bỏ qua, không tính là đã quyết toán; thành công rồi mới open_round, không gửi lại cùng phạm vi vượt giới hạn.',
    'hooks chỉ ghi summary, status, importance, planted_index, planned_payoff; không ghi recent_floor, expected_revision chỉ dùng trong WHERE. Thao tác sai đã bị từ chối không có nghĩa là tư liệu nghiệp vụ hỏng; chỉ mục cùng được biên nhận operationOnlyConfirmed xác minh rõ ràng mới có thể khép lại mà không sửa nghiệp vụ, không thể chỉ dựa một câu "không có thay đổi" để xóa chỗ thiếu cột thật.',
    `ID tin nhắn người dùng thật mới nhất: ${user?.id ?? 'không có'}; số hiệu chỉnh mô-đun: ${JSON.stringify(snapshot.revisions)}.`,
    snapshot.settlementBoundary ? `Điểm truy ngược hiện tại: ${snapshot.settlementBoundary.startIndex}; lịch sử trước đó chưa quyết toán.` : '',
  ].filter(Boolean).join('\n');
}

/** 只按回执确认为已保存的同一条目、同一栏目清除字段拒绝，不能用无关成功清空模块。 */
function repairedPending_ACU(fixes: AgentPendingFix_ACU[], receipt: AgentModuleFieldReceipt_ACU): AgentPendingFix_ACU[] {
  return reconcileAgentFieldPending_ACU(fixes,
    [...receipt.accepted, ...(receipt.alreadySaved ?? [])].map(item => `${item.module}:${item.id}:${item.field}`));
}

export async function correctAgentMaterials_ACU(input: {
  action: AgentCorrectMaterialsAction_ACU;
  chat: any[];
  conversation: AgentConversationSnapshot_ACU;
  isCurrent: () => boolean;
  completedStages: readonly number[];
  storage?: AgentModuleCommitStorage_ACU;
}) {
  const { action, chat } = input;
  const storage = input.storage ?? hostAgentModuleCommitStorage_ACU;
  let sqlReceipt: AgentModuleFieldReceipt_ACU | undefined;
  let operationOnly = false;
  const reject = (reason: string) => ({ status: 'rejected' as const, reason, ...(sqlReceipt ? { sqlReceipt } : {}) });
  const targetIndex = chat.length - 1;
  const target = chat[targetIndex];
  const dispatchTarget = { message: target, swipeId: readMessageSwipeId_ACU(target) };
  const current = () => input.isCurrent() && storage.isActive(chat) && chat.length - 1 === targetIndex
    && chat[targetIndex] === target && readMessageSwipeId_ACU(target) === dispatchTarget.swipeId;
  if (!current() || !agentStoryEvidenceFloorIndexes_ACU(chat).has(targetIndex)) return reject('Cuộc trò chuyện hiện tại hoặc tầng chính văn chứa nó không khả dụng');
  let folded = storage.readFold(chat);
  if (folded.salvaged || folded.candidates.some(item => !item.valid)) return reject('Khung tư liệu bị hỏng, không thể chỉnh sửa trên kết quả cứu hộ');
  const revisionWindow: AgentModuleRevisionWindow_ACU = {};
  for (const module of ['hooks', 'infoGap', 'chronology', 'storyArc'] as const) {
    revisionWindow[module] = { base: folded.snapshot.revisions[module], head: folded.snapshot.revisions[module] };
  }
  if (action.settlementStartIndex !== undefined) {
    const users = input.conversation.messages.filter(message => message.kind === 'user');
    const user = users[users.length - 1];
    if (!user || user.id !== action.userMessageId) return reject('Điểm truy ngược phải dựa trên tin nhắn người dùng thật mới nhất');
    if (!agentStoryEvidenceFloorIndexes_ACU(chat).has(action.settlementStartIndex)) return reject('Điểm truy ngược phải là tầng chính văn AI đã tồn tại');
    if (action.settlementStartIndex < (folded.snapshot.settlementBoundary?.startIndex ?? 0)) return reject('Không thể ngầm khôi phục lịch sử đã bỏ qua thành chờ quyết toán, hãy nêu rõ phạm vi khôi phục trước');
  }
  if (action.sql) {
    sqlReceipt = await commitAgentModuleFieldWrites_ACU({ chat, targetIndex, dispatchTarget,
      sql: action.sql, role: 'main', completedStages: input.completedStages, isCurrent: current, storage, revisionWindow });
    const operationPaths = new Set((sqlReceipt.operationOnlyConfirmed ?? []).flatMap(proof => proof.rejectedPaths));
    operationOnly = sqlReceipt.status === 'rejected' && operationPaths.size > 0
      && sqlReceipt.partials?.length === 0 && sqlReceipt.revisions !== null
      && sqlReceipt.rejected.every(item => operationPaths.has(item.path));
    if (sqlReceipt.status !== 'committed' && !operationOnly) return { status: sqlReceipt.status, sqlReceipt };
    folded = storage.readFold(chat);
    if (!current() || folded.salvaged || folded.candidates.some(item => !item.valid)) return reject('Không thể xác nhận trạng thái tư liệu chuẩn sau khi chỉnh sửa');
    if (operationOnly && sqlReceipt.operationOnlyConfirmed?.some(proof => folded.snapshot.revisions[proof.module] !== proof.revision)) {
      return reject('Sau khi xác minh thao tác trường hệ thống, phiên bản tư liệu đã thay đổi, không thể đóng vấn đề cũ');
    }
  }
  const before = folded.snapshot;
  const now = Date.now();
  let pendingFixes = sqlReceipt ? repairedPending_ACU(before.pendingFixes, sqlReceipt) : before.pendingFixes;
  if (sqlReceipt?.operationOnlyConfirmed) pendingFixes = reconcileAgentOperationOnlyPending_ACU(pendingFixes, sqlReceipt.operationOnlyConfirmed);
  if (sqlReceipt?.status === 'committed' && !sqlReceipt.rejected.length && sqlReceipt.partials?.length === 0) {
    const confirmedIds = new Set([...sqlReceipt.accepted, ...(sqlReceipt.alreadySaved ?? [])]
      .filter(item => sqlReceipt!.revisions?.[item.module] === before.revisions[item.module])
      .map(item => `${item.module}:${item.id}`));
    const proofs = confirmAgentEmptyPatchPending_ACU(before, folded.fields, revisionWindow)
      .filter(proof => confirmedIds.has(`${proof.module}:${proof.id}`));
    pendingFixes = reconcileAgentEmptyPatchPending_ACU(pendingFixes, proofs);
  }
  let settlementBoundary = before.settlementBoundary;

  if (action.settlementStartIndex !== undefined) {
    const startIndex = action.settlementStartIndex;
    const skipped = [...(settlementBoundary?.skippedPendingFixes ?? [])];
    const active: AgentPendingFix_ACU[] = [];
    for (const fix of pendingFixes) {
      if (!['hooks', 'infoGap', 'chronology'].includes(fix.module) || fix.rangeStartIndex < 0 || fix.rangeStartIndex >= startIndex) {
        active.push(fix); continue;
      }
      const historical = { ...fix, rangeEndIndex: Math.min(fix.rangeEndIndex, startIndex - 1) };
      if (!skipped.some(item => JSON.stringify(item) === JSON.stringify(historical))) skipped.push(historical);
      if (fix.rangeEndIndex >= startIndex) active.push({ ...fix, rangeStartIndex: startIndex });
    }
    if (skipped.length > 128) return reject('Bản ghi bỏ qua vượt giới hạn có thể lưu, chưa thay đổi điểm truy ngược');
    pendingFixes = active;
    settlementBoundary = { startIndex, userMessageId: action.userMessageId!, reason: action.reason, updatedAt: now, skippedPendingFixes: skipped };
  }
  const changed = JSON.stringify(pendingFixes) !== JSON.stringify(before.pendingFixes)
    || JSON.stringify(settlementBoundary) !== JSON.stringify(before.settlementBoundary);
  if (!changed) return { status: 'committed' as const, sqlReceipt, settlementBoundary, ...(operationOnly ? { operationOnly: true } : {}) };
  const baseline = storage.captureBaseline(chat);
  const result = await storage.writeDelta(chat, targetIndex, {
    writes: {}, revisions: {}, pendingFixes,
    ...(settlementBoundary ? { settlementBoundary } : {}),
  }, now, readback => !readback.salvaged && readback.candidates.every(item => item.valid)
    && readback.snapshot.settledThroughIndex === Math.max(0, before.settledThroughIndex)
    && JSON.stringify(readback.snapshot.pendingFixes) === JSON.stringify(pendingFixes)
    && JSON.stringify(readback.snapshot.settlementBoundary) === JSON.stringify(settlementBoundary), baseline, current);
  return { ...result, sqlReceipt, ...(operationOnly ? { operationOnly: true } : {}),
    ...(result.status === 'committed' ? { settlementBoundary, pendingFixes } : {}),
  };
}
