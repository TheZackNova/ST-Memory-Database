/**
 * service/continuation/agent/agent-workflow.ts — 续写固定工作流
 *
 * 程序按固定顺序驱动结算、策划、容错提交与写作指令编排。
 * 主会话只提供开局参数，不再逐个派这些角色。模型调用通过端口注入，便于单测。
 */

import { ContinuationValidationError_ACU } from '../model';
import type { ContinuationSettings_ACU } from '../model';
import { reconcileAgentFieldPending_ACU, reconcileAgentOperationOnlyPending_ACU, reconcileAgentEmptyPatchPending_ACU, type AgentModuleFieldReceipt_ACU } from './agent-module-field-commit';
import {
  AGENT_INSTRUCTION_COMPOSER_NAME_ACU,
  type AgentComposerOutput_ACU,
  type AgentEmptyPatchConfirmation_ACU,
  type AgentFinalReviewerOutput_ACU,
  type AgentMaterialCompletionState_ACU,
  type AgentMaintainerOutput_ACU,
  type AgentModuleRevisions_ACU,
  type AgentModuleSnapshot_ACU,
  type AgentPendingFix_ACU,
  type AgentPendingFixSource_ACU,
  type AgentPlannerOutput_ACU,
  type AgentResearcherOutput_ACU,
  type AgentReviewerOutput_ACU,
  type AgentWritableModule_ACU,
} from './agent-model';
import {
  applyAgentConstraintRegistrationViaSql_ACU,
  applyAgentModuleDeltaViaSql_ACU,
  applyAgentWebRefsDeltaViaSql_ACU,
  mergeAgentDeltaRevisions_ACU,
  type AgentModuleApplyOptions_ACU,
} from './agent-transaction';

export interface ContinuationWorkflowOpening_ACU {
  focus: string;
  summary: string;
  dispatchWebResearcher: boolean;
}

export type ContinuationWorkflowBilling_ACU = 'pipeline' | 'opening';

export interface ContinuationWorkflowAgentCall_ACU {
  agentName: string;
  prompt: string;
  billing: ContinuationWorkflowBilling_ACU;
  targetModules?: AgentWritableModule_ACU[];
  /** 工作流尚未统一持久化的待修身份；资料状态仍从权威帧核实。 */
  pendingFixes?: readonly AgentPendingFix_ACU[];
}

export interface ContinuationWorkflowUnresolvedIssue_ACU {
  module: AgentWritableModule_ACU;
  source: AgentPendingFixSource_ACU;
  path: string;
  message: string;
  id?: string;
  rejectionKind?: 'empty_patch';
  revision?: number;
}

export interface ContinuationWorkflowAgentPayload_ACU {
  ok: boolean;
  summary: string;
  noChange?: boolean;
  maintainer?: AgentMaintainerOutput_ACU | null;
  arc?: AgentMaintainerOutput_ACU | null;
  planner?: AgentPlannerOutput_ACU | null;
  reviewer?: AgentReviewerOutput_ACU | null;
  researcher?: AgentResearcherOutput_ACU | null;
  readRevisions?: AgentModuleRevisions_ACU;
  writes?: readonly string[];
  completion?: Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>;
  moduleCompletion?: Partial<Record<AgentWritableModule_ACU, Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>>>;
  unresolvedIssues?: ContinuationWorkflowUnresolvedIssue_ACU[];
  acceptedKeys?: string[];
  usedFieldWrites?: boolean;
  operationOnlyConfirmed?: AgentModuleFieldReceipt_ACU['operationOnlyConfirmed'];
  emptyPatchConfirmed?: AgentEmptyPatchConfirmation_ACU[];
  fieldConfirmation?: { keys: string[]; revisions: AgentModuleRevisions_ACU };
}

export interface ContinuationWorkflowStep_ACU {
  agentName: string;
  status: 'ok' | 'failed' | 'skipped' | 'no_change';
  summary: string;
}

export interface ContinuationWorkflowResult_ACU {
  outcome: 'deliver' | 'no_change' | 'escalate';
  summary: string;
  instruction: string;
  pendingFixes: AgentPendingFix_ACU[];
  escalated: boolean;
  escalationKind: '' | 'pending_fix' | 'final_review';
  snapshot: AgentModuleSnapshot_ACU;
  steps: ContinuationWorkflowStep_ACU[];
}

export interface ContinuationWorkflowInput_ACU {
  settings: ContinuationSettings_ACU;
  snapshot: AgentModuleSnapshot_ACU;
  opening: ContinuationWorkflowOpening_ACU;
  hasUnsettledHistory: boolean;
  beatObligation: boolean;
  turnNumber: number;
  settledIndex: number;
  /** 本轮实际注入的正文起点；缺省保留既有完整结算语义。 */
  settlementStartIndex?: number;
  /** 窗口外仍有未处理正文时，不得推进连续结算水位。 */
  canAdvanceSettlement?: boolean;
  completedStageNumbers: readonly number[];
  evidenceFloorIndexes?: ReadonlySet<number>;
  runAgent: (call: ContinuationWorkflowAgentCall_ACU) => Promise<ContinuationWorkflowAgentPayload_ACU>;
  readCommittedSnapshot?: () => AgentModuleSnapshot_ACU;
  runComposer: (call: { prompt: string; revisionFeedback: string; priorInstruction: string }) => Promise<AgentComposerOutput_ACU>;
  runFinalReview: (instruction: string, summary: string) => Promise<AgentFinalReviewerOutput_ACU>;
}

