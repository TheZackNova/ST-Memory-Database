import { assembleAgentPrompt_ACU } from '../../../shared/agent-prompt-layout';
import { USER_PREFILL_CONTENT_ACU } from '../../../shared/user-prefill.js';
import { sha256HexSync_ACU } from '../../../shared/sha256-sync';
import { formatWorldSimulationLedgerRequiredFieldsVi_ACU, type WorldCollisionReport_ACU, type WorldSimulationLedger_ACU, type WorldSimulationLedgerModule_ACU, type WorldSimulationRunIdentity_ACU, type WorldSimulationSettings_ACU } from '../model';
import { applyWorldSimulationCandidatesDetailedViaSql_ACU, preflightWorldSimulationCandidates_ACU } from '../simulation-transaction';
import type { WorldSimulationRunWriteState_ACU } from '../simulation-run-write-state';
import type { WorldSimulationEvidenceRegistry_ACU } from '../world-simulation-evidence-registry';
import { mergeWorldSimulationEvidenceRegistrySnapshot_ACU, snapshotWorldSimulationEvidenceRegistry_ACU } from '../world-simulation-evidence-registry';
import { createWorldSimulationReadRoundState_ACU, runWorldSimulationToolBatch_ACU, type WorldSimulationToolDependencies_ACU } from '../world-simulation-agent-tools';
import { resolveWorldSimulationAgentApiPreset_ACU, type WorldSimulationApiPresetDependencies_ACU } from '../api-preset';
import { findWorldSimulationAgentDefinition_ACU, worldSimulationAgentNativeTools_ACU } from './agent-catalog';
import { WORLD_SIMULATION_AGENT_PREFILLS_ACU } from './agent-defaults';
import { adaptWorldSimulationPromptSegmentsToToolMode_ACU } from './agent-prompt-mode';
import type { WorldSimulationCandidate_ACU, WorldSimulationConversationMessage_ACU, WorldSimulationMainLoopResult_ACU, WorldSimulationReviewerResult_ACU, WorldSimulationRunResumeState_ACU, WorldSimulationSubagentOutcome_ACU } from './agent-model';
import type { WorldSimulationTargetAnchor_ACU } from './agent-model';
import { requireWorldSimulationHostAnchor_ACU } from '../simulation-identity';
import { summarizeWorldSimulationHandoff_ACU } from './agent-handoff-summarizer';
import type { WorldSimulationSessionInput_ACU } from './agent-session-log';
import { createWorldSimulationPlaceholderResolvers_ACU, type WorldSimulationPlaceholderContext_ACU } from './agent-placeholder-resolver';
import { compactWorldSimulationProtocolError_ACU, createWorldSimulationProtocolRepairState_ACU, parseWorldSimulationMainAction_ACU, parseWorldSimulationMainOutput_ACU, recordWorldSimulationProtocolFailure_ACU, renderWorldSimulationDirectorProtocolRejection_ACU } from './agent-protocol';
import { createWorldSimulationReadGateState_ACU, resolveWorldSimulationReadBudget_ACU } from './agent-read-gate';
import { clearWorldSimulationRunState_ACU, readWorldSimulationRunState_ACU, saveWorldSimulationRunState_ACU } from './agent-run-cache';
import { createHostWorldSimulationAgentStorage_ACU, type WorldSimulationAgentStorage_ACU } from './agent-storage';
import { beginWorldSimulationSessionRun_ACU, endWorldSimulationSessionRun_ACU, logWorldSimulationSession_ACU, readWorldSimulationSessionLog_ACU, updateWorldSimulationSession_ACU } from './agent-session-log';
import { countWorldSimulationTokens_ACU, measureWorldSimulationPrompt_ACU, type WorldSimulationTokenCounter_ACU } from './agent-token-budget';
import { executeWorldSimulationFinalRequest_ACU } from './final-request-token-gate';
import { renderWorldSimulationPrompt_ACU } from './prompt-template';
import { runWorldSimulationWorkflow_ACU, runWorldSimulationOneShotWorkflow_ACU } from './agent-workflow';
import { bindWorldSimulationFixedWorldbook_ACU, renderWorldSimulationDirectorReads_ACU, renderWorldSimulationSnapshotSections_ACU, splitWorldSimulationSubagentPrompt_ACU, verifyWorldSimulationFixedWorldbook_ACU, verifyWorldSimulationSnapshotSections_ACU, WORLD_SIMULATION_WORLDBOOK_UNAVAILABLE_ACU } from './agent-shared-materials';
import { loadAgentWorldbookSnapshot_ACU, renderAgentWorldbookTriggeredInjection_ACU, selectTriggeredWorldbookEntries_ACU, type AgentWorldbookSnapshot_ACU } from '../../continuation/agent/agent-worldbook-read';
import { buildRecentWorldbookScanText_ACU } from '../../continuation/agent/agent-placeholder-resolver';
import { planWorldSimulationHistoryCompaction_ACU } from './agent-history-compactor';
import { finishWorldSimulationMessages_ACU, resolveWorldSimulationToolMode_ACU, worldSimulationInvokeTools_ACU, type WorldSimulationAgentInvoker_ACU, type WorldSimulationSubagentRuntime_ACU } from './agent-subagent-runtime';
import { agentNativeTools_ACU, isModelExchangeSequence_ACU, nativeToolArguments_ACU, nativeToolExchange_ACU, normalizeAgentModelReply_ACU, type AiNativeToolCall_ACU, type AiWireMessage_ACU } from '../../ai/native-tool';
import { AGENT_DECISION_TOOL_NAMES_ACU, splitNativeDecisionCalls_ACU, worldSimulationDecisionTools_ACU } from '../../ai/agent-decision-tools';

export interface WorldSimulationMainLoopDependencies_ACU {
  invoke: WorldSimulationAgentInvoker_ACU;
  subagents: Pick<WorldSimulationSubagentRuntime_ACU, 'run' | 'runReviewer' | 'runOneShot'>;
  countTokens?: WorldSimulationTokenCounter_ACU;
  apiPreset?: WorldSimulationApiPresetDependencies_ACU;
}
export interface WorldSimulationMainLoopInput_ACU {
  identity: WorldSimulationRunIdentity_ACU;
  settings: WorldSimulationSettings_ACU;
  promptContext: WorldSimulationPlaceholderContext_ACU;
  registry: WorldSimulationEvidenceRegistry_ACU;
  tools: WorldSimulationToolDependencies_ACU;
  worldbookSnapshot?: Promise<AgentWorldbookSnapshot_ACU>;
  writeSql?: import('./agent-subagent-runtime').WorldSimulationSubagentRunInput_ACU['writeSql'];
  readCurrent?: import('./agent-subagent-runtime').WorldSimulationSubagentRunInput_ACU['readCurrent'];
  readFieldSnapshot?: import('./agent-subagent-runtime').WorldSimulationSubagentRunInput_ACU['readFieldSnapshot'];
  runWrites?: WorldSimulationRunWriteState_ACU;
  isCurrent?: () => boolean;
  persistSessionEvent?: (eventKey: string, event: WorldSimulationSessionInput_ACU) => Promise<unknown>;
  anchor?: WorldSimulationTargetAnchor_ACU;
  chat?: any[];
  /** 完整的请求级存储；逻辑模式不从 anchor/chat 推测宿主写口。 */
  storage?: WorldSimulationAgentStorage_ACU;
  resetRunBudget?: boolean;
  /** 仅由生产新任务入口启用；直接调用或恢复仍可沿用导演循环。 */
  directOpening?: boolean;
  /** 当前锚点正文已经有结算快照时为 true；pendingFixes 非空时工作流仍会向主会话报告缺口。 */
  anchorMaterialsCommitted?: boolean;
  /** 显式补足入口传入的程序级目标写集。 */
  targetModules?: readonly WorldSimulationLedgerModule_ACU[];
}

const compact_ACU = (error: unknown): string => error instanceof Error ? error.message : String(error);
const LEGACY_BUDGET_FEEDBACK_ACU = new Set(['iteration budget exhausted', 'delegation gate exhausted']);
const cursorKey_ACU = (identity: WorldSimulationRunIdentity_ACU): string => `${identity.stageId}#${identity.stageRevision}#${identity.baseLedgerRevision}`;
const fingerprint_ACU = (outcome: WorldSimulationSubagentOutcome_ACU): string => sha256HexSync_ACU(JSON.stringify([outcome.agentName, outcome.status, outcome.summary, outcome.candidate?.candidateId])).slice(0, 24);

function upsertLatestOutcome_ACU(items: WorldSimulationSubagentOutcome_ACU[], outcome: WorldSimulationSubagentOutcome_ACU): void {
  const previous = items.findIndex(item => item.agentName === outcome.agentName);
  if (previous >= 0) items.splice(previous, 1);
  items.push(outcome);
}

function latestOutcomes_ACU(items: readonly WorldSimulationSubagentOutcome_ACU[]): WorldSimulationSubagentOutcome_ACU[] {
  const latest: WorldSimulationSubagentOutcome_ACU[] = [];
  for (const item of items) upsertLatestOutcome_ACU(latest, item);
  return latest;
}


function rounds_ACU(transcript: readonly AiWireMessage_ACU[]): AiWireMessage_ACU[][] {
  const rounds: AiWireMessage_ACU[][] = [];
  let current: AiWireMessage_ACU[] = [];
  for (const message of transcript) {
    if (message.role === 'assistant' && current.length) {
      rounds.push(current);
      current = [message];
    } else {
      current.push(message);
    }
  }
  if (current.length) rounds.push(current);
  return rounds;
}

export const WORLD_SIMULATION_TRANSCRIPT_COMPACTION_KEEP_ROUNDS_ACU = 4;
export const WORLD_SIMULATION_TRANSCRIPT_COMPACTION_RATIO_ACU = 0.8;

export async function compactWorldSimulationTranscriptIfNeeded_ACU(input: {
  transcript: AiWireMessage_ACU[];
  unsettledCandidates: number;
  historyTokenBudget: number;
  countTokens: WorldSimulationTokenCounter_ACU;
  /** 调用方已按最终完整请求判定需要压缩时传 0；缺省按 transcript 自身的预算比例触发线。 */
  transcriptTriggerTokens?: number;
}): Promise<{ compacted: boolean; transcript: AiWireMessage_ACU[] }> {
  if (input.unsettledCandidates > 0 || input.historyTokenBudget <= 0 || input.transcript.length === 0) {
    return { compacted: false, transcript: input.transcript };
  }
  const trigger = input.transcriptTriggerTokens ?? Math.floor(input.historyTokenBudget * WORLD_SIMULATION_TRANSCRIPT_COMPACTION_RATIO_ACU);
  let tokens = 0;
  for (const message of input.transcript) tokens += await input.countTokens(message.content);
  if (tokens <= trigger) return { compacted: false, transcript: input.transcript };
  const grouped = rounds_ACU(input.transcript);
  if (grouped.length <= WORLD_SIMULATION_TRANSCRIPT_COMPACTION_KEEP_ROUNDS_ACU) {
    return { compacted: false, transcript: input.transcript };
  }
  const cutoff = grouped.length - WORLD_SIMULATION_TRANSCRIPT_COMPACTION_KEEP_ROUNDS_ACU;
  // Never summarize an unfinished native function call, or split its tool receipts.
  for (const group of grouped.slice(0, cutoff)) {
    const calls = group.flatMap(item => item.tool_calls ?? []);
    const receipts = group.filter(item => item.role === 'tool').map(item => item.tool_call_id);
    if (calls.length !== receipts.length || calls.some(call => !receipts.includes(call.id)) || receipts.some(id => !calls.some(call => call.id === id))) {
      return { compacted: false, transcript: input.transcript };
    }
  }
  const dropped = grouped.slice(0, grouped.length - WORLD_SIMULATION_TRANSCRIPT_COMPACTION_KEEP_ROUNDS_ACU).flat();
  const kept = grouped.slice(-WORLD_SIMULATION_TRANSCRIPT_COMPACTION_KEEP_ROUNDS_ACU).flat();
  const messages: WorldSimulationConversationMessage_ACU[] = dropped.map((item, index) => ({
    id: index + 1,
    kind: item.role === 'assistant' ? 'agent' : item.role === 'tool' ? 'model_feedback' : 'user',
    text: item.content,
    digest: item.content.slice(0, 240),
    turnKey: `compact-${index + 1}`,
    at: 0,
    ...(item.tool_calls?.length ? { toolCalls: item.tool_calls.map(call => ({ id: call.id, name: call.function.name, arguments: call.function.arguments })) } : {}),
    ...(item.tool_call_id ? { toolCallId: item.tool_call_id } : {}),
  }));
  try {
    const summary = await summarizeWorldSimulationHandoff_ACU({
      previous: null,
      messages,
      maxTokens: 2000,
      countTokens: input.countTokens,
    });
    return { compacted: true, transcript: [{ role: 'user', content: summary.report }, ...kept] };
  } catch {
    return { compacted: false, transcript: input.transcript };
  }
}

function resultContext_ACU(
  base: WorldSimulationPlaceholderContext_ACU,
  registry: WorldSimulationEvidenceRegistry_ACU,
  candidates: readonly WorldSimulationCandidate_ACU[],
  outcomes: readonly WorldSimulationSubagentOutcome_ACU[],
): WorldSimulationPlaceholderContext_ACU {
  return {
    ...base,
    runtimeContext: { ...((base.runtimeContext && typeof base.runtimeContext === 'object') ? base.runtimeContext as Record<string, unknown> : {}), outcomes },
    worldCandidates: candidates,
    evidenceRegistry: snapshotWorldSimulationEvidenceRegistry_ACU(registry),
  };
}

function toolResultText_ACU(results: Awaited<ReturnType<typeof runWorldSimulationToolBatch_ACU>>): string {
  return JSON.stringify(results.map(item => ({ kind: item.kind, address: item.address, status: item.status, summary: item.summary, evidenceRef: item.evidenceRef, content: item.content })));
}

function uniqueCandidates_ACU(items: readonly WorldSimulationCandidate_ACU[]): WorldSimulationCandidate_ACU[] {
  const byId = new Map<string, WorldSimulationCandidate_ACU>();
  for (const item of items) byId.set(item.candidateId, item);
  return [...byId.values()];
}

function record_ACU(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function candidateResourceKeys_ACU(candidate: WorldSimulationCandidate_ACU): Set<string> {
  const keys = new Set<string>();
  for (const [module, patch] of Object.entries(candidate.patch)) {
    const collection = record_ACU(patch);
    const upsert = collection?.upsert;
    const remove = collection?.remove;
    if (Array.isArray(upsert)) {
      for (const item of upsert) {
        const entry = record_ACU(item);
        if (typeof entry?.id === 'string' && entry.id.trim()) keys.add(`${module}:${entry.id.trim()}`);
      }
    }
    if (Array.isArray(remove)) {
      for (const item of remove) {
        const entry = record_ACU(item);
        if (typeof entry?.id === 'string' && entry.id.trim()) keys.add(`${module}:${entry.id.trim()}`);
      }
    }
    if (Array.isArray(upsert) || Array.isArray(remove)) continue;
    keys.add(module);
  }
  return keys;
}

function withoutCandidateResources_ACU(candidate: WorldSimulationCandidate_ACU, resources: ReadonlySet<string>): WorldSimulationCandidate_ACU | null {
  if (candidate.agentName === '' || !resources.size) return candidate;
  const patch: Record<string, unknown> = {};
  for (const [module, value] of Object.entries(candidate.patch)) {
    const collection = record_ACU(value);
    const upsert = collection?.upsert;
    const remove = collection?.remove;
    if (Array.isArray(upsert) || Array.isArray(remove)) {
      const remainingUpserts = Array.isArray(upsert) ? upsert.filter(item => {
        const entry = record_ACU(item);
        return typeof entry?.id !== 'string' || !resources.has(`${module}:${entry.id.trim()}`);
      }) : [];
      const remainingRemovals = Array.isArray(remove) ? remove.filter(item => {
        const entry = record_ACU(item);
        return typeof entry?.id !== 'string' || !resources.has(`${module}:${entry.id.trim()}`);
      }) : [];
      if (remainingUpserts.length || remainingRemovals.length) {
        patch[module] = { ...collection, upsert: remainingUpserts, remove: remainingRemovals };
      }
      continue;
    }
    if (!resources.has(module)) patch[module] = value;
  }
  return Object.keys(patch).length ? { ...candidate, patch } : null;
}

function upsertCandidateRevision_ACU(items: WorldSimulationCandidate_ACU[], candidate: WorldSimulationCandidate_ACU): void {
  const resources = candidateResourceKeys_ACU(candidate);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const existing = items[index];
    if (existing.agentName !== candidate.agentName) continue;
    const retained = withoutCandidateResources_ACU(existing, resources);
    if (retained) items[index] = retained;
    else items.splice(index, 1);
  }
  items.push(candidate);
}

export class WorldSimulationMainLoop_ACU {
  constructor(private readonly dependencies: WorldSimulationMainLoopDependencies_ACU) {}