const MAINTAINER_NAME_ACU = 'hook-cognition-maintainer';
const MAINLINE_NAME_ACU = 'mainline-planner';
const BEAT_NAME_ACU = 'beat-planner';
const ARC_NAME_ACU = 'arc-architect';
const WEB_NAME_ACU = 'web-researcher';
const MAINTAINER_MODULES_ACU = ['hooks', 'infoGap', 'chronology'] as const;
const BEAT_OBLIGATION_PATTERN_ACU = /伏笔|埋设|回收|误导|信息差|揭示|phục bút|gieo|thu hồi|đánh lạc hướng|chênh lệch thông tin|tiết lộ|hook/i;

export function continuationBeatObligation_ACU(turn: { goal?: string; function?: string } | null): boolean {
  if (!turn) return false;
  if (turn.function === 'payoff' || turn.function === 'reveal') return true;
  return BEAT_OBLIGATION_PATTERN_ACU.test(turn.goal ?? '');
}

function isStale_ACU(error: unknown): boolean {
  return error instanceof ContinuationValidationError_ACU && error.error.code === 'CONTINUATION_INTERNAL_REQUEST_STALE';
}

function errorText_ACU(error: unknown): string {
  if (error instanceof ContinuationValidationError_ACU) return error.error.message;
  return error instanceof Error ? error.message : String(error);
}

function tolerantOptions_ACU(agentName: string): AgentModuleApplyOptions_ACU {
  return { onViolation: () => undefined, agentName };
}

function deltaTouched_ACU(delta: AgentMaintainerOutput_ACU['delta'] | null | undefined): boolean {
  if (!delta) return false;
  return Boolean(
    delta.hooks.length || delta.hookPatches.length || delta.infoGap.length || delta.infoGapPatches.length
    || delta.storyArc.length || delta.storyArcPatches.length || delta.chronology.length || delta.chronologyPatches.length,
  );
}

function formatFixes_ACU(fixes: readonly AgentPendingFix_ACU[]): string {
  if (!fixes.length) return 'không có';
  return fixes.map(item => `${item.module} lần ${item.attempts}: ${item.violations.map(violation => `${violation.path}: ${violation.message}`).join('; ') || item.lastError}`).join(' | ');
}

function acceptedKeysForModule_ACU(keys: readonly string[] | undefined, module: AgentWritableModule_ACU): string[] {
  return [...new Set((keys ?? []).filter(key => key.startsWith(`${module}:`)))];
}

function recordWorkflowIssues_ACU(
  snapshot: AgentModuleSnapshot_ACU,
  issues: readonly ContinuationWorkflowUnresolvedIssue_ACU[],
  agentName: string,
  rangeStartIndex: number,
  rangeEndIndex: number,
  acceptedKeys: readonly string[] | undefined,
): AgentModuleSnapshot_ACU {
  if (!issues.length) return snapshot;
  const now = Date.now();
  const pending: AgentPendingFix_ACU[] = snapshot.pendingFixes.map(item => ({
    ...item,
    violations: item.violations.map(violation => ({ ...violation, source: violation.source ?? item.source })),
    acceptedKeys: [...(item.acceptedKeys ?? [])],
  }));
  const byModule = new Map<AgentWritableModule_ACU, ContinuationWorkflowUnresolvedIssue_ACU[]>();
  for (const issue of issues) {
    const list = byModule.get(issue.module) ?? [];
    list.push(issue);
    byModule.set(issue.module, list);
  }
  for (const [module, moduleIssues] of byModule) {
    const found = pending.findIndex(item => item.module === module);
    const previous = found >= 0 ? pending[found] : null;
    const accepted = acceptedKeysForModule_ACU(acceptedKeys, module);
    const paths = new Set(moduleIssues.map(issue => issue.path));
    const violations = [...(previous?.violations ?? []).filter(issue => !paths.has(issue.path)),
      ...moduleIssues.map(issue => ({ path: issue.path, message: issue.message, source: issue.source,
        ...(issue.id ? { id: issue.id } : {}),
        ...(issue.rejectionKind ? { rejectionKind: issue.rejectionKind } : {}),
        ...(issue.revision !== undefined ? { revision: issue.revision } : {}) }))];
    const next: AgentPendingFix_ACU = {
      module,
      agentName: agentName || previous?.agentName || '',
      violations,
      attempts: (previous?.attempts ?? 0) + 1,
      firstFailedAtIndex: previous?.firstFailedAtIndex ?? rangeStartIndex,
      lastError: violations.map(issue => issue.message).join('; '),
      source: moduleIssues[0]?.source ?? 'protocol_failed',
      completion: accepted.length ? 'partial' : 'failed',
      rangeStartIndex: previous?.rangeStartIndex ?? rangeStartIndex,
      rangeEndIndex: Math.max(previous?.rangeEndIndex ?? rangeEndIndex, rangeEndIndex),
      acceptedKeys: [...new Set([...(previous?.acceptedKeys ?? []), ...accepted])],
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    if (found >= 0) pending[found] = next;
    else pending.push(next);
  }
  return { ...snapshot, pendingFixes: pending };
}

function completionModules_ACU(
  payload: ContinuationWorkflowAgentPayload_ACU,
  writes: readonly AgentWritableModule_ACU[],
  fallback: Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>,
): Partial<Record<AgentWritableModule_ACU, Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>>> {
  const modules = { ...(payload.moduleCompletion ?? {}) };
  for (const module of writes) if (!modules[module]) modules[module] = fallback;
  return modules;
}

function clearCompletedPending_ACU(
  snapshot: AgentModuleSnapshot_ACU,
  modules: Partial<Record<AgentWritableModule_ACU, Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>>>,
  rangeStartIndex: number,
  rangeEndIndex: number,
): AgentModuleSnapshot_ACU {
  const completed = new Set(Object.entries(modules)
    .filter(([, state]) => state === 'complete_changed' || state === 'complete_no_change')
    .map(([module]) => module));
  if (!completed.size) return snapshot;
  return { ...snapshot, pendingFixes: snapshot.pendingFixes.filter(item => !completed.has(item.module)
    || !pendingWithinSettlement_ACU(item, rangeStartIndex, rangeEndIndex)) };
}

function pendingWithinSettlement_ACU(item: AgentPendingFix_ACU, start: number, end: number): boolean {
  return start <= end && (item.rangeStartIndex ?? start) >= start && (item.rangeEndIndex ?? end) <= end;
}

function maintainerPrompt_ACU(focus: string, snapshot: AgentModuleSnapshot_ACU): string {
  const fixes = snapshot.pendingFixes.filter(item => (MAINTAINER_MODULES_ACU as readonly string[]).includes(item.module));
  return [
    `Tiêu điểm lượt này: ${focus}`,
    'Chỉ quyết toán từng tầng chính văn trong cửa sổ mà $HISTORY_UNSETTLED thực sự cung cấp; nội dung bị lược ngoài cửa sổ không được tuyên bố là đã đọc hay đã quyết toán. Thay đổi có bằng chứng ưu tiên giao một lần bằng summary + delta, chương trình lưu và đọc lại, thành công hoàn toàn thì không cần xác nhận lại. Khi không có thay đổi chứng thực được thì không gọi write_sql, giao thẳng summary ghi rõ kết quả đối chiếu từng mục; bản giao cuối cùng không kèm sql, không dùng thao tác rỗng như SELECT 1 để thay cho đối chiếu.',
    'hooks chỉ được ghi summary, status, importance, planted_index, planned_payoff; không ghi các trường hệ thống như recent_floor. expected_revision chỉ dùng để kiểm tra trong WHERE của UPDATE/DELETE, không đặt trong SET, cũng không tự tăng. Thao tác bị từ chối không có nghĩa là tư liệu hỏng; hãy dựa vào biên nhận để phân biệt thiếu cột thực tế, thay đổi nghiệp vụ chưa lưu, ghi nhầm trường hệ thống và tác vụ hết hiệu lực.',
    `Chờ sửa: ${formatFixes_ACU(fixes)}`,
  ].join('\n');
}

export async function runContinuationAgentWorkflow_ACU(input: ContinuationWorkflowInput_ACU): Promise<ContinuationWorkflowResult_ACU> {
  let snapshot = input.snapshot;
  const steps: ContinuationWorkflowStep_ACU[] = [];
  const plannerNotes: string[] = [];
  const pendingRangeStarts = snapshot.pendingFixes.map(item => item.rangeStartIndex).filter(index => Number.isInteger(index) && index >= 0);
  const settlementStartIndex = input.settlementStartIndex
    ?? (pendingRangeStarts.length ? Math.min(...pendingRangeStarts) : Math.max(0, snapshot.settledThroughIndex + 1));
  const settlementEndIndex = input.settledIndex;
  const previousCompletion = snapshot.materialCompletion;
  let committedPending = input.snapshot.pendingFixes;
  const refreshCommitted_ACU = (preservePending: boolean): void => {
    if (!input.readCommittedSnapshot) return;
    const committed = input.readCommittedSnapshot();
    if (!preservePending) {
      snapshot = committed;
    } else {
      const pendingFixes = [...snapshot.pendingFixes];
      const sameIssue = (left: AgentPendingFix_ACU['violations'][number], leftSource: AgentPendingFixSource_ACU,
        right: AgentPendingFix_ACU['violations'][number], rightSource: AgentPendingFixSource_ACU): boolean =>
        left.path === right.path && left.message === right.message && left.id === right.id
        && (left.source ?? leftSource) === (right.source ?? rightSource)
        && left.rejectionKind === right.rejectionKind && left.revision === right.revision;
      for (const fix of committed.pendingFixes) {
        const previous = committedPending.find(item => item.module === fix.module);
        const added = fix.violations.filter(issue => !previous?.violations.some(old =>
          sameIssue(issue, fix.source, old, previous.source)));
        if (previous && !added.length) continue;
        const index = pendingFixes.findIndex(item => item.module === fix.module);
        if (index < 0) { pendingFixes.push({ ...fix, violations: added }); continue; }
        const current = pendingFixes[index];
        const violations = [...current.violations.map(issue => ({ ...issue, source: issue.source ?? current.source })),
          ...added.filter(issue => !current.violations.some(old => sameIssue(issue, fix.source, old, current.source)))
            .map(issue => ({ ...issue, source: issue.source ?? fix.source }))];
        pendingFixes[index] = { ...current, violations,
          attempts: Math.max(current.attempts, fix.attempts),
          firstFailedAtIndex: Math.min(current.firstFailedAtIndex, fix.firstFailedAtIndex),
          rangeStartIndex: Math.min(current.rangeStartIndex, fix.rangeStartIndex),
          rangeEndIndex: Math.max(current.rangeEndIndex, fix.rangeEndIndex),
          acceptedKeys: [...new Set([...current.acceptedKeys, ...fix.acceptedKeys])],
          lastError: violations.map(issue => issue.message).join('; ') || current.lastError,
          updatedAt: Math.max(current.updatedAt, fix.updatedAt) };
      }
      snapshot = { ...committed, pendingFixes };
    }
    committedPending = committed.pendingFixes;
  };
  // 事务的旧路径会按模块清账；本轮未覆盖的缺口必须原样保留。
  const outsidePending = snapshot.pendingFixes.filter(item => !pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex));
  const restoreOutsidePending_ACU = () => {
    const pendingFixes = [...snapshot.pendingFixes];
    for (const previous of outsidePending) {
      const index = pendingFixes.findIndex(item => item.module === previous.module);
      if (index < 0) { pendingFixes.push(previous); continue; }
      const current = pendingFixes[index];
      if (current === previous) continue;
      pendingFixes[index] = {
        ...current,
        attempts: Math.max(previous.attempts, current.attempts),
        firstFailedAtIndex: Math.min(previous.firstFailedAtIndex, current.firstFailedAtIndex),
        rangeStartIndex: Math.min(previous.rangeStartIndex ?? previous.firstFailedAtIndex, current.rangeStartIndex ?? settlementStartIndex),
        rangeEndIndex: Math.max(previous.rangeEndIndex ?? settlementEndIndex, current.rangeEndIndex ?? settlementEndIndex),
        violations: [...previous.violations, ...current.violations.filter(issue =>
          !previous.violations.some(old => old.path === issue.path && old.message === issue.message))],
        acceptedKeys: [...new Set([...(previous.acceptedKeys ?? []), ...(current.acceptedKeys ?? [])])],
        createdAt: previous.createdAt ?? current.createdAt,
      };
    }
    snapshot = { ...snapshot, pendingFixes };
  };

  const runSafe_ACU = async (call: ContinuationWorkflowAgentCall_ACU): Promise<ContinuationWorkflowAgentPayload_ACU> => {
    try {
      const result = await input.runAgent({ ...call,
        ...(call.agentName === MAINTAINER_NAME_ACU ? { pendingFixes: snapshot.pendingFixes.filter(fix =>
          pendingWithinSettlement_ACU(fix, settlementStartIndex, settlementEndIndex)) } : {}) });
      if ((result.usedFieldWrites || result.acceptedKeys?.length || result.operationOnlyConfirmed?.length || result.emptyPatchConfirmed?.length) && input.readCommittedSnapshot) {
        // 保留本轮未持久化的诊断与清偿，只合入权威待修记录相对上次回读的新增项。
        refreshCommitted_ACU(!!call.targetModules);
      }
      return result;
    } catch (error) {
      if (isStale_ACU(error)) throw error;
      const details = error instanceof ContinuationValidationError_ACU ? error.error.details : undefined;
      const unresolvedIssues = Array.isArray(details?.unresolvedIssues)
        ? details.unresolvedIssues as ContinuationWorkflowUnresolvedIssue_ACU[] : undefined;
      return { ok: false, summary: errorText_ACU(error), unresolvedIssues,
        acceptedKeys: Array.isArray(details?.acceptedKeys) ? details.acceptedKeys as string[] : undefined };
    }
  };

  const applyMaintainerLike_ACU = async (
    output: AgentMaintainerOutput_ACU | null | undefined,
    writes: readonly string[],
    readRevisions: AgentModuleRevisions_ACU | undefined,
    agentName: string,
  ): Promise<AgentWritableModule_ACU[]> => {
    if (!output || !deltaTouched_ACU(output.delta)) return [];
    const delta = readRevisions ? mergeAgentDeltaRevisions_ACU(output.delta, readRevisions) : output.delta;
    const applied = await applyAgentModuleDeltaViaSql_ACU(snapshot, delta, writes, input.settledIndex, input.completedStageNumbers, tolerantOptions_ACU(agentName), input.evidenceFloorIndexes);
    snapshot = applied.snapshot;
    restoreOutsidePending_ACU();
    return applied.appliedModules;
  };

  // 开局检索与首轮结算并发：两者写集不相交（webRefs vs 结算模块）、互不消费，
  // 与主会话派工波次同一并发语义；结果落定后仍按「先百科、后结算」的原顺序应用到快照。
  const openingWeb = input.opening.dispatchWebResearcher
    ? runSafe_ACU({
      agentName: WEB_NAME_ACU,
      billing: 'opening',
      prompt: `Mở đầu yêu cầu bổ sung thiết lập bên ngoài. Tiêu điểm: ${input.opening.focus}`,
    })
    : null;
  const maintainerPending = snapshot.pendingFixes.some(item =>
    (MAINTAINER_MODULES_ACU as readonly string[]).includes(item.module)
    && pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex));
  const runFirstMaintainer = input.hasUnsettledHistory || maintainerPending;
  const firstMaintainer = runFirstMaintainer
    ? runSafe_ACU({
      agentName: MAINTAINER_NAME_ACU,
      billing: 'pipeline',
      prompt: maintainerPrompt_ACU(input.opening.focus, { ...snapshot,
        pendingFixes: snapshot.pendingFixes.filter(item => pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex)) }),
    })
    : null;
  const [web, firstMaintainerResult] = await Promise.all([openingWeb, firstMaintainer]);
  // 并发批次落定后统一回读权威快照：任一方的逐栏写入都不会被另一方的旧快照覆盖。
  refreshCommitted_ACU(false);

  if (web) {
    steps.push({ agentName: WEB_NAME_ACU, status: web.ok ? 'ok' : 'failed', summary: web.summary });
    if (web.ok && !web.usedFieldWrites && web.researcher && (web.researcher.items.length || (web.researcher.patches ?? []).length)) {
      const applied = await applyAgentWebRefsDeltaViaSql_ACU(
        snapshot,
        web.researcher,
        web.readRevisions?.webRefs,
        Date.now(),
        tolerantOptions_ACU(WEB_NAME_ACU),
      );
      snapshot = applied.snapshot;
    }
  }

  if (!runFirstMaintainer) {
    steps.push({ agentName: MAINTAINER_NAME_ACU, status: 'no_change', summary: 'Không có chính văn chưa quyết toán, cũng không có mô-đun quyết toán nào chờ sửa' });
  } else {
    let maintainer = firstMaintainerResult!;
    let repairAttempts = 0;
    const maxRepairAttempts = Math.max(0, input.settings.workflow.reviseLimit);
    while (true) {
      const writes = (maintainer.writes ?? [...MAINTAINER_MODULES_ACU])
        .filter((module): module is AgentWritableModule_ACU => (MAINTAINER_MODULES_ACU as readonly string[]).includes(module));
      let completion: Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'> = maintainer.completion
        ?? (!maintainer.ok ? 'failed' : maintainer.noChange || !deltaTouched_ACU(maintainer.maintainer?.delta) ? 'complete_no_change' : 'complete_changed');
      let modules = completionModules_ACU(maintainer, writes, completion);
      const appliedModules = maintainer.ok
        ? await applyMaintainerLike_ACU(maintainer.usedFieldWrites ? null : maintainer.maintainer, writes, maintainer.readRevisions, MAINTAINER_NAME_ACU)
        : [];
      const issues = [...(maintainer.unresolvedIssues ?? [])];
      if (maintainer.fieldConfirmation) {
        const proof = maintainer.fieldConfirmation;
        const keys = proof.keys.filter(key => writes.some(module => key.startsWith(`${module}:`)
          && snapshot.revisions[module] === proof.revisions[module])
          && !issues.some(issue => issue.path === key.replace(/^([^:]+):([^:]+):/, '$1#$2.')));
        snapshot = { ...snapshot, pendingFixes: snapshot.pendingFixes.flatMap(fix =>
          pendingWithinSettlement_ACU(fix, settlementStartIndex, settlementEndIndex)
            ? reconcileAgentFieldPending_ACU([fix], keys) : [fix]) };
      }
      if (!maintainer.ok && !issues.length) {
        for (const module of writes.length ? writes : [...MAINTAINER_MODULES_ACU]) {
          issues.push({ module, source: 'invoke_failed', path: module, message: maintainer.summary || 'Lệnh gọi agent phụ bảo trì thất bại' });
          modules[module] = 'failed';
        }
      }
      if (issues.length) {
        snapshot = recordWorkflowIssues_ACU(snapshot, issues, MAINTAINER_NAME_ACU, settlementStartIndex, settlementEndIndex, maintainer.acceptedKeys);
        completion = appliedModules.length ? 'partial' : 'failed';
      }
      if (maintainer.ok && !maintainer.usedFieldWrites) {
        // 成功检查同一范围后，旧调用失败已恢复；字段拒绝不能靠无变化交付清账。
        const completed = new Set(Object.entries(modules)
          .filter(([, state]) => state === 'complete_changed' || state === 'complete_no_change')
          .map(([module]) => module));
        const unresolvedModules = new Set(issues.map(item => item.module));
        snapshot = { ...snapshot, pendingFixes: snapshot.pendingFixes.flatMap(item => {
          if (!completed.has(item.module) || unresolvedModules.has(item.module)
            || !pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex)) return [item];
          const violations = item.violations.filter(issue => (issue.source ?? item.source) !== 'invoke_failed');
          return violations.length === item.violations.length ? [item] : violations.length ? [{ ...item, violations }] : [];
        }) };
      }
      if (maintainer.ok && !issues.length && maintainer.operationOnlyConfirmed?.length) {
        const proofs = maintainer.operationOnlyConfirmed.filter(proof => writes.includes(proof.module)
          && snapshot.revisions[proof.module] === proof.revision);
        const within = snapshot.pendingFixes.filter(fix => pendingWithinSettlement_ACU(fix, settlementStartIndex, settlementEndIndex));
        snapshot = { ...snapshot, pendingFixes: snapshot.pendingFixes.flatMap(fix => {
          if (!within.includes(fix)) return [fix];
          return reconcileAgentOperationOnlyPending_ACU([fix], proofs);
        }) };
      }
      if (maintainer.ok && !issues.length && maintainer.emptyPatchConfirmed?.length) {
        const proofs = maintainer.emptyPatchConfirmed.filter(proof => writes.includes(proof.module)
          && snapshot.revisions[proof.module] === proof.revision);
        snapshot = { ...snapshot, pendingFixes: snapshot.pendingFixes.flatMap(fix =>
          pendingWithinSettlement_ACU(fix, settlementStartIndex, settlementEndIndex)
            ? reconcileAgentEmptyPatchPending_ACU([fix], proofs) : [fix]) };
      }
      const transactionPending = snapshot.pendingFixes.filter(item => writes.includes(item.module)
        && pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex));
      if (transactionPending.length) {
        for (const fix of transactionPending) {
          const moduleAccepted = appliedModules.includes(fix.module) || acceptedKeysForModule_ACU(maintainer.acceptedKeys, fix.module).length > 0;
          modules[fix.module] = moduleAccepted ? 'partial' : 'failed';
        }
        completion = appliedModules.length ? 'partial' : 'failed';
      } else {
        snapshot = clearCompletedPending_ACU(snapshot, modules, settlementStartIndex, settlementEndIndex);
      }
      restoreOutsidePending_ACU();
      const now = Date.now();
      snapshot = {
        ...snapshot,
        materialCompletion: {
          state: completion,
          rangeStartIndex: settlementStartIndex,
          rangeEndIndex: settlementEndIndex,
          modules,
          updatedAt: now,
        },
        updatedAt: Math.max(snapshot.updatedAt, now),
      };
      if (completion === 'complete_changed' || completion === 'complete_no_change') {
        // 最近窗口可以完成，但这不等于此前所有正文都已处理。
        if (input.canAdvanceSettlement !== false && !outsidePending.some(item =>
          (MAINTAINER_MODULES_ACU as readonly string[]).includes(item.module))) {
          snapshot = { ...snapshot, settledThroughIndex: Math.max(snapshot.settledThroughIndex, input.settledIndex) };
        }
        if (previousCompletion && (previousCompletion.state === 'complete_changed' || previousCompletion.state === 'complete_no_change')
          && previousCompletion.rangeStartIndex >= 0
          && previousCompletion.rangeEndIndex >= previousCompletion.rangeStartIndex
          && previousCompletion.rangeEndIndex + 1 >= settlementStartIndex
          && previousCompletion.rangeStartIndex <= settlementEndIndex + 1) {
          snapshot = { ...snapshot, materialCompletion: { ...snapshot.materialCompletion,
            rangeStartIndex: Math.min(previousCompletion.rangeStartIndex, settlementStartIndex),
            rangeEndIndex: Math.max(previousCompletion.rangeEndIndex, settlementEndIndex) } };
        }
      }
      if (!maintainer.ok || completion === 'failed') {
        steps.push({ agentName: MAINTAINER_NAME_ACU, status: 'failed', summary: maintainer.summary });
      } else if (completion === 'complete_no_change') {
        steps.push({ agentName: MAINTAINER_NAME_ACU, status: 'no_change', summary: maintainer.summary || 'Quyết toán không có sự thật mới' });
      } else if (completion === 'partial') {
        steps.push({ agentName: MAINTAINER_NAME_ACU, status: 'failed', summary: `${maintainer.summary || 'Đã giữ lại một phần tư liệu'}; vẫn còn mục chờ bổ sung` });
      } else {
        steps.push({ agentName: MAINTAINER_NAME_ACU, status: 'ok', summary: maintainer.summary });
      }
      const repairPending = snapshot.pendingFixes.filter(item =>
        (MAINTAINER_MODULES_ACU as readonly string[]).includes(item.module)
        && pendingWithinSettlement_ACU(item, settlementStartIndex, settlementEndIndex)
        && item.source !== 'truncated');
      if (!repairPending.length || repairAttempts >= maxRepairAttempts) break;
      repairAttempts += 1;
      const repairModules = [...new Set(repairPending.map(item => item.module))];
      maintainer = await runSafe_ACU({
        agentName: MAINTAINER_NAME_ACU,
        billing: 'pipeline',
        targetModules: repairModules,
        prompt: [
          `Lần ghi tư liệu trước vẫn còn mục chờ sửa (lần sửa có định hướng thứ ${repairAttempts}):`,
          formatFixes_ACU(repairPending),
          'Chỉ sửa các mô-đun và trường nêu trên; không gửi lại các mô-đun khác đã lưu thành công. Trước hết đối chiếu tư liệu đã tiêm lần này và biên nhận; khi thật sự cần đọc bổ sung mà quyền đọc lần này còn hạn mức thì mới read địa chỉ chuẩn tương ứng. Khi hạn mức đã dùng hết thì không read lặp, không diễn giải giới hạn đọc thành không có quyền ghi; khi đã đủ bằng chứng thì dùng summary + delta chỉ giao patch của các trường thất bại, nếu không thì giao trung thực các chỗ thiếu chưa xác nhận. Patch rỗng không có nghĩa là tư liệu hỏng, khi không có thay đổi nghiệp vụ thì giao riêng kết quả đối chiếu, không gửi lại patch rỗng hay thao tác rỗng.',
        ].join('\n'),
      });
    }
  }

  // 维护尚未收敛时不启动依赖结算资料的策划与编排；独立的开局检索已完成并保留。
  if (snapshot.pendingFixes.length) {
    return {
      outcome: 'escalate',
      summary: `Bảo trì tư liệu chưa hoàn tất, nội dung đã lưu được giữ lại; chỉ sửa các mục chờ sửa rồi mới vào hoạch định và điều phối: ${formatFixes_ACU(snapshot.pendingFixes)}`,
      instruction: '',
      pendingFixes: snapshot.pendingFixes,
      escalated: true,
      escalationKind: 'pending_fix',
      snapshot,
      steps,
    };
  }

  const plannerCalls: ContinuationWorkflowAgentCall_ACU[] = [
    { agentName: MAINLINE_NAME_ACU, billing: 'pipeline', prompt: `Hoạch định cảnh của lượt này. Tiêu điểm: ${input.opening.focus}` },
  ];
  // 编排不变量：mainline-planner 与 beat-planner 写集不相交、判定互不依赖，属同层并发批（Promise.all）；
  // beat-planner 第二轮起保底派遣，是否操作由其 no_change 出口判断，仅首轮且无义务时跳过。
  if (input.turnNumber >= 2 || input.beatObligation) {
    plannerCalls.push({ agentName: BEAT_NAME_ACU, billing: 'pipeline', prompt: `Hoạch định thao tác phục bút và nhịp cảm xúc của lượt này; khi lượt này không có nhu cầu thực sự thì ghi rõ no_change, không bịa móc câu. Tiêu điểm: ${input.opening.focus}` });
  } else {
    steps.push({ agentName: BEAT_NAME_ACU, status: 'skipped', summary: 'Lượt đầu và không có nghĩa vụ phục bút, bỏ qua hoạch định nhịp' });
  }
  const planners = await Promise.all(plannerCalls.map(call => runSafe_ACU(call)));
  for (let index = 0; index < planners.length; index += 1) {
    const planner = planners[index];
    steps.push({ agentName: plannerCalls[index].agentName, status: planner.ok ? 'ok' : 'failed', summary: planner.summary });
    if (planner.ok && planner.planner) {
      plannerNotes.push(JSON.stringify({
        agentName: plannerCalls[index].agentName,
        ...planner.planner,
      }));
    } else {
      plannerNotes.push(JSON.stringify({ agentName: plannerCalls[index].agentName, status: 'failed',
        summary: planner.summary || 'Lượt này không có bản giao hoạch định khả dụng', recommendation: '', mustPreserve: [], risks: [] }));
    }
  }

  const composerBase = [
    `Tiêu điểm lượt này: ${input.opening.focus}`,
    input.opening.summary ? `Tóm tắt mở đầu: ${input.opening.summary}` : '',
    `Đề xuất hoạch định: ${plannerNotes.join('\n') || 'không có'}`,
    `Chờ sửa: ${formatFixes_ACU(snapshot.pendingFixes)}`,
    'Mỗi bản bàn giao hoạch định giữ lại nguồn, summary, recommendation, mustPreserve và risks. Đối chiếu từng điều kiện giữ lại và rủi ro, không chỉ trích recommendation; hoạch định thất bại không phải đề xuất dùng được. Chúng là đề xuất chờ xác minh, không cao hơn chính văn, sổ chuẩn hay yêu cầu của người dùng; khi có mâu thuẫn hãy nêu rõ sự cân nhắc trong summary, không được lặng lẽ bỏ điều kiện giữ lại hay bịa thêm sự thật còn thiếu.',
    'Đọc suốt tư liệu sau quyết toán, yêu cầu của người dùng và các ràng buộc đang hoạt động, tạo chỉ thị viết cho lượt này. Tự kiểm tra trước khi giao: các đề xuất hoạch định có mâu thuẫn nhau không, có mâu thuẫn với pacing lượt này không, có mâu thuẫn với sự thật cứng đã quyết toán/ràng buộc dài hạn không; khi phát hiện mâu thuẫn hãy chọn bên thận trọng hơn và ghi rõ sự cân nhắc trong summary, không được ghép nguyên hai đề xuất mâu thuẫn.',
  ].filter(Boolean).join('\n');

  const composer = await input.runComposer({ prompt: composerBase, revisionFeedback: '', priorInstruction: '' }).catch(error => {
    if (isStale_ACU(error)) throw error;
    const failed: AgentComposerOutput_ACU = { instruction: '', summary: errorText_ACU(error), constraints: null };
    return failed;
  });
  steps.push({
    agentName: AGENT_INSTRUCTION_COMPOSER_NAME_ACU,
    status: composer.instruction.trim() ? 'ok' : 'failed',
    summary: composer.summary || (composer.instruction.trim() ? 'Đã tạo chỉ thị viết' : 'instruction rỗng'),
  });
  if (composer.constraints) {
    snapshot = (await applyAgentConstraintRegistrationViaSql_ACU(
      snapshot,
      composer.constraints.add,
      composer.constraints.retire,
      input.settledIndex,
      tolerantOptions_ACU(AGENT_INSTRUCTION_COMPOSER_NAME_ACU),
    )).snapshot;
  }

  if (snapshot.pendingFixes.length) {
    const summary = `Quy trình dừng giao, các mô-đun chờ sửa cần phiên chính xử lý: ${snapshot.pendingFixes.map(item => `${item.module}(${item.attempts})`).join(', ') || 'không có'}`;
    return {
      outcome: 'escalate',
      summary,
      instruction: '',
      pendingFixes: snapshot.pendingFixes,
      escalated: true,
      escalationKind: 'pending_fix',
      snapshot,
      steps,
    };
  }

  let instruction = composer.instruction.trim();
  if (!instruction) {
    return {
      outcome: 'escalate',
      summary: composer.summary || 'instruction-composer không tạo ra chỉ thị viết không rỗng',
      instruction: '',
      pendingFixes: snapshot.pendingFixes,
      escalated: true,
      escalationKind: 'final_review',
      snapshot,
      steps,
    };
  }

  if (input.settings.finalReview.enabled) {
    let failures = 0;
    const limit = input.settings.workflow.reviseLimit;
    while (failures < limit) {
      let review: AgentFinalReviewerOutput_ACU;
      try {
        review = await input.runFinalReview(instruction, composer.summary);
      } catch (error) {
        if (isStale_ACU(error)) throw error;
        failures += 1;
        steps.push({ agentName: 'final-reviewer', status: 'failed', summary: errorText_ACU(error) });
        if (failures >= limit) break;
        continue;
      }
      if (review.verdict === 'pass') {
        steps.push({ agentName: 'final-reviewer', status: 'ok', summary: review.summary || 'pass' });
        failures = 0;
        break;
      }
      failures += 1;
      steps.push({ agentName: 'final-reviewer', status: 'failed', summary: `${review.verdict}: ${review.requiredFixes.join('; ') || review.summary}` });
      if (failures >= limit) break;
      let revised: AgentComposerOutput_ACU;
      try {
        revised = await input.runComposer({
          prompt: `${composerBase}\n\nHãy sửa tăng dần theo danh sách phản hồi, đừng viết lại toàn bộ.\nChỉ thị gốc:\n${instruction}`,
          revisionFeedback: `Danh sách cần sửa:\n${review.requiredFixes.join('\n')}\nPhải giữ lại:\n${review.preserve.join('\n') || 'chưa liệt kê riêng; giữ lại phần nội dung của chỉ thị gốc không bị phản hồi đề cập'}`,
          priorInstruction: instruction,
        });
      } catch (error) {
        if (isStale_ACU(error)) throw error;
        failures += 1;
        steps.push({ agentName: AGENT_INSTRUCTION_COMPOSER_NAME_ACU, status: 'failed', summary: errorText_ACU(error) });
        continue;
      }
      if (!revised.instruction.trim()) {
        failures += 1;
        steps.push({ agentName: AGENT_INSTRUCTION_COMPOSER_NAME_ACU, status: 'failed', summary: 'instruction sau khi sửa đổi rỗng' });
        continue;
      }
      instruction = revised.instruction.trim();
      if (revised.constraints) {
        snapshot = (await applyAgentConstraintRegistrationViaSql_ACU(
          snapshot,
          revised.constraints.add,
          revised.constraints.retire,
          input.settledIndex,
          tolerantOptions_ACU(AGENT_INSTRUCTION_COMPOSER_NAME_ACU),
       )).snapshot;
      }
      steps.push({ agentName: AGENT_INSTRUCTION_COMPOSER_NAME_ACU, status: 'ok', summary: 'Đã sửa tăng dần theo phản hồi' });
    }
    if (failures >= limit) {
      return {
        outcome: 'escalate',
        summary: `Chung thẩm không đạt ${limit} lần liên tiếp, đã nâng lên phiên chính`,
        instruction: '',
        pendingFixes: snapshot.pendingFixes,
        escalated: true,
        escalationKind: 'final_review',
        snapshot,
        steps,
      };
    }
  }

  return {
    outcome: 'deliver',
    summary: composer.summary || input.opening.summary || 'Quy trình cố định đã giao chỉ thị viết',
    instruction,
    pendingFixes: snapshot.pendingFixes,
    escalated: false,
    escalationKind: '',
    snapshot,
    steps,
  };
}