  async run(input: WorldSimulationMainLoopInput_ACU): Promise<WorldSimulationMainLoopResult_ACU> {
    const storage = input.storage ?? createHostWorldSimulationAgentStorage_ACU(
      input.anchor ? requireWorldSimulationHostAnchor_ACU(input.anchor) : undefined, input.chat);
    if ((input.identity.kind === 'logical') !== (storage.mode === 'logical')) {
      throw new Error('WORLD_SIMULATION_STORAGE_IDENTITY_MISMATCH');
    }
    if (storage.mode === 'logical' && (!storage.hasPersistentHistory || !storage.canCompactHistory)) {
      throw new Error('WORLD_SIMULATION_LOGICAL_STORAGE_INCOMPLETE');
    }
    const persistentHistory = storage.hasPersistentHistory;
    const cursorKey = cursorKey_ACU(input.identity);
    const resumed = storage.mode === 'host'
      ? readWorldSimulationRunState_ACU(input.identity.chatIdentity, input.identity.taskId, cursorKey) : null;
    const anchorState = persistentHistory && !resumed
      ? await storage.restoreRunState(input.identity.taskId, cursorKey)
      : null;
    // 普通模式沿用活跃缓存；逻辑模式以本轮 Adapter 的持久状态为恢复权威。
    const resumedState = resumed ?? anchorState;
    if (resumedState?.evidenceSnapshot) {
      mergeWorldSimulationEvidenceRegistrySnapshot_ACU(input.registry, resumedState.evidenceSnapshot);
    }
    // 预算窗口重置：结构化 budgetExhausted 或旧字面值命中时，迭代/派工/同角色窗口重新起算。
    // 候选与证据全量保留；交接摘要仅作为下次请求的临时提示。
    // 末轮 persist(iteration+1) 会使 nextIteration 越过 maxIterations；这不是预算终局，
    // 只把迭代游标拉回第 1 轮，保留派工/同角色计数，避免「继续」直接掉进迭代耗尽。
    const resetRunBudget = input.resetRunBudget === true;
    const budgetExhausted = !!resumedState
      && (resumedState.budgetExhausted === true || LEGACY_BUDGET_FEEDBACK_ACU.has(resumedState.reviewerFeedback));
    const overflowed = !!resumedState
      && resumedState.nextIteration > input.settings.agentRunBudget.maxIterations;
    const iterationStart = resetRunBudget || budgetExhausted || overflowed ? 1 : Math.max(1, resumedState?.nextIteration ?? 1);
    const delegationsStart = resetRunBudget || budgetExhausted ? 0 : resumedState?.delegationsUsed ?? 0;
    const outcomes = latestOutcomes_ACU(resumedState?.subagentOutcomes ?? []);
    const candidates: WorldSimulationCandidate_ACU[] = resumedState?.candidates ? [...resumedState.candidates] : [];
    const perAgent = new Map<string, number>(resetRunBudget || budgetExhausted ? [] : Object.entries(resumedState?.perAgent ?? {}));
    let delegationsUsed = delegationsStart;
    let iteration = iterationStart;

    const persistedHistory = persistentHistory ? storage.readDirectorHistory() : [];
    // The floor projection owns confirmed turns. Only migrate the still-missing suffix of a
    // legacy run-state transcript when the current run's persisted prefix matches exactly.
    const legacyTranscript = resumedState?.transcript ?? [];
    const activeMark = persistentHistory ? storage.readCompactionSource().view.compaction : null;
    const runHistory = persistentHistory && !activeMark
      ? storage.readDirectorRunHistory(input.identity.runId) : [];
    const legacyPairs = legacyTranscript[0]?.role === 'user'
      && legacyTranscript[0].content === resumedState?.handoffSummary
      ? legacyTranscript.slice(1) : legacyTranscript;
    const isPairSequence = (messages: readonly { role: string; content: string }[]): boolean => isModelExchangeSequence_ACU(messages);
    const matchingRunPrefix = runHistory.length <= legacyPairs.length && runHistory.every((item, index) =>
      item.role === legacyPairs[index].role && item.content === legacyPairs[index].content);
    // A confirmed compaction mark supersedes both older and newer run-state transcript copies.
    // persist() flushes paired messages before saving run-state, so the floor projection owns
    // all acknowledged turns. Comparing a post-mark copy against just its new run suffix
    // would falsely report a conflict after the second resume.
    const missingLegacy = persistentHistory && !activeMark && isPairSequence(legacyPairs) && matchingRunPrefix
      ? legacyPairs.slice(runHistory.length) : [];
    if (persistentHistory && !activeMark && legacyPairs.length > runHistory.length && isPairSequence(legacyPairs) && !matchingRunPrefix) {
      throw new Error('WORLD_SIMULATION_LEGACY_TRANSCRIPT_CONFLICT');
    }
    if (persistentHistory && !activeMark && resumedState?.transcript?.length && !persistedHistory.length && !isPairSequence(legacyPairs)) {
      throw new Error('WORLD_SIMULATION_LEGACY_TRANSCRIPT_UNPAIRED');
    }
    const transcript: AiWireMessage_ACU[] = persistentHistory
      ? [...persistedHistory, ...missingLegacy]
      : [...legacyTranscript];
    const handoffHint = resumedState?.handoffSummary && !activeMark && !transcript.some(item => item.content === resumedState.handoffSummary)
      ? { role: 'user', content: resumedState.handoffSummary } : null;
    if (!persistentHistory && handoffHint) transcript.unshift(handoffHint);
    const worldbookSnapshot = await (input.worldbookSnapshot ?? loadAgentWorldbookSnapshot_ACU());
    const worldbookScan = worldbookSnapshot.available && worldbookSnapshot.entries.length
      ? buildRecentWorldbookScanText_ACU(storage.readChat()) : '';
    const triggeredWorldbook = !worldbookSnapshot.available
      ? WORLD_SIMULATION_WORLDBOOK_UNAVAILABLE_ACU
      : worldbookSnapshot.entries.length
        ? renderAgentWorldbookTriggeredInjection_ACU(worldbookSnapshot, worldbookScan) : '';
    const fixedWorldbook = bindWorldSimulationFixedWorldbook_ACU(triggeredWorldbook,
      worldbookSnapshot.available && worldbookSnapshot.entries.length
        ? selectTriggeredWorldbookEntries_ACU(worldbookSnapshot.entries, worldbookScan) : []);
    let persistedTranscriptLength = persistentHistory ? persistedHistory.length : 0;
    const flushDirectorHistory = async (): Promise<void> => {
      if (!persistentHistory || transcript.length <= persistedTranscriptLength) return;
      const pending = transcript.slice(persistedTranscriptLength);
      if (!isPairSequence(pending)) throw new Error('WORLD_SIMULATION_DIRECTOR_HISTORY_UNPAIRED');
      await storage.appendDirectorHistory({
        runId: input.identity.runId,
        taskId: input.identity.taskId,
        stageId: input.identity.stageId,
        stageRevision: input.identity.stageRevision,
        messages: pending.map(item => ({
          role: item.role as 'assistant' | 'user' | 'tool',
          content: item.content,
          ...(item.tool_calls ? { tool_calls: item.tool_calls } : {}),
          ...(item.tool_call_id ? { tool_call_id: item.tool_call_id } : {}),
        })),
      });
      persistedTranscriptLength = transcript.length;
    };
    const director = 'world-director' as const;
    const roundId = JSON.stringify([input.identity.taskId, input.identity.stageId, input.identity.stageRevision]);
    const readRoundState = createWorldSimulationReadRoundState_ACU();
    // Director may correct several different mechanical fields in sequence; repeated identical
    // failures remain capped by the repair state's per-fingerprint guard.
    const protocolRepair = createWorldSimulationProtocolRepairState_ACU(2);
    let pendingReview: { fingerprint: string; promise: Promise<WorldSimulationReviewerResult_ACU> } | null = null;
    const workflowEscalationPrefix = 'fixed-workflow-escalation:';
    let workflowEscalation: { summary: string; pendingFixes: WorldSimulationLedger_ACU['pendingFixes'] } | null = null;
    const currentLedger = (): WorldSimulationLedger_ACU => {
      input.runWrites?.assertCurrent();
      const current = input.readCurrent?.() ?? input.promptContext.worldState;
      if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('WORLD_SIMULATION_LEDGER_UNAVAILABLE');
      if (input.readCurrent && !input.runWrites && (current as WorldSimulationLedger_ACU).revision !== input.identity.baseLedgerRevision) throw new Error('WORLD_SIMULATION_LEDGER_STALE');
      return current as WorldSimulationLedger_ACU;
    };
    if (resumedState?.reviewerFeedback.startsWith(workflowEscalationPrefix)) {
      // 工作流预览未必已经写入权威账本；缺口必须随恢复锚点完整保存。
      let saved: unknown;
      try {
        saved = JSON.parse(resumedState.reviewerFeedback.slice(workflowEscalationPrefix.length));
      } catch {
        throw new Error('WORLD_SIMULATION_WORKFLOW_ESCALATION_INVALID');
      }
      if (!saved || typeof saved !== 'object' || !('summary' in saved) || typeof saved.summary !== 'string'
        || !('pendingFixes' in saved) || !Array.isArray(saved.pendingFixes)) {
        throw new Error('WORLD_SIMULATION_WORKFLOW_ESCALATION_INVALID');
      }
      workflowEscalation = { summary: saved.summary, pendingFixes: saved.pendingFixes as WorldSimulationLedger_ACU['pendingFixes'] };
    }
    const currentContext = (): WorldSimulationPlaceholderContext_ACU => ({ ...input.promptContext, worldState: currentLedger() });
    const candidateReviewFingerprint_ACU = (items: readonly WorldSimulationCandidate_ACU[]): string =>
      sha256HexSync_ACU(JSON.stringify([input.runWrites?.confirmedWrites ?? 0, uniqueCandidates_ACU(items).map(item => item.candidateId)]));
    const startPendingReview_ACU = (): void => {
      const available = uniqueCandidates_ACU(candidates);
      if (!available.length) {
        pendingReview = null;
        return;
      }
      try { input.runWrites?.assertCandidatesDisjoint(available); }
      catch { pendingReview = null; return; }
      const fingerprint = candidateReviewFingerprint_ACU(available);
      if (pendingReview?.fingerprint === fingerprint) return;
      pendingReview = {
        fingerprint,
        promise: this.dependencies.subagents.runReviewer({
          candidates: available,
          settings: input.settings,
          promptContext: resultContext_ACU(currentContext(), input.registry, available, outcomes),
          registry: input.registry,
          tools: input.tools,
          roundId, readRoundState,
          isCurrent: input.isCurrent,
          directorMaterials: renderWorldSimulationDirectorReads_ACU(transcript),
          triggeredWorldbook, fixedWorldbook,
        }),
      };
    };
    const readGateState = createWorldSimulationReadGateState_ACU();
    const toolUsage = { readsUsed: 0 };
    const preset = resolveWorldSimulationAgentApiPreset_ACU(input.settings, director, 'agent_loop', this.dependencies.apiPreset);
    // 开关只在运行开始时读一次：同一次运行内请求工具与缓存键保持稳定。
    const toolMode = resolveWorldSimulationToolMode_ACU(preset);
    const request = worldSimulationInvokeTools_ACU(toolMode,
      [...agentNativeTools_ACU(worldSimulationAgentNativeTools_ACU(director)), ...worldSimulationDecisionTools_ACU()]);
    const persistEntry = async (entryId: number, eventKey: string): Promise<void> => {
      if (!input.persistSessionEvent) return;
      const entry = readWorldSimulationSessionLog_ACU(input.identity.chatIdentity).find(item => item.id === entryId);
      if (!entry) return;
      await input.persistSessionEvent(eventKey, {
        kind: entry.kind, title: entry.title, detail: entry.detail,
        agentName: entry.agentName, ok: entry.ok, status: entry.status,
      });
    };
    const runEntryId = beginWorldSimulationSessionRun_ACU(
      input.identity.chatIdentity, 'Chạy Agent mô phỏng thế giới',
      resetRunBudget ? `Chạy tiếp theo chỉ thị của người dùng, đặt lại cửa sổ ngân sách (giữ ${candidates.length} ứng viên)` : budgetExhausted ? `Đặt lại cửa sổ ngân sách, tiếp tục từ lượt 1 (giữ ${candidates.length} ứng viên)` : resumedState ? `Khôi phục từ lần lặp ${iteration}` : `stage=${input.identity.stageId}`,
      !!resumedState,
    );
    await persistEntry(runEntryId, resumedState ? 'run-resumed' : 'run-started');


    const persist = async (nextIteration: number, reviewerFeedback = '', extras: { budgetExhausted?: boolean; handoffSummary?: string } = {}): Promise<void> => {
      await flushDirectorHistory();
      const unique = uniqueCandidates_ACU(candidates);
      const state: WorldSimulationRunResumeState_ACU = {
        taskId: input.identity.taskId,
        cursorKey,
        nextIteration,
        delegationsUsed,
        perAgent: Object.fromEntries(perAgent),
        outcomes: outcomes.map(item => ({ agentName: item.agentName, status: item.status, summary: item.summary, fingerprint: fingerprint_ACU(item) })),
        candidateFingerprint: sha256HexSync_ACU(JSON.stringify(unique.map(item => item.candidateId))),
        candidateSummary: unique.map(item => item.summary).join('; ').slice(0, 1000),
        // 升级标记与缺口跨后续 persist 保留；其它拒绝原因留在 transcript。
        reviewerFeedback: workflowEscalation && !extras.budgetExhausted
          ? `${workflowEscalationPrefix}${JSON.stringify(workflowEscalation)}` : reviewerFeedback,
        candidates: unique,
        subagentOutcomes: outcomes,
        evidenceSnapshot: snapshotWorldSimulationEvidenceRegistry_ACU(input.registry),
        transcript: [...transcript],
        ...(extras.budgetExhausted ? { budgetExhausted: true } : {}),
        ...(extras.handoffSummary ? { handoffSummary: extras.handoffSummary } : {}),
      };
      if (persistentHistory) await storage.persistRunState(state);
      if (storage.mode === 'host') saveWorldSimulationRunState_ACU(input.identity.chatIdentity, state);
    };

    const summarizeHandoff_ACU = async (): Promise<string | undefined> => {
      try {
        const messages: WorldSimulationConversationMessage_ACU[] = transcript.map((item, index) => ({
          id: index + 1,
          kind: item.role === 'assistant' ? 'agent' : 'user',
          text: item.content,
          digest: item.content.slice(0, 240),
          turnKey: `turn-${index + 1}`,
          at: 0,
        }));
        const result = await summarizeWorldSimulationHandoff_ACU({
          previous: null,
          messages,
          maxTokens: 2000,
          countTokens: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
        });
        return result.report;
      } catch {
        return undefined;
      }
    };

    const blockOnBudget_ACU = async (
      nextIteration: number,
      reviewerFeedback: string,
      title: string,
      detail: string,
      unresolved: string[],
      eventKey: string,
    ): Promise<WorldSimulationMainLoopResult_ACU> => {
      await flushDirectorHistory();
      const handoffSummary = await summarizeHandoff_ACU();
      await persist(nextIteration, reviewerFeedback, { budgetExhausted: true, ...(handoffSummary ? { handoffSummary } : {}) });
      const blockId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'block', title, detail, agentName: director, ok: false });
      await persistEntry(blockId, eventKey);
      return { outcome: 'blocked', summary: title, unresolved, outcomes };
    };

    // 新运行不经导演决策门控。仅恢复、用户指令续跑和工作流升级才进入下方主循环。
    if (input.directOpening === true && !resumedState && !resetRunBudget) {
      const focus = (typeof input.promptContext.userGuidance === 'string' && input.promptContext.userGuidance.trim())
        || (typeof input.promptContext.anchorMessage === 'string' && input.promptContext.anchorMessage.trim())
        || input.identity.stageId;
      const workflowEntryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, {
        kind: 'delegation', title: 'Quy trình cố định đang thực thi', detail: focus,
        agentName: director, status: 'running',
      });
      // 工作流可能逐栏持久化；先留下恢复锚点，避免中断后误当作新开局重复派工。
      await persist(iteration);
      let workflow: Awaited<ReturnType<typeof runWorldSimulationWorkflow_ACU>>;
      try {
        workflow = await (input.runWrites?.hasConfirmedWrites ? runWorldSimulationWorkflow_ACU : runWorldSimulationOneShotWorkflow_ACU)({
          identity: input.identity,
          settings: input.settings,
          promptContext: resultContext_ACU(currentContext(), input.registry, uniqueCandidates_ACU(candidates), outcomes),
          toolMode,
          registry: input.registry,
          tools: input.tools,
          roundId, readRoundState,
          writeSql: input.writeSql,
          readCurrent: input.readCurrent,
          readFieldSnapshot: input.readFieldSnapshot,
          runWrites: input.runWrites,
          isCurrent: input.isCurrent,
          opening: { summary: focus, focus, dispatchChronicler: false, skipModules: [] },
          anchorMaterialsCommitted: input.anchorMaterialsCommitted === true,
          targetModules: input.targetModules,
          subagents: this.dependencies.subagents,
          directorMaterials: renderWorldSimulationDirectorReads_ACU(transcript),
          triggeredWorldbook, fixedWorldbook,
        });
      } catch (error) {
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, workflowEntryId, { title: 'Quy trình cố định thất bại', detail: compact_ACU(error), ok: false, status: 'failed' });
        await persistEntry(workflowEntryId, 'workflow-opening-failed');
        throw error;
      }
      for (const outcome of workflow.outcomes) upsertLatestOutcome_ACU(outcomes, outcome);
      updateWorldSimulationSession_ACU(input.identity.chatIdentity, workflowEntryId, {
        title: `Quy trình cố định: ${workflow.outcome}`, detail: workflow.summary,
        ok: workflow.outcome !== 'escalate' && workflow.outcome !== 'blocked', status: workflow.outcome === 'escalate' || workflow.outcome === 'blocked' ? 'failed' : 'done',
      });
      await persistEntry(workflowEntryId, 'workflow-opening');
      if (workflow.outcome === 'escalate') {
        // 主循环接管未解决的缺口；不伪造模型曾输出的 open_round 或工具交换。
        workflowEscalation = { summary: workflow.summary, pendingFixes: workflow.pendingFixes };
        await persist(iteration + 1);
        iteration += 1;
      } else {
        await storage.clearRunState();
        if (storage.mode === 'host') clearWorldSimulationRunState_ACU(input.identity.chatIdentity);
        if (workflow.outcome === 'blocked') {
          const unresolved = workflow.pendingFixes.map(fix => `${fix.module}: ${fix.lastError}`);
          const blockId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'block', title: workflow.summary, detail: unresolved.join('; '), agentName: director, ok: false });
          await persistEntry(blockId, 'workflow-opening-blocked');
          return { outcome: 'blocked', summary: workflow.summary, unresolved, outcomes };
        }
        if (workflow.outcome === 'no_change') return { outcome: 'no_change', summary: workflow.summary, outcomes, finalProjection: workflow.finalProjection };
        if (!workflow.commitCandidate) throw new Error('WORLD_SIMULATION_WORKFLOW_COMMIT_CANDIDATE_REQUIRED');
        return { outcome: 'commit', summary: workflow.summary, commitCandidate: workflow.commitCandidate, outcomes, finalProjection: workflow.finalProjection };
      }
    }

    for (; iteration <= input.settings.agentRunBudget.maxIterations; iteration += 1) {
      await flushDirectorHistory();
      const requestSnapshot = snapshotWorldSimulationEvidenceRegistry_ACU(input.registry);
      const readBudget = resolveWorldSimulationReadBudget_ACU({
        historyTokenBudget: input.settings.agentHistoryTokenBudget,
        readTokenBudget: input.settings.agentReadTokenBudget,
        fallbackTokens: input.settings.agentReadFallbackTokens,
      });
      const requestContext = resultContext_ACU(currentContext(), input.registry, uniqueCandidates_ACU(candidates), outcomes);
      requestContext.readBudgetText = `Ngân sách đọc còn lại của lượt này: khoảng ${Math.max(0, readBudget.effectiveMaxReadTokens - readGateState.grantedTokens)} tokens (giới hạn ${readBudget.effectiveMaxReadTokens}, đã cấp ${readGateState.grantedTokens}); số lần read/search còn lại ${Math.max(0, input.settings.agentRunBudget.maxReads - toolUsage.readsUsed)}/${input.settings.agentRunBudget.maxReads}.`;
      if (persistentHistory) requestContext.history = { note: 'Lịch sử phiên chính đã được cung cấp theo thứ tự tin nhắn của mô hình; không hiển thị lại thẻ ở đây' };
      if (workflowEscalation) {
        const runtimeContext = requestContext.runtimeContext && typeof requestContext.runtimeContext === 'object'
          ? requestContext.runtimeContext as Record<string, unknown>
          : {};
        requestContext.runtimeContext = { ...runtimeContext, pendingFixes: workflowEscalation.pendingFixes, escalation: workflowEscalation.summary };
      }
      const mainEntryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, {
        kind: 'main_action',
        title: `Agent chính đang làm việc ở lượt ${iteration}`,
        detail: iteration === 1 ? `Đang phân tích mô phỏng hậu trường của lượt này: ${input.promptContext.userGuidance || input.identity.stageId}` : 'Đang kết hợp kết quả thu thập bằng chứng và giao việc của lượt trước để quyết định hành động tiếp theo…',
        agentName: director,
        status: 'running',
      });
      let sent: Awaited<ReturnType<typeof executeWorldSimulationFinalRequest_ACU>>;
      try {
        const split = splitWorldSimulationSubagentPrompt_ACU(
          adaptWorldSimulationPromptSegmentsToToolMode_ACU(director, input.settings.agentPrompts[director], toolMode), director);
        const rendered = await renderWorldSimulationPrompt_ACU(
          split.segments, director,
          // 阅读预算属于本轮运行时快照；不要把每次 read/search 后变化的数值
          // 混入导演请求的稳定提示前缀，否则历史请求的前缀会随配额漂移。
          createWorldSimulationPlaceholderResolvers_ACU({
            ...requestContext,
            evidenceRegistry: requestSnapshot,
            readBudgetText: 'Ngân sách đọc xem trong snapshot runtime của lượt này.',
          }),
        );
        const fixed = rendered.messages.filter(message => message.content !== USER_PREFILL_CONTENT_ACU);
        const snapshot = await renderWorldSimulationSnapshotSections_ACU(split.snapshotTemplate,
          createWorldSimulationPlaceholderResolvers_ACU({ ...requestContext, evidenceRegistry: requestSnapshot }));
        const snapshotText = [
          '【Snapshot mới nhất của lần mô phỏng thế giới này】',
          snapshot.text,
          ...(triggeredWorldbook ? [triggeredWorldbook] : []),
          `Ngân sách đọc thời gian thực: ${requestContext.readBudgetText ?? '(không khả dụng)'}`,
          `Số sửa đổi sổ cái: ${currentLedger().revision}`,
        ].join('\n\n');
        const tail = [...(persistentHistory && handoffHint ? [handoffHint] : [])];
        const count = this.dependencies.countTokens ?? countWorldSimulationTokens_ACU;
        const assemble = (body: typeof transcript) => finishWorldSimulationMessages_ACU(toolMode,
          assembleAgentPrompt_ACU(fixed, [...body, ...tail], snapshotText), WORLD_SIMULATION_AGENT_PREFILLS_ACU[director]);
        let prepared = assemble(transcript);
        // 无锚点路径与锚定路径同一口径：用最终准备发送的完整请求判定是否压缩，
        // 不再只按 transcript 估算——骨架与尾部的开销同样会把请求顶过阈值。
        if (!persistentHistory) {
          const threshold = input.settings.agentHistoryTokenBudget;
          if (threshold > 0 && await measureWorldSimulationPrompt_ACU(prepared, count) > threshold) {
            const compacted = await compactWorldSimulationTranscriptIfNeeded_ACU({
              transcript,
              unsettledCandidates: uniqueCandidates_ACU(candidates).length,
              historyTokenBudget: threshold,
              countTokens: count,
              // 是否需要压缩已经用完整请求判定过；这里只保留轮数与闭合保护。
              transcriptTriggerTokens: 0,
            });
            if (compacted.compacted) {
              transcript.splice(0, transcript.length, ...compacted.transcript);
              prepared = assemble(transcript);
            }
          }
        }
        if (storage.canCompactHistory) {
          const threshold = input.settings.agentHistoryTokenBudget;
          if (threshold > 0 && await measureWorldSimulationPrompt_ACU(prepared, count) > threshold) {
            await flushDirectorHistory();
            const confirmed = storage.readCompactionSource();
            const confirmedHistory = storage.readDirectorHistory();
            if (JSON.stringify(confirmedHistory) !== JSON.stringify(transcript)) {
              // Another confirmed floor event may arrive while the summary is prepared. Build
              // the candidate and the final request from the same authoritative projection.
              transcript.splice(0, transcript.length, ...confirmedHistory);
              persistedTranscriptLength = transcript.length;
              prepared = assemble(transcript);
            }
            const planned = confirmedHistory.length && await measureWorldSimulationPrompt_ACU(prepared, count) > threshold
              ? await planWorldSimulationHistoryCompaction_ACU({
                view: confirmed.view, triggerTokens: threshold, fixedPromptTokens: 0, preparedMessages: prepared, countTokens: count,
              }) : null;
            if (planned?.mark) {
              input.runWrites?.assertCurrent();
              if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_COMPACTION_RUN_STALE');
            }
            if (planned?.mark && await storage.writeCompaction({
              compaction: planned.mark, expectedFingerprint: confirmed.fingerprint,
              expectedStageId: input.identity.stageId, expectedStageRevision: input.identity.stageRevision,
            })) {
              const reloaded = storage.readCompactionSource();
              if (reloaded.view.compaction?.report !== planned.mark.report
                || reloaded.view.compaction.compactedThroughId !== planned.mark.compactedThroughId) {
                throw new Error('WORLD_SIMULATION_COMPACTION_READBACK_FAILED');
              }
              transcript.splice(0, transcript.length, ...storage.readDirectorHistory());
              persistedTranscriptLength = transcript.length;
              prepared = assemble(transcript);
            }
          }
        }
        sent = await executeWorldSimulationFinalRequest_ACU({
          messages: prepared,
          inputLimitTokens: input.settings.agentHistoryTokenBudget,
          tools: request.tools,
          historyBudgetTokens: input.settings.agentHistoryTokenBudget,
          count,
          invoke: messages => {
            if (fixedWorldbook.text) verifyWorldSimulationFixedWorldbook_ACU(fixedWorldbook, messages);
            if (snapshot.sections.length) verifyWorldSimulationSnapshotSections_ACU(snapshot, messages);
            return this.dependencies.invoke(director, messages, preset, request);
          },
        });
      } catch (error) {
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, mainEntryId, { title: `Agent chính thất bại ở lượt ${iteration}`, detail: compact_ACU(error), ok: false, status: 'failed' });
        await persistEntry(mainEntryId, `main-${iteration}-failed`);
        const failedId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'run_failed', title: 'Yêu cầu của Agent chính thất bại', detail: compact_ACU(error), agentName: director, ok: false });
        await persistEntry(failedId, `run-failed-main-${iteration}`);
        throw error;
      }
      if (sent.status === 'rejected') {
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, mainEntryId, { title: `Agent chính thất bại ở lượt ${iteration}`, detail: sent.reason, ok: false, status: 'failed' });
        await persistEntry(mainEntryId, `main-${iteration}-rejected`);
        await persist(iteration);
        const failedId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'run_failed', title: 'Yêu cầu cuối cùng vượt ngưỡng Token', detail: sent.reason, agentName: director, ok: false });
        await persistEntry(failedId, `run-failed-token-${iteration}`);
        throw new Error(sent.reason);
      }
      const turn = normalizeAgentModelReply_ACU(sent.response);
      const nativeCalls: AiNativeToolCall_ACU[] = turn.toolCalls;
      const raw = typeof sent.response === 'string' ? sent.response : turn.content;
      const allowDelegate = delegationsUsed < input.settings.agentRunBudget.maxDelegations;
      // 本轮动作的反馈：工具模式下回到对应函数调用的 tool 回执，JSON 模式下成对写成 assistant/user。
      const pushFeedback = (content: string): void => {
        if (toolMode === 'tools' && nativeCalls.length) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, nativeCalls.map(() => content)));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content });
      };
      let action;
      try {
        if (toolMode === 'tools') {
          if (!nativeCalls.length) throw new Error('Ở chế độ công cụ bắt buộc phải gọi hàm: thu thập bằng chứng dùng read hoặc search, quyết định gọi open_round, delegate, finalize hoặc block, không xuất văn bản JSON');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(nativeCalls), AGENT_DECISION_TOOL_NAMES_ACU);
          // nativeToolArguments_ACU 已把函数名注入 action，决策参数沿用原契约解析器校验。
          action = split.decision
            ? parseWorldSimulationMainAction_ACU(split.decision.payload, allowDelegate, requestSnapshot)
            : { kind: 'tools' as const, calls: split.tools.map(({ call, payload }) => {
              if (call.name !== 'read' && call.name !== 'search') throw new Error(`Agent chính không được phép gọi ${call.name}`);
              return parseWorldSimulationMainAction_ACU(payload, false, requestSnapshot) as Extract<ReturnType<typeof parseWorldSimulationMainAction_ACU>, { kind: 'read' | 'search' }>;
            }) };
        } else {
          if (nativeCalls.length) throw new Error('Hiện ở chế độ JSON, không gọi hàm; hãy viết hành động thành đối tượng JSON để xuất');
          action = parseWorldSimulationMainOutput_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[director], allowDelegate, requestSnapshot);
        }
      } catch (error) {
        const exhausted = compactWorldSimulationProtocolError_ACU(error);
        if (exhausted.reasonCode === 'DELEGATION_BUDGET_EXHAUSTED') {
          updateWorldSimulationSession_ACU(input.identity.chatIdentity, mainEntryId, { title: `Ngân sách giao việc của Agent chính hết ở lượt ${iteration}`, detail: `${exhausted.reasonCode} ${exhausted.path}`, ok: false, status: 'failed' });
          await persistEntry(mainEntryId, `main-${iteration}-delegation-budget`);
          pushFeedback('Ngân sách giao việc đã hết, kết thúc lượt này.');
          return blockOnBudget_ACU(
            iteration,
            'delegation budget exhausted',
            'Ngân sách giao việc đã hết',
            `${exhausted.reasonCode} ${exhausted.path}`,
            ['delegation budget exhausted'],
            'block-delegation-budget',
          );
        }
        const failure = recordWorldSimulationProtocolFailure_ACU(protocolRepair, error);
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, mainEntryId, { title: `Giao thức của Agent chính không đạt ở lượt ${iteration}`, detail: `${failure.issue.reasonCode} ${failure.issue.path}`, ok: false, status: 'failed' });
        await persistEntry(mainEntryId, `main-${iteration}-protocol-failed`);
        if (!failure.retry) {
          await persist(iteration, `${failure.issue.reasonCode}:${failure.issue.path}`);
          throw error;
        }
        const rejection = renderWorldSimulationDirectorProtocolRejection_ACU(failure.issue, allowDelegate, toolMode);
        pushFeedback(rejection);
        const retryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'protocol_retry', title: 'Sửa giao thức Agent chính', detail: `${failure.issue.reasonCode} ${failure.issue.path}\nĐoạn mô hình trả về: ${raw.slice(0, 300) || '(rỗng)'}`, agentName: director, ok: false });
        await persistEntry(retryId, `main-${iteration}-protocol-retry`);
        continue;
      }
      updateWorldSimulationSession_ACU(input.identity.chatIdentity, mainEntryId, { title: `Hành động của Agent chính: ${action.kind}`, detail: `Quyết định lượt ${iteration} hoàn tất`, ok: true, status: 'done' });
      await persistEntry(mainEntryId, `main-${iteration}-done`);

      if (action.kind === 'read' || action.kind === 'search' || action.kind === 'tools') {
        const calls = action.kind === 'tools' ? action.calls : [action];
        const toolEntryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, {
          kind: 'tool_read', title: 'Agent chính đang đọc tài liệu',
          detail: calls.map(call => call.kind === 'read' ? `read: ${call.reads.join(', ')}` : `search: ${call.query}`).join('; '),
          agentName: director, status: 'running',
        });
        let perCallResults: Array<Awaited<ReturnType<typeof runWorldSimulationToolBatch_ACU>>>;
        try {
          perCallResults = [];
          for (let index = 0; index < calls.length;) {
            const first = calls[index];
            let end = index + 1;
            if (first.kind === 'read') {
              while (end < calls.length && calls[end].kind === 'read') end += 1;
            }
            const group = calls.slice(index, end);
            const batch = await runWorldSimulationToolBatch_ACU({
              calls: group, registry: input.registry, dependencies: input.tools,
              gate: {
                state: readGateState,
                config: { historyTokenBudget: input.settings.agentHistoryTokenBudget, readTokenBudget: input.settings.agentReadTokenBudget, fallbackTokens: input.settings.agentReadFallbackTokens },
                usage: toolUsage,
                maxReads: input.settings.agentRunBudget.maxReads,
                ...(sent.defaultReadFenceTokens === undefined ? {} : { defaultReadFenceTokens: sent.defaultReadFenceTokens }),
                count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
              },
            });
            let offset = 0;
            for (const call of group) {
              const size = call.kind === 'read' ? call.reads.length : batch.length;
              perCallResults.push(batch.slice(offset, offset + size));
              offset += size;
            }
            index = end;
          }
          const results = perCallResults.flat();
          const toolOk = results.every(result => result.status === 'ok' || result.status === 'empty');
          updateWorldSimulationSession_ACU(input.identity.chatIdentity, toolEntryId, {
            title: toolOk ? `Đọc tài liệu hoàn tất (${results.length} mục)` : 'Đọc tài liệu thất bại một phần',
            detail: results.map(result => `${result.kind}:${result.status} ${result.address} ${result.summary}`).join('; '),
            ok: toolOk, status: toolOk ? 'done' : 'failed',
          });
          await persistEntry(toolEntryId, `tool-${iteration}`);
        } catch (error) {
          updateWorldSimulationSession_ACU(input.identity.chatIdentity, toolEntryId, { title: 'Đọc tài liệu thất bại', detail: compact_ACU(error), ok: false, status: 'failed' });
          await persistEntry(toolEntryId, `tool-${iteration}-failed`);
          throw error;
        }
        if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, perCallResults.map(toolResultText_ACU)));
        // JSON 模式的回执也保留 "kind":"read" 结构，renderWorldSimulationDirectorReads_ACU 依此转交子代理。
        else pushFeedback(`【Kết quả công cụ】\n${toolResultText_ACU(perCallResults.flat())}`);
        pendingReview = null;
        await persist(iteration + 1);
        continue;
      }

      if (action.kind === 'open_round') {
        const workflowEntryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, {
          kind: 'delegation',
          title: 'Quy trình cố định đang thực thi',
          detail: action.focus,
          agentName: director,
          status: 'running',
        });
        let workflow: Awaited<ReturnType<typeof runWorldSimulationWorkflow_ACU>>;
        try {
          workflow = await (input.runWrites?.hasConfirmedWrites ? runWorldSimulationWorkflow_ACU : runWorldSimulationOneShotWorkflow_ACU)({
            identity: input.identity,
            settings: input.settings,
            promptContext: requestContext,
            toolMode,
            registry: input.registry,
            tools: input.tools,
            roundId, readRoundState,
            writeSql: input.writeSql,
            readCurrent: input.readCurrent,
            readFieldSnapshot: input.readFieldSnapshot,
            runWrites: input.runWrites,
            isCurrent: input.isCurrent,
            opening: {
              summary: action.summary,
              focus: action.focus,
              dispatchChronicler: action.dispatchChronicler,
              skipModules: action.skipModules,
            },
            anchorMaterialsCommitted: input.anchorMaterialsCommitted === true,
            targetModules: input.targetModules,
            subagents: this.dependencies.subagents,
            directorMaterials: renderWorldSimulationDirectorReads_ACU(transcript),
            triggeredWorldbook, fixedWorldbook,
          });
        } catch (error) {
          updateWorldSimulationSession_ACU(input.identity.chatIdentity, workflowEntryId, { title: 'Quy trình cố định thất bại', detail: compact_ACU(error), ok: false, status: 'failed' });
          await persistEntry(workflowEntryId, `workflow-${iteration}-failed`);
          throw error;
        }
        for (const outcome of workflow.outcomes) upsertLatestOutcome_ACU(outcomes, outcome);
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, workflowEntryId, {
          title: `Quy trình cố định: ${workflow.outcome}`,
          detail: workflow.summary,
          ok: workflow.outcome !== 'escalate' && workflow.outcome !== 'blocked',
          status: workflow.outcome === 'escalate' || workflow.outcome === 'blocked' ? 'failed' : 'done',
        });
        await persistEntry(workflowEntryId, `workflow-${iteration}`);
        if (workflow.outcome === 'escalate') {
          const workflowFeedback = JSON.stringify({ outcome: 'escalate', pendingFixes: workflow.pendingFixes, agents: workflow.outcomes.map(item => ({ agentName: item.agentName, status: item.status })) });
          pushFeedback(`${workflowFeedback}
${workflow.summary}
Bảo trì tài liệu chưa đạt. Bạn là phiên chính đang trò chuyện với người dùng, cần lập phương án sửa chữa dựa trên phản hồi của agent phụ, đừng dừng ngay: đối chiếu từng module, đường dẫn vi phạm và nguyên nhân trong pendingFixes, những gì sửa được thì delegate cho specialist phụ trách module đó sửa có định hướng, instruction ghi rõ sửa bản ghi nào, cột nào, dựa vào đoạn chính văn nào, không được làm gì (ví dụ mục đã xóa thì không tạo lại). Khi bằng chứng không đủ, cần người dùng quyết định hoặc sửa có định hướng vẫn thất bại thì xuất block, unresolved ghi rõ từng chỗ thiếu và đề xuất. Không open_round lại cùng lô mục cần sửa đã được nâng cấp.`);
          await flushDirectorHistory();
          workflowEscalation = { summary: workflow.summary, pendingFixes: workflow.pendingFixes };
          await persist(iteration + 1, workflow.summary);
          continue;
        }
        // 保存已发生的导演动作及工作流终态，维持锚定历史的成对协议；
        // 此回执只用于审计/恢复，不再发给导演请求二次生成。
        pushFeedback(JSON.stringify({ outcome: workflow.outcome,
          summary: workflow.summary, source: 'fixed-workflow' }));
        await flushDirectorHistory();
        await storage.clearRunState();
        if (workflow.outcome === 'blocked') {
          if (storage.mode === 'host') clearWorldSimulationRunState_ACU(input.identity.chatIdentity);
          const unresolved = workflow.pendingFixes.map(fix => `${fix.module}: ${fix.lastError}`);
          const blockId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'block', title: workflow.summary, detail: unresolved.join('; '), agentName: director, ok: false });
          await persistEntry(blockId, `workflow-${iteration}-blocked`);
          return { outcome: 'blocked', summary: workflow.summary, unresolved, outcomes };
        }
        if (workflow.outcome === 'no_change') {
          return { outcome: 'no_change', summary: workflow.summary, outcomes, finalProjection: workflow.finalProjection };
        }
        if (!workflow.commitCandidate) throw new Error('WORLD_SIMULATION_WORKFLOW_COMMIT_CANDIDATE_REQUIRED');
        return { outcome: 'commit', summary: workflow.summary, commitCandidate: workflow.commitCandidate, outcomes, finalProjection: workflow.finalProjection };
      }

      if (action.kind === 'delegate') {
        const accepted = [] as typeof action.delegations;
        const rejected = [] as Array<{ agentName: string; reason: string }>;
        const runningEntries = new Map<(typeof action.delegations)[number], number>();
        for (const delegation of action.delegations) {
          const definition = findWorldSimulationAgentDefinition_ACU(delegation.agentName);
          const used = perAgent.get(delegation.agentName) ?? 0;
          const allowedKind = definition
            && (definition.kind === 'specialist' || definition.kind === 'researcher');
          const reason = !allowedKind ? `Vai trò ${delegation.agentName} không thể giao việc`
            : delegationsUsed + accepted.length >= input.settings.agentRunBudget.maxDelegations ? `Ngân sách giao việc tổng đã hết (${delegationsUsed + accepted.length}/${input.settings.agentRunBudget.maxDelegations})`
            : used >= input.settings.agentRunBudget.maxSameAgent ? `Ngân sách giao việc cho cùng vai trò đã hết (${used}/${input.settings.agentRunBudget.maxSameAgent})`
            : accepted.length >= input.settings.agentRunBudget.maxConcurrent ? `Ngân sách giao việc song song đã hết (${accepted.length}/${input.settings.agentRunBudget.maxConcurrent})`
            : '';
          // 预算/角色门禁拦截：不调用被拦子代理、不出会话卡片、不记 outcome，原因回灌 transcript。
          if (reason) {
            rejected.push({ agentName: delegation.agentName, reason });
            continue;
          }
          accepted.push(delegation);
          runningEntries.set(delegation, logWorldSimulationSession_ACU(input.identity.chatIdentity, {
            kind: 'delegation', title: `${delegation.agentName} đang làm việc`, detail: delegation.instruction, agentName: delegation.agentName, status: 'running',
          }));
        }
        const budgetUsageText = `Mức dùng hiện tại: tổng giao việc ${delegationsUsed}/${input.settings.agentRunBudget.maxDelegations}${[...perAgent.entries()].map(([name, count]) => `; ${name} ${count}/${input.settings.agentRunBudget.maxSameAgent}`).join('')}`;
        const rejectionText = `Giao việc bị chặn bởi ngưỡng ngân sách (agent phụ bị chặn chưa được gọi):\n${rejected.map(item => `- ${item.agentName}: ${item.reason}`).join('\n')}\n${budgetUsageText}\nHết ngân sách là dừng. Hãy giao cho vai trò còn ngân sách, finalize dựa trên ứng viên hiện có, hoặc xuất block khi bằng chứng không đủ.`;
        if (!accepted.length) {
          pushFeedback(rejectionText);
          return blockOnBudget_ACU(
            iteration,
            'delegation gate exhausted',
            'Giao việc bị chặn bởi ngưỡng ngân sách, không có vai trò nào có thể giao',
            rejectionText,
            rejected.map(item => `${item.agentName}: ${item.reason}`),
            'block-delegation-gate',
          );
        }
        const candidateSeqByAgent = new Map<string, number>();
        for (const item of candidates) {
          candidateSeqByAgent.set(item.agentName, (candidateSeqByAgent.get(item.agentName) ?? 0) + 1);
        }
        const settled = await Promise.all(accepted.map(async delegation => {
          const nextSeq = (candidateSeqByAgent.get(delegation.agentName) ?? 0) + 1;
          candidateSeqByAgent.set(delegation.agentName, nextSeq);
          try {
            return await this.dependencies.subagents.run({
              delegation,
              settings: input.settings,
              promptContext: requestContext,
              toolMode,
              registry: input.registry,
              tools: input.tools,
              writeSql: input.writeSql,
              readCurrent: input.readCurrent,
              readFieldSnapshot: input.readFieldSnapshot,
              isCurrent: input.isCurrent,
              roundId, readRoundState,
              runId: input.identity.runId,
              candidateSeq: nextSeq,
              directorMaterials: renderWorldSimulationDirectorReads_ACU(transcript),
              triggeredWorldbook, fixedWorldbook,
            });
          } catch (error) {
            const issue = compactWorldSimulationProtocolError_ACU(error);
            const reasonCode = issue.reasonCode === 'PROTOCOL_UNKNOWN_ERROR' ? 'WORLD_SIMULATION_SUBAGENT_FAILED' : issue.reasonCode;
            return { agentName: delegation.agentName, status: 'failed' as const, summary: compact_ACU(error), evidenceRefs: [], uncertainties: [], reasonCode };
          }
        }));
        for (let index = 0; index < settled.length; index += 1) {
          const outcome = settled[index];
          if (outcome.candidate) {
            upsertCandidateRevision_ACU(candidates, outcome.candidate);
            const authorized = new Set(snapshotWorldSimulationEvidenceRegistry_ACU(input.registry).entries.flatMap(entry => entry.evidenceRef ? [entry.evidenceRef] : []));
            const report = preflightWorldSimulationCandidates_ACU(currentLedger(), [outcome.candidate], authorized, input.settings);
            if (!report.blocking.length) {
              delegationsUsed += 1;
              perAgent.set(outcome.agentName, (perAgent.get(outcome.agentName) ?? 0) + 1);
            }
          } else {
            delegationsUsed += 1;
            perAgent.set(outcome.agentName, (perAgent.get(outcome.agentName) ?? 0) + 1);
          }
          upsertLatestOutcome_ACU(outcomes, outcome);
          const ok = (outcome.status === 'candidate' || outcome.status === 'no_change') && outcome.completion !== 'failed' && outcome.completion !== 'partial';
          const entryId = runningEntries.get(accepted[index])!;
          updateWorldSimulationSession_ACU(input.identity.chatIdentity, entryId, { title: `${outcome.agentName} ${outcome.status}`, detail: outcome.summary, ok, status: ok ? 'done' : 'failed' });
          await persistEntry(entryId, `delegation-${iteration}-${index + 1}`);
        }
        const delegationFeedback = JSON.stringify(settled.map(item => ({ agentName: item.agentName, status: item.status, summary: item.summary, candidateId: item.candidate?.candidateId,
          unresolvedIssues: item.unresolvedIssues?.map(issue => ({ path: issue.path, message: issue.message })), acceptedKeys: item.acceptedKeys })));
        pushFeedback(rejected.length ? `${delegationFeedback}
${rejectionText}` : delegationFeedback);
        if (iteration < input.settings.agentRunBudget.maxIterations) {
          startPendingReview_ACU();
        }
        await persist(iteration + 1);
        continue;
      }

      if (action.kind === 'block') {
        pushFeedback(JSON.stringify({ outcome: 'blocked', summary: action.reason, unresolved: action.unresolved }));
        await flushDirectorHistory();
        await persist(iteration + 1, action.reason);
        const blockId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'block', title: action.reason, detail: action.unresolved.join('; '), agentName: director, ok: false });
        await persistEntry(blockId, `block-${iteration}`);
        return { outcome: 'blocked', summary: action.reason, unresolved: action.unresolved, outcomes };
      }


      if (action.outcome === 'no_change') {
        const insufficient = !action.evidenceRefs.length || !outcomes.length || outcomes.some(item => item.status !== 'no_change') || candidates.length > 0;
        if (insufficient) {
          await persist(iteration + 1, 'no_change thiếu bằng chứng đầy đủ hoặc tồn tại ứng viên/kết quả thất bại');
          pushFeedback('no_change chưa đạt ngưỡng: phải có bằng chứng được ủy quyền, và mọi kết quả giao việc hiện có đều là no_change, không được tồn tại ứng viên, thất bại hoặc blocked. Hãy tiếp tục thu thập bằng chứng hoặc xuất blocked.');
          continue;
        }
        pushFeedback(JSON.stringify({ outcome: 'prepared_no_change', summary: action.summary }));
        await flushDirectorHistory();
        await storage.clearRunState();
        return { outcome: 'no_change', summary: action.summary, outcomes };
      }

      const available = uniqueCandidates_ACU(candidates);
      if (outcomes.some(item => item.completion === 'failed' && (item.acceptedKeys?.length || item.unresolvedIssues?.length))) {
        const unresolved = outcomes.flatMap(item => item.completion === 'failed'
          ? (item.unresolvedIssues ?? []).map(issue => `${issue.path}: ${issue.message}`) : []);
        await persist(iteration + 1, 'Bảo trì theo từng cột vẫn còn chỗ thiếu chưa giải quyết');
        pushFeedback(`Ghi theo từng cột chưa đạt: ${unresolved.join('; ')}. Không thể nộp thành công; hãy sửa rồi hoàn tất, hoặc xuất blocked.`);
        continue;
      }
      if (!available.length && input.runWrites?.hasConfirmedWrites) {
        input.runWrites.assertCurrent();
        pushFeedback(JSON.stringify({ outcome: 'prepared', summary: action.summary, confirmedWrites: input.runWrites.confirmedWrites }));
        await flushDirectorHistory();
        await storage.clearRunState();
        const commitCandidate = { runId: input.identity.runId, taskId: input.identity.taskId, stageId: input.identity.stageId,
          stageRevision: input.identity.stageRevision, baseLedgerRevision: input.identity.baseLedgerRevision,
          summary: action.summary, acceptedCandidates: [] as WorldSimulationCandidate_ACU[], evidenceRefs: [...new Set([...action.evidenceRefs, ...input.runWrites.evidenceRefs])],
          collisionReport: input.promptContext.worldCollisions as WorldCollisionReport_ACU };
        return { outcome: 'commit', summary: action.summary, commitCandidate, outcomes };
      }
      if (!available.length) {
        await persist(iteration + 1, 'commit thiếu ứng viên');
        pushFeedback('commit không có ứng viên để rà soát. Hãy tiếp tục giao việc, hoặc xuất blocked khi bằng chứng không đủ.');
        continue;
      }
      try {
        input.runWrites?.assertCandidatesDisjoint(available);
      } catch (error) {
        const message = compact_ACU(error);
        pendingReview = null;
        await persist(iteration + 1, message);
        pushFeedback(`${message}: ứng viên ghi đè các lần ghi theo từng cột đã được xác nhận trong lần chạy này. Không được nộp lặp; hãy sửa lại để chỉ chứa tập ghi chưa lưu xuống.`);
        continue;
      }
      let reviewer;
      const reviewFingerprint = candidateReviewFingerprint_ACU(available);
      const reviewerEntryId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'delegation', title: 'Rà soát nhân quả đang làm việc', detail: `Đang rà soát tính toàn vẹn về thời gian, nhân quả, quyền hạn và bằng chứng của ${available.length} ứng viên`, agentName: 'causality-reviewer', status: 'running' });
      try {
        reviewer = pendingReview?.fingerprint === reviewFingerprint
          ? await pendingReview.promise
          : await this.dependencies.subagents.runReviewer({ candidates: available, settings: input.settings, toolMode, promptContext: requestContext, registry: input.registry, tools: input.tools, roundId, readRoundState, isCurrent: input.isCurrent, directorMaterials: renderWorldSimulationDirectorReads_ACU(transcript), triggeredWorldbook, fixedWorldbook });
        pendingReview = null;
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, reviewerEntryId, { title: `Rà soát nhân quả: ${reviewer.verdict}`, detail: reviewer.summary, ok: reviewer.verdict !== 'reject', status: reviewer.verdict === 'reject' ? 'failed' : 'done' });
        await persistEntry(reviewerEntryId, `causality-review-${iteration}`);
      } catch (error) {
        pendingReview = null;
        updateWorldSimulationSession_ACU(input.identity.chatIdentity, reviewerEntryId, { title: 'Rà soát nhân quả thất bại', detail: compact_ACU(error), ok: false, status: 'failed' });
        await persistEntry(reviewerEntryId, `causality-review-${iteration}-failed`);
        await persist(iteration + 1, compact_ACU(error));
        pushFeedback(`reviewer chưa hoàn tất: ${compact_ACU(error)}. Hãy tiếp tục sửa ứng viên hoặc xuất blocked.`);
        continue;
      }
      const acceptedIds = new Set(reviewer.acceptedCandidateIds);
      const acceptedCandidates = available.filter(item => acceptedIds.has(item.candidateId));
      const blockingFindings = reviewer.findings.filter(item => item.severity === 'blocking');
      if (reviewer.verdict !== 'accept' || !acceptedCandidates.length || blockingFindings.length) {
        await persist(iteration + 1, reviewer.summary);
        const findings = reviewer.findings.filter(item => item.severity !== 'minor');
        const feedback = findings.length
          ? findings.map(item => `${item.severity}:${item.reasonCode}:${item.path}; kỳ vọng=${item.expected}; thực tế=${String(item.actual)}`).join('\n')
          : 'reviewer không chấp nhận ứng viên nào';
        pushFeedback(`reviewer bác bỏ hoặc yêu cầu sửa ứng viên: ${reviewer.summary}\n${feedback}\nHãy giao việc lại để sửa ứng viên theo ý kiến rà soát; không coi lần bác bỏ này là kết cục của nhiệm vụ. Chỉ khi thực sự không thể bổ sung bằng chứng hoặc sửa được mới xuất blocked.`);
        continue;
      }
      const causalEvidenceRefs = [...new Set([...action.evidenceRefs, ...acceptedCandidates.flatMap(item => item.evidenceRefs)])];
      const anchorMessage = typeof input.promptContext.anchorMessage === 'string' ? input.promptContext.anchorMessage : '';
      const baseLedger = currentLedger();
      try {
        input.runWrites?.assertCandidatesDisjoint(acceptedCandidates);
      } catch (error) {
        const message = compact_ACU(error);
        pendingReview = null;
        await persist(iteration + 1, message);
        pushFeedback(`${message}: ứng viên ghi đè các lần ghi theo từng cột đã được xác nhận trong lần chạy này. Không được nộp lặp; hãy sửa lại để chỉ chứa tập ghi chưa lưu xuống.`);
        continue;
      }
      let finalCandidates = acceptedCandidates;
      const preview = await applyWorldSimulationCandidatesDetailedViaSql_ACU(baseLedger, acceptedCandidates, new Set(causalEvidenceRefs), input.settings, { anchorMessage });
      if (!preview.appliedModules.length) {
        const message = preview.pendingFixes.map(item => item.lastError).join('; ') || 'Không có module nào được nhập kho';
        await persist(iteration + 1, message);
        const failedId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'main_action', title: 'Áp dụng giao dịch ứng viên thất bại, chờ sửa đổi', detail: message, agentName: director, ok: false, status: 'failed' });
        await persistEntry(failedId, `candidate-transaction-failed-${iteration}`);
        pushFeedback(`Ứng viên đã chấp nhận thất bại ở giai đoạn áp dụng giao dịch sổ cái: ${message}\nHãy coi lỗi này là ràng buộc sửa đổi và giao việc lại. Nếu là xung đột revision, phải dựa trên revision sổ cái hiện tại để dựng lại các mục bị ảnh hưởng; nếu thiếu trường, phải bổ sung một lần toàn bộ trường bắt buộc cần lưu trữ của module đó. Mẫu trường bắt buộc đầy đủ: ${formatWorldSimulationLedgerRequiredFieldsVi_ACU()}. Không coi lần giao dịch thất bại này là kết cục của nhiệm vụ, chỉ khi thực sự không thể sửa được mới xuất blocked.`);
        continue;
      }
      finalCandidates = acceptedCandidates;
      try {
        const commitEvidenceRefs = [...new Set([...causalEvidenceRefs, ...finalCandidates.flatMap(item => item.evidenceRefs)])];
        input.runWrites?.assertCurrent();
        pushFeedback(JSON.stringify({ outcome: 'prepared', summary: action.summary, acceptedCandidates: finalCandidates.map(item => ({ candidateId: item.candidateId, agentName: item.agentName })) }));
        await flushDirectorHistory();
        await storage.clearRunState();
        const commitCandidate = { runId: input.identity.runId, taskId: input.identity.taskId, stageId: input.identity.stageId, stageRevision: input.identity.stageRevision, baseLedgerRevision: input.identity.baseLedgerRevision, summary: action.summary, acceptedCandidates: finalCandidates, evidenceRefs: commitEvidenceRefs, reviewer, collisionReport: input.promptContext.worldCollisions as WorldCollisionReport_ACU };
        return { outcome: 'commit', summary: action.summary, commitCandidate, outcomes };
      } catch (error) {
        const message = compact_ACU(error);
        await persist(iteration + 1, message);
        const failedId = logWorldSimulationSession_ACU(input.identity.chatIdentity, { kind: 'main_action', title: 'Áp dụng giao dịch ứng viên thất bại, chờ sửa đổi', detail: message, agentName: director, ok: false, status: 'failed' });
        await persistEntry(failedId, `candidate-transaction-failed-${iteration}`);
        pushFeedback(`Ứng viên đã chấp nhận thất bại ở giai đoạn áp dụng giao dịch sổ cái: ${message}\nHãy coi lỗi này là ràng buộc sửa đổi và giao việc lại. Nếu là xung đột revision, phải dựa trên revision sổ cái hiện tại để dựng lại các mục bị ảnh hưởng; nếu thiếu trường, phải bổ sung một lần toàn bộ trường bắt buộc cần lưu trữ của module đó. Mẫu trường bắt buộc đầy đủ: ${formatWorldSimulationLedgerRequiredFieldsVi_ACU()}. Không coi lần giao dịch thất bại này là kết cục của nhiệm vụ, chỉ khi thực sự không thể sửa được mới xuất blocked.`);
        continue;
      }
    }

    return blockOnBudget_ACU(
      input.settings.agentRunBudget.maxIterations,
      'iteration budget exhausted',
      'Ngân sách lặp của vòng lặp chính mô phỏng thế giới đã hết',
      `maxIterations=${input.settings.agentRunBudget.maxIterations}`,
      ['iteration budget exhausted'],
      'block-iteration-budget',
    );
  }
}
