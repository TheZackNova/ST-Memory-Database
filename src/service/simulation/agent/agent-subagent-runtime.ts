import { USER_PREFILL_CONTENT_ACU } from '../../../shared/user-prefill.js';
import { assembleAgentPrompt_ACU } from '../../../shared/agent-prompt-layout';
import { isAgentFormatAnswer_ACU } from '../../../shared/agent-prompt-qa';
export { worldSimulationOneShotProtocol_ACU } from './agent-format-protocol';
import { WORLD_CHRONICLE_HOT_WINDOW_ACU } from '../model';
import type {
  WorldSimulationLedger_ACU,
  WorldSimulationLedgerFieldSnapshot_ACU,
  WorldSimulationLedgerModule_ACU,
  WorldSimulationPendingFixSource_ACU,
  WorldSimulationSettings_ACU,
} from '../model';
import { resolveWorldSimulationAgentApiPreset_ACU, type WorldSimulationApiPresetDependencies_ACU, type WorldSimulationResolvedApiPreset_ACU } from '../api-preset';
import { stripWritingAnnotations_ACU } from '../simulation-projection';
import { preflightWorldSimulationCandidates_ACU } from '../simulation-transaction';
import { buildInUseWorldCatalog_ACU, worldLedgerRowsForAgent_ACU } from '../world-catalog';
import type { WorldSimulationEvidenceRegistry_ACU, WorldSimulationEvidenceRegistrySnapshot_ACU } from '../world-simulation-evidence-registry';
import { snapshotWorldSimulationEvidenceRegistry_ACU } from '../world-simulation-evidence-registry';
import { formatWorldSimulationToolAddressHints_ACU, runWorldSimulationToolBatch_ACU, type WorldSimulationReadRoundState_ACU, type WorldSimulationToolDependencies_ACU } from '../world-simulation-agent-tools';
import type { WorldSimulationFieldCommitReceipt_ACU } from '../simulation-field-commit-adapter';
import { findWorldSimulationAgentDefinition_ACU, getWorldSimulationAgentAccessProfile_ACU, worldSimulationAgentNativeTools_ACU, worldSimulationCanReadAddress_ACU, type WorldSimulationAgentName_ACU } from './agent-catalog';
import { buildV20WorldSimulationAgentPrompt_ACU } from './agent-defaults';
import { WORLD_SIMULATION_AGENT_PREFILLS_ACU, renderWorldSimulationWriteRepair_ACU, worldSimulationReviewerRuntimeProtocolInstruction_ACU, worldSimulationSpecialistRuntimeProtocolInstruction_ACU, type WorldSimulationOneShotRole_ACU } from './agent-defaults';
import type {
  WorldSimulationCandidate_ACU,
  WorldSimulationDelegation_ACU,
  WorldSimulationReviewerResult_ACU,
  WorldSimulationSpecialistResult_ACU,
  WorldSimulationSubagentIssue_ACU,
  WorldSimulationSubagentOutcome_ACU,
} from './agent-model';
import { createWorldSimulationPlaceholderResolvers_ACU, isWorldSimulationLedgerContext_ACU, type WorldSimulationPlaceholderContext_ACU } from './agent-placeholder-resolver';
import { createWorldSimulationProtocolRepairState_ACU, normalizeOneShotSpecialistPayload_ACU, worldSimulationSqlWritableColumns_ACU, parseWorldSimulationSubagentToolCalls_ACU, parseWorldSimulationJsonDraft_ACU, parseWorldSimulationJsonPayload_ACU, parseWorldSimulationMainAction_ACU, parseWorldSimulationMainOutput_ACU, parseWorldSimulationReviewerResult_ACU, parseWorldSimulationSpecialistResult_ACU, recordWorldSimulationProtocolFailure_ACU, renderWorldSimulationReviewerProtocolRejection_ACU, renderWorldSimulationSpecialistProtocolRejection_ACU } from './agent-protocol';
import { createWorldSimulationReadGateState_ACU, resolveWorldSimulationReadBudget_ACU } from './agent-read-gate';
import { logWorldSimulationSession_ACU, updateWorldSimulationSession_ACU } from './agent-session-log';
import { executeWorldSimulationFinalRequest_ACU } from './final-request-token-gate';
import { renderWorldSimulationPrompt_ACU } from './prompt-template';
import { renderWorldSimulationSnapshotSections_ACU, splitWorldSimulationSubagentPrompt_ACU, verifyWorldSimulationSnapshotSections_ACU, verifyWorldSimulationFixedWorldbook_ACU, type WorldSimulationFixedWorldbook_ACU } from './agent-shared-materials';
import { countWorldSimulationTokens_ACU, type WorldSimulationTokenCounter_ACU } from './agent-token-budget';
import { agentNativeTools_ACU, nativeToolArguments_ACU, nativeToolExchange_ACU, normalizeAgentModelReply_ACU, withJsonTailPrefill_ACU, withNativeToolThinkPrefill_ACU, type AiChatTurn_ACU, type AiNativeToolCall_ACU, type AiNativeToolDefinition_ACU, type AiWireMessage_ACU } from '../../ai/native-tool';
import { resolveAgentToolMode_ACU, type AgentToolMode_ACU } from '../../ai/agent-tool-mode';
import { adaptWorldSimulationPromptSegmentsToToolMode_ACU, worldSimulationProtocolForMode_ACU } from './agent-prompt-mode';
import { AGENT_SUBMIT_TOOL_NAME_ACU, splitNativeDecisionCalls_ACU, submitPayloadObject_ACU, worldSimulationOneShotSubmitTool_ACU, worldSimulationReviewerSubmitTool_ACU, worldSimulationSpecialistSubmitTool_ACU } from '../../ai/agent-decision-tools';

/** 一次推演请求的工具声明：tools 进请求体，cacheTools 进缓存键；json 模式 tools 为空、cacheTools 为 mode:json。 */
export interface WorldSimulationInvokeTools_ACU { tools: readonly AiNativeToolDefinition_ACU[]; cacheTools: readonly string[]; }
export interface WorldSimulationAgentInvoker_ACU { (agentName: WorldSimulationAgentName_ACU, messages: readonly { role: string; content: string }[], preset: WorldSimulationResolvedApiPreset_ACU, request?: WorldSimulationInvokeTools_ACU): Promise<string | AiChatTurn_ACU>; }

/** 按模式给出请求工具：tools 模式携带函数，json 模式请求体不带 tools。 */
export function worldSimulationInvokeTools_ACU(mode: AgentToolMode_ACU, tools: readonly AiNativeToolDefinition_ACU[]): WorldSimulationInvokeTools_ACU {
  return mode === 'tools'
    ? { tools, cacheTools: tools.map(tool => tool.function.name) }
    : { tools: [], cacheTools: ['mode:json'] };
}

/**
 * 工具模式原样保留提示词；JSON 模式仅投影工具历史，不注入额外预填充。
 */
export function finishWorldSimulationMessages_ACU<T extends { role: string; content: string }>(mode: AgentToolMode_ACU, messages: readonly T[], jsonPrefill?: string): T[] {
  if (mode === 'tools') return withNativeToolThinkPrefill_ACU(messages as never) as T[];
  return withJsonTailPrefill_ACU(messages as never) as T[];
}

export function resolveWorldSimulationToolMode_ACU(preset: WorldSimulationResolvedApiPreset_ACU): AgentToolMode_ACU {
  return resolveAgentToolMode_ACU('worldSimulation', preset as never);
}
export interface WorldSimulationSubagentRuntimeDependencies_ACU { invoke: WorldSimulationAgentInvoker_ACU; countTokens?: WorldSimulationTokenCounter_ACU; apiPreset?: WorldSimulationApiPresetDependencies_ACU; protocolRetries?: number; }
export interface WorldSimulationSubagentRunInput_ACU {
  delegation: WorldSimulationDelegation_ACU;
  settings: WorldSimulationSettings_ACU;
  toolMode?: AgentToolMode_ACU;
  promptContext: WorldSimulationPlaceholderContext_ACU;
  registry: WorldSimulationEvidenceRegistry_ACU;
  tools: WorldSimulationToolDependencies_ACU;
  runId: string;
  roundId?: string;
  readRoundState?: WorldSimulationReadRoundState_ACU;
  candidateSeq?: number;
  writableModules?: readonly WorldSimulationLedgerModule_ACU[];
  writeSql?: (input: { role: string; sql: string; evidenceRegistry: WorldSimulationEvidenceRegistrySnapshot_ACU; declaredEvidenceRefs: readonly string[]; allowedModules: readonly WorldSimulationLedgerModule_ACU[]; isCurrent?: () => boolean }) => Promise<WorldSimulationFieldCommitReceipt_ACU>;
  readCurrent?: () => WorldSimulationLedger_ACU;
  readFieldSnapshot?: () => WorldSimulationLedgerFieldSnapshot_ACU;
  isCurrent?: () => boolean;
  /** 主会话快照里未单独注入的部分，以及主会话已经读到的全文。 */
  directorMaterials?: string;
  /** 本轮关键词已触发的世界书全文。导演与各子代理共用，不再自行精读条目。 */
  triggeredWorldbook?: string;
  fixedWorldbook?: WorldSimulationFixedWorldbook_ACU;
}
export interface WorldSimulationReviewInput_ACU { candidates: readonly WorldSimulationCandidate_ACU[]; settings: WorldSimulationSettings_ACU; toolMode?: AgentToolMode_ACU; promptContext: WorldSimulationPlaceholderContext_ACU; registry: WorldSimulationEvidenceRegistry_ACU; tools: WorldSimulationToolDependencies_ACU; isCurrent?: () => boolean; roundId?: string; readRoundState?: WorldSimulationReadRoundState_ACU; directorMaterials?: string; triggeredWorldbook?: string; fixedWorldbook?: WorldSimulationFixedWorldbook_ACU; }

export interface WorldSimulationOneShotInput_ACU {
  agentName: WorldSimulationOneShotRole_ACU;
  settings: WorldSimulationSettings_ACU;
  toolMode?: AgentToolMode_ACU;
  promptContext: WorldSimulationPlaceholderContext_ACU;
  registry: WorldSimulationEvidenceRegistry_ACU;
  tools: WorldSimulationToolDependencies_ACU;
  runId: string;
  candidateSeq: number;
  focus: string;
  anchorEvidenceRef: string;
  givenLedger: WorldSimulationLedger_ACU;
  baseLedgerRevision: number;
  /** 工作流从同一锚点一次计算的本轮明确经过天数；并发角色共享，不由角色间推断传播。 */
  elapsedDays?: number;
  roundChanges?: string;
  injectWorldbook: boolean;
  triggeredWorldbook?: string;
  fixedWorldbook?: WorldSimulationFixedWorldbook_ACU;
  isCurrent?: () => boolean;
  /**
   * 会话流分区。与智能续写主循环同一做法：子代理的读取与被拒提交也要进会话流，
   * 否则用户只看到派工卡片，看不到这一轮实际读了什么、提交了什么、被拒在哪。
   */
  sessionChatIdentity?: string;
}


function candidate_ACU(
  result: Extract<WorldSimulationSpecialistResult_ACU, { status: 'candidate' }>,
  writableModules: readonly string[],
  runId: string,
  candidateSeq: number,
): WorldSimulationCandidate_ACU {
  const keys = Object.keys(result.patch);
  const denied = keys.filter(key => key === 'chronicleArchive' ? !writableModules.includes('chronicle') : !writableModules.includes(key));
  if (denied.length) throw new Error(`WORLD_SIMULATION_PATCH_SCOPE_DENIED:${denied.join(',')}`);
  const candidateId = `${runId}:${result.agentName}:${candidateSeq}`;
  return { candidateId, agentName: result.agentName, patch: result.patch, summary: result.summary, evidenceRefs: result.evidenceRefs, uncertainties: result.uncertainties, writableModules: [...writableModules] };
}


function withTask_ACU(
  context: WorldSimulationPlaceholderContext_ACU,
  task: unknown,
  candidates?: readonly WorldSimulationCandidate_ACU[],
  writableModules?: readonly string[],
): WorldSimulationPlaceholderContext_ACU {
  return {
    ...context,
    task,
    worldCandidates: candidates ?? context.worldCandidates,
    evidenceRegistry: context.evidenceRegistry,
    candidateView: candidates ? 'full' : context.candidateView,
    writableModules: writableModules ?? context.writableModules,
  };
}

function bindSpecialistIdentity_ACU(payload: Record<string, unknown>, agentName: WorldSimulationAgentName_ACU): Record<string, unknown> {
  const supplied = typeof payload.agentName === 'string' ? payload.agentName.trim() : '';
  return supplied ? payload : { ...payload, agentName };
}

const ITEM_PATCH_MODULES_ACU = new Set<WorldSimulationLedgerModule_ACU>(['dimensions', 'seeds', 'actors', 'rumors']);

function patchModule_ACU(key: string): WorldSimulationLedgerModule_ACU | null {
  if (key === 'chronicleArchive') return 'chronicle';
  return ['clock', 'dimensions', 'seeds', 'actors', 'chronicle', 'guidance', 'rumors', 'player'].includes(key)
    ? key as WorldSimulationLedgerModule_ACU
    : null;
}

function protocolPath_ACU(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const wrapped = error as { error?: { details?: Record<string, unknown> } };
  return typeof wrapped.error?.details?.path === 'string' ? wrapped.error.details.path : fallback;
}

function issue_ACU(
  module: WorldSimulationLedgerModule_ACU,
  source: WorldSimulationPendingFixSource_ACU,
  error: unknown,
  fallbackPath: string,
  id?: string,
): WorldSimulationSubagentIssue_ACU {
  return {
    module,
    source,
    path: protocolPath_ACU(error, fallbackPath),
    message: error instanceof Error ? error.message : String(error),
    ...(id ? { id } : {}),
  };
}

function acceptedPatchKeys_ACU(patch: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [rawModule, value] of Object.entries(patch)) {
    const module = patchModule_ACU(rawModule);
    if (!module) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const items = [...(Array.isArray(record.upsert) ? record.upsert : []), ...(Array.isArray(record.append) ? record.append : []), ...(Array.isArray(record.remove) ? record.remove : [])];
      if (items.length) {
        items.forEach((item, index) => {
          const id = item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === 'string'
            ? String((item as Record<string, unknown>).id).trim()
            : '';
          keys.push(`${module}:${id || `index:${index}`}`);
        });
        continue;
      }
    }
    keys.push(`${module}:$`);
  }
  return keys;
}

function outcomeFromSpecialistResult_ACU(
  result: WorldSimulationSpecialistResult_ACU,
  writableModules: readonly WorldSimulationLedgerModule_ACU[],
  runId: string,
  candidateSeq: number,
  truncated: boolean,
): WorldSimulationSubagentOutcome_ACU {
  const moduleCompletion: WorldSimulationSubagentOutcome_ACU['moduleCompletion'] = {};
  const unresolvedIssues: WorldSimulationSubagentIssue_ACU[] = [];
  if (result.status === 'candidate') {
    const candidate = candidate_ACU(result, writableModules, runId, candidateSeq);
    const acceptedKeys = acceptedPatchKeys_ACU(result.patch);
    for (const module of writableModules) {
      const changed = Object.keys(result.patch).some(key => patchModule_ACU(key) === module);
      moduleCompletion[module] = truncated ? (changed ? 'partial' : 'failed') : (changed ? 'complete_changed' : 'complete_no_change');
      if (truncated) unresolvedIssues.push({ module, source: 'truncated', path: `$.patch.${module}`, message: 'JSON của specialist bị cắt giữa chừng khi xuất, tập ghi ở phần đuôi chưa được xác nhận đầy đủ' });
    }
    return {
      agentName: result.agentName,
      status: 'candidate',
      summary: result.summary,
      candidate,
      evidenceRefs: result.evidenceRefs,
      uncertainties: result.uncertainties,
      completion: truncated ? 'partial' : 'complete_changed',
      moduleCompletion,
      unresolvedIssues,
      acceptedKeys,
    };
  }
  if (result.status === 'no_change') {
    for (const module of writableModules) {
      moduleCompletion[module] = truncated ? 'failed' : 'complete_no_change';
      if (truncated) unresolvedIssues.push({ module, source: 'truncated', path: module, message: 'Đầu ra no_change bị cắt, không thể dựa vào đó để xác nhận module đã đầy đủ' });
    }
    return { agentName: result.agentName, status: result.status, summary: result.summary, evidenceRefs: result.evidenceRefs, uncertainties: result.uncertainties, completion: truncated ? 'failed' : 'complete_no_change', moduleCompletion, unresolvedIssues, acceptedKeys: [] };
  }
  for (const module of writableModules) moduleCompletion[module] = 'failed';
  const message = result.status === 'blocked' ? result.unresolved.join('; ') : result.message;
  const source: WorldSimulationPendingFixSource_ACU = 'protocol_failed';
  for (const module of writableModules) unresolvedIssues.push({ module, source, path: module, message });
  return result.status === 'blocked'
    ? { agentName: result.agentName, status: result.status, summary: 'blocked', evidenceRefs: [], uncertainties: [], unresolved: result.unresolved, completion: 'failed', moduleCompletion, unresolvedIssues, acceptedKeys: [] }
    : { agentName: result.agentName, status: result.status, summary: result.message, evidenceRefs: [], uncertainties: [], reasonCode: result.reasonCode, completion: 'failed', moduleCompletion, unresolvedIssues, acceptedKeys: [] };
}

export function salvageCandidateOutcome_ACU(
  payload: Record<string, unknown>,
  writableModules: readonly WorldSimulationLedgerModule_ACU[],
  snapshot: WorldSimulationEvidenceRegistrySnapshot_ACU,
  runId: string,
  candidateSeq: number,
  truncated: boolean,
): WorldSimulationSubagentOutcome_ACU {
  const patch = payload.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('WORLD_SIMULATION_SPECIALIST_PATCH_REQUIRED');
  const acceptedPatch: Record<string, unknown> = {};
  const issues: WorldSimulationSubagentIssue_ACU[] = [];
  for (const [rawModule, rawPatch] of Object.entries(patch as Record<string, unknown>)) {
    const module = patchModule_ACU(rawModule);
    if (!module || !writableModules.includes(module)) {
      for (const target of writableModules) issues.push({ module: target, source: 'contract_rejected', path: `$.patch.${rawModule}`, message: `Agent không có quyền ghi vào module ${rawModule}` });
      continue;
    }
    const base = { ...payload, patch: { [rawModule]: rawPatch } };
    if (ITEM_PATCH_MODULES_ACU.has(module) && rawPatch && typeof rawPatch === 'object' && !Array.isArray(rawPatch) && (Array.isArray((rawPatch as Record<string, unknown>).upsert) || Array.isArray((rawPatch as Record<string, unknown>).remove))) {
      const record = rawPatch as Record<string, unknown>;
      const acceptedItems: Record<string, unknown[]> = {};
      for (const kind of ['upsert', 'remove'] as const) {
        if (!Array.isArray(record[kind])) continue;
        const accepted: unknown[] = [];
        (record[kind] as unknown[]).forEach((item, index) => {
          const id = item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === 'string' ? String((item as Record<string, unknown>).id).trim() : '';
          try {
            parseWorldSimulationSpecialistResult_ACU({ ...payload, patch: { [rawModule]: { [kind]: [item] } } }, snapshot);
            accepted.push(item);
          } catch (error) {
            issues.push(issue_ACU(module, 'contract_rejected', error, `$.patch.${rawModule}.${kind}[${index}]`, id));
          }
        });
        if (accepted.length) acceptedItems[kind] = accepted;
      }
      const extra = Object.keys(record).filter(key => key !== 'upsert' && key !== 'remove');
      if (extra.length) issues.push({ module, source: 'contract_rejected', path: `$.patch.${rawModule}.${extra[0]}`, message: `Patch của module chứa trường chưa được ủy quyền: ${extra.join(',')}` });
      if (Object.keys(acceptedItems).length) acceptedPatch[rawModule] = acceptedItems;
      continue;
    }
    try {
      const parsed = parseWorldSimulationSpecialistResult_ACU(base, snapshot);
      if (parsed.status === 'candidate') acceptedPatch[rawModule] = parsed.patch[rawModule];
    } catch (error) {
      issues.push(issue_ACU(module, 'contract_rejected', error, `$.patch.${rawModule}`));
    }
  }
  if (truncated) {
    for (const module of writableModules) issues.push({ module, source: 'truncated', path: `$.patch.${module}`, message: 'JSON của specialist bị cắt giữa chừng khi xuất, tập ghi ở phần đuôi chưa được xác nhận đầy đủ' });
  }
  if (!Object.keys(acceptedPatch).length && !issues.length) throw new Error('WORLD_SIMULATION_SPECIALIST_PATCH_EMPTY');
  const result = parseWorldSimulationSpecialistResult_ACU({ ...payload, patch: acceptedPatch }, snapshot) as Extract<WorldSimulationSpecialistResult_ACU, { status: 'candidate' }>;
  const candidate = candidate_ACU(result, writableModules, runId, candidateSeq);
  const acceptedKeys = acceptedPatchKeys_ACU(acceptedPatch);
  const issueModules = new Set(issues.map(item => item.module));
  const moduleCompletion: WorldSimulationSubagentOutcome_ACU['moduleCompletion'] = {};
  for (const module of writableModules) {
    const changed = Object.keys(acceptedPatch).some(key => patchModule_ACU(key) === module);
    moduleCompletion[module] = issueModules.has(module) ? (changed ? 'partial' : 'failed') : (changed ? 'complete_changed' : 'complete_no_change');
  }
  return { agentName: result.agentName, status: 'candidate', summary: result.summary, candidate, evidenceRefs: result.evidenceRefs, uncertainties: result.uncertainties, completion: issues.length ? 'partial' : 'complete_changed', moduleCompletion, unresolvedIssues: issues, acceptedKeys };
}

function toolCalls_ACU(raw: string, prefill: string, snapshot: WorldSimulationEvidenceRegistrySnapshot_ACU) {
  try {
    const action = parseWorldSimulationMainOutput_ACU(raw, prefill, false, snapshot);
    if (action.kind === 'read' || action.kind === 'search') return [action];
    if (action.kind === 'tools') return action.calls;
  } catch { /* specialist/reviewer output is not a tool action */ }
  return null;
}

/** 拒绝路径是诊断，不是任意可读地址；未知恢复状态不据此推导当前 ID。 */
function rejectedFieldReadAddresses_ACU(receipt: WorldSimulationFieldCommitReceipt_ACU): string[] {
  if (receipt.partials === null || receipt.ledgerRevision === null) return [];
  return receipt.rejected.flatMap(({ path }) => {
    const match = /^(clock|dimensions|seeds|actors|player|rumors|chronicle|guidance)#([A-Za-z0-9_-]{1,128})(?:\.[A-Za-z][A-Za-z0-9]*|$)$/.exec(path);
    return match && (match[2] !== '_' || ['clock', 'player', 'guidance'].includes(match[1]))
      ? [`field:${match[1]}:${match[2]}`] : [];
  });
}

function toolText_ACU(results: Awaited<ReturnType<typeof runWorldSimulationToolBatch_ACU>>): string {
  return JSON.stringify(results.map(item => ({ kind: item.kind, address: item.address, status: item.status, summary: item.summary, evidenceRef: item.evidenceRef, content: item.content })));
}

type OneShotAction_ACU = { name: string; args: Record<string, unknown>; read?: Extract<ReturnType<typeof parseWorldSimulationMainAction_ACU>, { kind: 'read' }> };

/** json 模式的一次性动作：只把 read 与 write_sql 的 JSON 对象识别为动作；其它文本返回 null，交给终态行判断。 */
function oneShotJsonActions_ACU(raw: string, snapshot: WorldSimulationEvidenceRegistrySnapshot_ACU): OneShotAction_ACU[] | null {
  const calls = parseWorldSimulationSubagentToolCalls_ACU(raw, '', snapshot, true);
  return calls ? calls.map((call): OneShotAction_ACU => call.kind === 'write_sql'
    ? { name: 'write_sql', args: { action: 'write_sql', sql: call.sql } }
    : { name: call.kind, args: { action: call.kind }, ...(call.kind === 'read' ? { read: call } : {}) }) : null;
}




/** 角色可写模块展开为 SQL 表；编年同时开放成对归档表。 */
function oneShotTables_ACU(modules: readonly WorldSimulationLedgerModule_ACU[]): string[] {
  return modules.flatMap(module => module === 'chronicle' ? ['chronicle', 'chronicle_archive', 'chronicle_overview'] : [module]);
}

/**
 * 首轮与空模块标记：空账本时子代理容易把“没有旧条目可改”当成无变化。
 * 这里只陈述事实，建账要求在提示词【首轮建账】里。
 */
export function oneShotBootstrapNotice_ACU(baseRevision: number, modules: readonly WorldSimulationLedgerModule_ACU[], ledger: WorldSimulationLedger_ACU): string[] {
  const empty = modules.filter(module => Array.isArray(ledger[module]) && !(ledger[module] as unknown[]).length);
  if (baseRevision === 0) return [`【Dựng sổ cái đợt đầu】Sổ cái chưa được lập (số sửa đổi cơ sở 0). Theo phần 【Dựng sổ cái đợt đầu】 của prompt, hãy dựa vào Sổ thế giới và neo để lập các mục ban đầu cho module bạn phụ trách; bảng rỗng không phải lý do để coi là không đổi.${empty.length ? ` Các module phụ trách hiện đang rỗng: ${empty.join(', ')}.` : ''}`];
  if (empty.length) return [`【Module rỗng】${empty.join(', ')} mà bạn phụ trách hiện đang rỗng. Theo phần 【Dựng sổ cái đợt đầu】 của prompt, hãy kiểm tra xem Sổ thế giới và neo có thể dùng để lập hồ sơ không; bảng rỗng không phải lý do để coi là không đổi.`];
  return [];
}

/**
 * 建账轮的覆盖检查。参考智能续写的 missingFields 回执：只写了其中一个模块就交付时，
 * 要明确点出仍然空着的模块再要一轮，而不是把「只写了 clock」当成整批完成。
 * 只看本来为空的数组模块；clock/player/guidance 是单例，没有「建档」语义。
 */
const ONE_SHOT_BOOTSTRAP_MODULES_ACU: readonly WorldSimulationLedgerModule_ACU[] = ['dimensions', 'seeds', 'actors'];

export function oneShotUncoveredModules_ACU(
  modules: readonly WorldSimulationLedgerModule_ACU[],
  ledger: WorldSimulationLedger_ACU,
  patch: Record<string, unknown>,
  baseRevision: number,
): WorldSimulationLedgerModule_ACU[] {
  // 仅首轮建账要求覆盖，且只覆盖必须建档的模块：纪要与风声按提示词本就允许没有素材。
  if (baseRevision !== 0) return [];
  return modules.filter(module => {
    if (!ONE_SHOT_BOOTSTRAP_MODULES_ACU.includes(module)) return false;
    if (!Array.isArray(ledger[module]) || (ledger[module] as unknown[]).length) return false;
    const written = patch[module] as { upsert?: unknown[]; append?: unknown[] } | undefined;
    return !written || !((written.upsert?.length ?? 0) + (written.append?.length ?? 0));
  });
}

/** 与解析器同源的可写列清单，提示词与纠错回执不再各自手写列名。 */
function oneShotColumnWhitelist_ACU(tables: readonly string[]): string {
  return tables.map(table => `${table}(${worldSimulationSqlWritableColumns_ACU(table).join(', ')})`).join('; ');
}

/** Explain domain rejections without silently inventing entity IDs or changing the patch. */
function oneShotRepairHint_ACU(issues: readonly WorldSimulationSubagentIssue_ACU[], tables: readonly string[]): string {
  const hints: string[] = [];
  if (issues.some(issue => /(?:^|\.)actorIds$/.test(issue.path) && issue.module === 'seeds')) {
    hints.push('seeds.actor_ids chỉ được ghi mảng ID chuỗi JSON bọc trong dấu nháy đơn của SQL, ví dụ actor_ids = \'["actor-1"]\'; chỉ được trích dẫn actor.id đã có trong sổ cái hiện tại. Nếu không có ID nhân vật xác nhận được thì bỏ actor_ids khỏi mỗi INSERT/UPDATE bị lỗi, không được ghi mảng đối tượng nhân vật, một đối tượng đơn, số hay null.');
  }
  if (issues.some(issue => /(?:^|\.)(?:interests|resources|goals|constraints|informationSources|knownFacts|channels|relatedActorIds)$/.test(issue.path))) {
    hints.push('Cột mảng chuỗi phải ghi mảng chuỗi JSON bọc trong dấu nháy đơn của SQL, ví dụ channels = \'["chợ búa"]\'; không được ghi mảng đối tượng, số hay null. ID liên quan đến nhân vật phải lấy từ sổ cái đã xác nhận.');
  }
  if (issues.some(issue => /(?:^|\.)(?:location|locationRef)$/.test(issue.path) && /必须是对象或 null|phải là đối tượng hoặc null/.test(issue.message))) {
    hints.push('seeds.location, actors.location_ref và player.location cần đối tượng JSON bọc trong dấu nháy đơn của SQL, như location = \'{"region":"Giang Nam phủ"}\'; không được điền tên địa danh trần. Còn actors.location là văn bản tên địa danh.');
  }
  if (issues.some(issue => /actors\.upsert\[\d+\]\.location$/.test(issue.path) && /必须是字符串|phải là chuỗi/.test(issue.message))) {
    hints.push('actors.location là văn bản thuần tên địa danh, chỉ được ghi chuỗi như location = \'Giang Nam phủ · Quán trọ\', không được ghi JSON; địa điểm có cấu trúc thì ghi vào location_ref = \'{"region":"Giang Nam phủ","place":"Quán trọ"}\'.');
  }
  if (issues.some(issue => /(?:sourceId|UNKNOWN_GUIDANCE_SOURCE)/.test(`${issue.path} ${issue.message}`))) {
    hints.push('guidance.signals.sourceId chỉ được dùng ID mục đã có trong sổ cái runtime, clock hoặc player; không được trích dẫn rumors/chronicle vừa INSERT trong ứng viên lần này, cũng không được bịa ID như rumors:1 chưa xuất hiện trong danh mục. Khi không thể gắn với nguồn đã có thì xóa signal đó, đừng điền ID đoán của mục mới tạo.');
  }
  if (issues.some(issue => /SQL 值只允许字符串、数字或 NULL|Giá trị SQL chỉ cho phép chuỗi, số hoặc NULL/.test(issue.message))) {
    hints.push('Giá trị chuỗi phải được bọc bằng dấu nháy đơn ASCII \', ví dụ visibility = \'public\', evidence_refs có thể bỏ thẳng; không được dùng dấu nháy cong kiểu Trung ‘’, dấu ＇ toàn chiều rộng, dấu gạch chéo ngược \\\' hay chèn ký tự độ rộng bằng không, dấu nháy đơn trong nội dung viết thành hai dấu \'\'.');
  }
  if (issues.some(issue => /SQL_COLUMN_FORBIDDEN/.test(issue.message))) {
    hints.push(`Cột bị từ chối không nằm trong danh sách trắng của bảng này, hãy xóa cột đó hoặc đổi sang cột trong danh sách trắng, đừng đổi tên rồi thử lại: ${oneShotColumnWhitelist_ACU(tables)}. Số sửa đổi chỉ ghi trong WHERE expected_revision, không ghi vào SET hay cột INSERT.`);
  }
  if (issues.some(issue => /chronicle_overview|chronicle_archive/.test(issue.message))) {
    hints.push('Cột SQL lưu trữ phải dùng đúng chronicle_archive=(archive_ref, day, summary, fingerprints, related_ids, source_chronicle_ids) và chronicle_overview=(fingerprint, day, one_line, archive_ref); chronicle_overview không cho phép summary hay related_ids.');
  }
  return hints.join(' ');
}

/** 仅识别锚点中可机械确认的整日跨度；不确定时保守返回零，避免把回忆或旧旅程重复计入。 */
export function inferWorldSimulationElapsedDays_ACU(anchor: string): number {
  const text = String(anchor ?? '').replace(/\s+/g, '');
  if (!text) return 0;
  const arabic = (value: string): number => Number.parseInt(value, 10);
  const chinese: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const explicit = text.match(/(?:经过|已过|过去|耗时|用了|历时)(\d+|[一两二三四五六七八九十])(?:天|日|昼夜)/);
  if (explicit) return arabic(explicit[1]) || chinese[explicit[1]] || 0;
  const repeated = text.match(/(?:连续|一连)(\d+|[一两二三四五六七八九十])(?:天|日|昼夜)/);
  if (repeated) return arabic(repeated[1]) || chinese[repeated[1]] || 0;
  if (/(?:一昼夜|一日一夜|一夜一天|过了一夜|隔了一夜)/.test(text)) return 1;
  if (/(?:昨日|昨天|前日|前天)/.test(text) && /(?:今日|今天|今夜|次日|翌日|第二天|第二日)/.test(text)) return 1;
  return inferVietnameseElapsedDays_ACU(String(anchor ?? ''));
}

const VIETNAMESE_DAY_COUNT_WORDS_ACU: Record<string, number> = {
  một: 1, hai: 2, ba: 3, bốn: 4, năm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9, mười: 10,
};
const VI_DAY_COUNT_ACU = String.raw`(\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)`;
// 越南语按词分隔且字母带声调，\b 不认这些字母，词界只能用 Unicode 字母/数字的前后断言。
const VI_WORD_START_ACU = String.raw`(?<![\p{L}\p{N}])`;
const VI_WORD_END_ACU = String.raw`(?![\p{L}\p{N}])`;
const VI_ELAPSED_DAYS_PATTERNS_ACU = [
  // trải qua 3 ngày / mất hai ngày đêm / kéo dài 5 ngày（对应 经过/耗时/历时 N 天）
  new RegExp(`${VI_WORD_START_ACU}(?:trải qua|đã qua|trôi qua|mất|tốn|kéo dài) ${VI_DAY_COUNT_ACU} ngày${VI_WORD_END_ACU}`, 'u'),
  // ba ngày trôi qua / 3 ngày đêm đã trôi qua
  new RegExp(`${VI_WORD_START_ACU}${VI_DAY_COUNT_ACU} ngày(?: đêm)?(?: đã)? trôi qua${VI_WORD_END_ACU}`, 'u'),
  // liên tục 3 ngày / suốt ba ngày（对应 连续/一连 N 天）
  new RegExp(`${VI_WORD_START_ACU}(?:liên tục|liên tiếp|suốt|ròng rã) ${VI_DAY_COUNT_ACU} ngày${VI_WORD_END_ACU}`, 'u'),
];
const VI_ONE_NIGHT_PATTERN_ACU = new RegExp(
  `${VI_WORD_START_ACU}(?:một ngày một đêm|một đêm một ngày|một ngày đêm|qua một đêm|sau một đêm|cách một đêm)${VI_WORD_END_ACU}`, 'u');
const VI_PREVIOUS_DAY_PATTERN_ACU = new RegExp(`${VI_WORD_START_ACU}(?:hôm qua|hôm kia|hôm trước)${VI_WORD_END_ACU}`, 'u');
const VI_CURRENT_DAY_PATTERN_ACU = new RegExp(
  `${VI_WORD_START_ACU}(?:hôm nay|đêm nay|tối nay|hôm sau|ngày thứ hai)${VI_WORD_END_ACU}`, 'u');

/** 越南语锚点的整日跨度，判定口径与中文分支逐条对应，同样在不确定时返回零。 */
function inferVietnameseElapsedDays_ACU(anchor: string): number {
  const text = anchor.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return 0;
  for (const pattern of VI_ELAPSED_DAYS_PATTERNS_ACU) {
    const matched = text.match(pattern);
    if (matched) return Number.parseInt(matched[1], 10) || VIETNAMESE_DAY_COUNT_WORDS_ACU[matched[1]] || 0;
  }
  if (VI_ONE_NIGHT_PATTERN_ACU.test(text)) return 1;
  if (VI_PREVIOUS_DAY_PATTERN_ACU.test(text) && VI_CURRENT_DAY_PATTERN_ACU.test(text)) return 1;
  return 0;
}

export class WorldSimulationSubagentRuntime_ACU {
  constructor(private readonly dependencies: WorldSimulationSubagentRuntimeDependencies_ACU) {}

  async runOneShot(input: WorldSimulationOneShotInput_ACU): Promise<WorldSimulationSubagentOutcome_ACU> {
    const definition = findWorldSimulationAgentDefinition_ACU(input.agentName);
    if (!definition || !['undercurrent-analyst', 'dramatis-keeper', 'guidance-composer'].includes(input.agentName)) throw new Error('WORLD_SIMULATION_ONE_SHOT_AGENT_INVALID');
    const modules = definition.writableModules;
    const failed = (error: unknown, source: WorldSimulationPendingFixSource_ACU = 'protocol_failed',
      located: WorldSimulationSubagentIssue_ACU[] = []): WorldSimulationSubagentOutcome_ACU => {
      const message = error instanceof Error ? error.message : String(error);
      // A protocol/tool error has no ledger module. Preserve it in the summary;
      // only transaction/SQL issues with a proven owner become pending fixes.
      return { agentName: input.agentName, status: 'failed', summary: message, reasonCode: 'WORLD_SIMULATION_ONE_SHOT_FAILED',
        evidenceRefs: [], uncertainties: [], completion: 'failed', acceptedKeys: [],
        moduleCompletion: Object.fromEntries(modules.map(module => [module, 'failed'])),
        unresolvedIssues: located };
    };
    const preset = resolveWorldSimulationAgentApiPreset_ACU(input.settings, input.agentName, 'agent_delegate', this.dependencies.apiPreset);
    const toolMode = input.toolMode ?? resolveWorldSimulationToolMode_ACU(preset);
    const catalog = buildInUseWorldCatalog_ACU(input.givenLedger);
    const own: Record<string, unknown> = {};
    const omitted: Array<{ id: string; name: string; readAddress: string }> = [];
    for (const module of modules) {
      if (module === 'clock' || module === 'player' || module === 'guidance') { own[module] = input.givenLedger[module]; continue; }
      if (module === 'chronicle') {
        own.chronicle = input.givenLedger.chronicle.slice(-WORLD_CHRONICLE_HOT_WINDOW_ACU);
        own.chronicleOverview = input.givenLedger.chronicleOverview;
        continue;
      }
      const rows = [...input.givenLedger[module]];
      const selected = module === 'seeds'
        ? input.givenLedger.seeds.filter(row => row.status !== 'resolved' && row.status !== 'retired').slice(0, 30)
        : module === 'actors'
          ? [...input.givenLedger.actors].sort((a, b) => Number(b.life === 'alive') - Number(a.life === 'alive') || b.revision - a.revision).slice(0, 30)
          : module === 'rumors'
            // 传闻单行很短，不设上限整组完整注入；只排除已消亡条目。
            ? input.givenLedger.rumors.filter(row => row.status !== 'dead')
            : rows;
      own[module] = module === 'seeds' || module === 'actors' || module === 'rumors'
        ? worldLedgerRowsForAgent_ACU(module, selected as readonly object[])
        : selected;
      const kept = new Set(selected.map(row => row.id));
      for (const row of rows) if (!kept.has(row.id)) omitted.push({ id: row.id, name: 'name' in row ? String(row.name) : 'title' in row ? String(row.title) : String(row.fact), readAddress: `${module}:${row.id}` });
    }
    const related: Record<string, unknown> = { omitted };
    const profile = getWorldSimulationAgentAccessProfile_ACU(input.agentName);
    for (const module of profile.readModules) {
      if (modules.includes(module as WorldSimulationLedgerModule_ACU)) continue;
      if (module === 'clock' || module === 'player') related[module] = input.givenLedger[module];
      else if (module === 'chronicle') related[module] = catalog.chronicleHot;
      // 维度与传闻单行很短，直接注入完整行，不再拆成目录与详情；种子与人物字段多，仍用浓缩目录。
      else if (module === 'dimensions') related[module] = input.givenLedger.dimensions;
      else if (module === 'rumors') related[module] = worldLedgerRowsForAgent_ACU('rumors', input.givenLedger.rumors.filter(row => row.status !== 'dead'));
      else if (module in catalog) related[module] = catalog[module as 'dimensions' | 'seeds' | 'actors' | 'rumors'];
    }
    const anchor = typeof input.promptContext.anchorMessage === 'string' ? input.promptContext.anchorMessage : '';
    const elapsedDays = Number.isInteger(input.elapsedDays) && input.elapsedDays! >= 0
      ? input.elapsedDays!
      : inferWorldSimulationElapsedDays_ACU(anchor);
    const runtime = ['【本回合运行时数据】', `Tiêu điểm lượt này: ${input.focus}`, `Tham chiếu bằng chứng neo của lượt này: ${input.anchorEvidenceRef} (evidence_refs chỉ được dùng tham chiếu đã ủy quyền)`,
      `Trình tự thời gian: day=${input.givenLedger.clock.day} slot=${input.givenLedger.clock.slot} storyTime=${input.givenLedger.clock.storyTime}`,
      ...oneShotBootstrapNotice_ACU(input.baseLedgerRevision, modules, input.givenLedger),
      // 批次二串行接在批次一之后，输入 clock 已包含本轮推进；这里不能再让它叠加经过天数。
      input.agentName === 'guidance-composer'
        ? `【Mốc thời gian chung】Số ngày trôi qua rõ ràng được chia sẻ trong lượt này là ${elapsedDays} (do quy trình tính một lần cho cùng một neo). Lô một đã bảo trì clock theo khoảng này, ngày hiện tại ${input.givenLedger.clock.day} đã bao gồm phần đẩy tiến của lượt này (xem trước trong bộ nhớ của lượt này, chưa lưu bền); dùng thẳng ngày đó, không cộng thêm số ngày trôi qua. day của kỷ yếu hậu trường, origin_day và earliest_reveal_day của phong thanh lấy ngày hiện tại làm chuẩn, và dựa vào khoảng thời gian trôi qua trong lượt này để xét sự kiện hậu trường nào đã kết thúc, tin nào đã lan ra; không cộng dồn lặp hồi ức hoặc hành trình đã được tính.`
        : `【Mốc thời gian chung】Số ngày trôi qua rõ ràng được chia sẻ trong lượt này là ${elapsedDays} (do quy trình tính một lần cho cùng một neo; không có thời gian trôi qua rõ ràng thì là 0). Ngày đã nộp hiện tại là ${input.givenLedger.clock.day}; không cộng dồn lặp hồi ức hoặc hành trình đã được tính. undercurrent-analyst độc quyền ghi clock, clock.days chỉ được biểu thị lượng đẩy tiến của lượt này; dramatis-keeper không ghi clock, nhưng việc tính toán trạng thái nhân vật, thời điểm chết và tin đồn đi kèm phải dùng số ngày trôi qua chia sẻ của lượt này. Suy luận của vai trò đồng thời khác chưa được ghi sổ, không được coi là sự thật đã nộp.`,
      `Số sửa đổi singleton: ${input.baseLedgerRevision} (UPDATE của clock/player/guidance ghi WHERE expected_revision = ${input.baseLedgerRevision}; hàng mảng dùng trường revision riêng)`,
      `【Cần sửa】${JSON.stringify(input.givenLedger.pendingFixes.filter(fix => modules.includes(fix.module)))}`,
      ...(input.roundChanges ? [`【Danh sách thay đổi của lượt này】${input.roundChanges}`] : [])].join('\n');
    const resolvers = createWorldSimulationPlaceholderResolvers_ACU({ ...input.promptContext,
      runtimeContext: runtime, writableModules: modules, worldState: input.givenLedger,
      anchorMessage: stripWritingAnnotations_ACU(anchor) });
    // 一次性路径沿用已筛选的完整自有资料与关联目录，不能因模板编辑扩大到整份账本。
    resolvers.$WORLD_STATE = () => `【Tài liệu bạn phụ trách (hàng đầy đủ)】${JSON.stringify(own)}\n【Tài liệu liên quan chỉ đọc】Thang đo cục diện và phong thanh là hàng đầy đủ; phục bút và danh bạ nhân vật là danh mục cô đọng, cần chi tiết thì gọi read theo readAddress. ${JSON.stringify(related)}`;
    const split = splitWorldSimulationSubagentPrompt_ACU(adaptWorldSimulationPromptSegmentsToToolMode_ACU(input.agentName, input.settings.agentPrompts[input.agentName], toolMode), input.agentName);
    const rendered = await renderWorldSimulationPrompt_ACU(split.segments, input.agentName, resolvers);
    const snapshot = await renderWorldSimulationSnapshotSections_ACU(split.snapshotTemplate, resolvers,
      { ledger: input.baseLedgerRevision }, input.agentName);
    const runtimeText = [snapshot.text,
      ...(split.snapshotTemplate.includes('$WORLD_RUNTIME_CONTEXT') ? [] : [runtime]),
      ...(input.injectWorldbook && input.triggeredWorldbook ? [input.triggeredWorldbook] : [])].filter(Boolean).join('\n\n');
    const base = rendered.messages.filter(message => message.content !== USER_PREFILL_CONTENT_ACU);
    // 快照和历史由固定卡片装配，末尾 user 预填充与工具模式无关。
    const transcript: AiWireMessage_ACU[] = [];
    const readGateState = createWorldSimulationReadGateState_ACU();
    const usage = { readsUsed: 0 };
    let reads = 0;
    let repairs = 0;
    // 首轮算出的部分候选兜底：纠错轮整批失效时，仍落账首轮已合法的语句，而不是一起丢掉。
    let salvaged: WorldSimulationSubagentOutcome_ACU | null = null;
    let pendingDelivery: WorldSimulationSubagentOutcome_ACU | null = null;
    let writeAttempted = false;
    const maxReads = input.settings.agentRunBudget.maxExtraReads > 0 ? 1 : 0;
    const authorized = () => new Set(snapshotWorldSimulationEvidenceRegistry_ACU(input.registry).entries.flatMap(entry => entry.evidenceRef ? [entry.evidenceRef] : []));
    const sessionId = input.sessionChatIdentity?.trim();
    const logSession = (entry: { kind: 'tool_read' | 'protocol_retry' | 'write_sql'; title: string; detail: string; ok: boolean; status?: 'running' | 'done' | 'failed' }): number | null =>
      sessionId ? logWorldSimulationSession_ACU(sessionId, { ...entry, agentName: input.agentName }) : null;
    const updateSession = (id: number | null, patch: { title?: string; detail?: string; ok?: boolean; status?: 'running' | 'done' | 'failed' }): void => {
      if (sessionId && id !== null) updateWorldSimulationSession_ACU(sessionId, id, patch);
    };
    const requestDelivery = (outcome: WorldSimulationSubagentOutcome_ACU, turn: AiChatTurn_ACU, raw: string): void => {
      pendingDelivery = outcome;
      const receipt = JSON.stringify({ status: 'candidate', agentName: input.agentName,
        summary: outcome.summary, evidenceRefs: outcome.evidenceRefs, uncertainties: outcome.uncertainties,
        unresolvedIssues: outcome.unresolvedIssues,
        instruction: toolMode === 'tools' ? 'Ứng viên đã được kiểm tra, ở lần trả lời kế tiếp hãy gọi riêng submit để xác nhận nộp.' : 'Ứng viên đã được kiểm tra, ở lần trả lời kế tiếp hãy xuất riêng JSON nộp gồm status, agentName, summary, evidenceRefs, uncertainties.' });
      if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(turn.content, turn.toolCalls, turn.toolCalls.map(() => receipt)));
      else transcript.push({ role: 'assistant', content: raw }, { role: 'user', content: receipt });
    };
    for (let attempt = 0; attempt < 3 + maxReads; attempt++) {
      if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
      let locatedIssues: WorldSimulationSubagentIssue_ACU[] = [];
      let sqlSubmitted = false;
      // 本次尝试提交的 SQL 在会话流里的条目 id；成败都回写到同一条，避免内容与结论分家。
      let writeEntryId: number | null = null;
      const messages = finishWorldSimulationMessages_ACU(toolMode, assembleAgentPrompt_ACU(base, transcript, runtimeText));
      const requestTools = maxReads && reads === 0 ? ['read', 'write_sql'] as const : ['write_sql'] as const;
      // 声明必须与本路径的校验一致：write_sql 在 one-shot 只收 sql，证据引用由程序按锚点绑定。
      // 共享目录里宣传 evidenceRefs 会让模型照着填，再被“多余参数”拒掉。json 模式请求不带 tools。
      const request = worldSimulationInvokeTools_ACU(toolMode, [...agentNativeTools_ACU(requestTools).map(tool => tool.function.name === 'read'
        ? { ...tool, function: { ...tool.function,
          description: 'Chỉ đọc kỹ các readAddress cụ thể được liệt kê rõ trong tài liệu runtime của lượt này; không có mục nào để đọc kỹ thì đừng gọi. Hàng đầy đủ, neo và Sổ thế giới đã được chèn sẵn, không đọc lặp; ledger:current không được ủy quyền cho vai trò thông thường. reads phải là mảng địa chỉ thực sự đọc được.' } }
        : tool.function.name === 'write_sql'
          ? { ...tool, function: { ...tool.function,
            description: 'Ghi một lần toàn bộ thay đổi của vai trò này trong lượt này vào các bảng bạn phụ trách. Tham số chỉ có sql: một hoặc nhiều INSERT/UPDATE/DELETE ngăn cách bằng dấu chấm phẩy, chuỗi dùng dấu nháy đơn ASCII, dấu nháy đơn trong nội dung viết thành hai dấu. Tham chiếu bằng chứng do chương trình gắn theo neo, đừng tự truyền evidenceRefs. Không có thay đổi có thể chứng thực thì đừng gọi công cụ này.',
            parameters: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'], additionalProperties: false } } }
          : tool), worldSimulationOneShotSubmitTool_ACU()]);
      let sent: Awaited<ReturnType<typeof executeWorldSimulationFinalRequest_ACU>>;
      try {
        sent = await executeWorldSimulationFinalRequest_ACU({ messages, inputLimitTokens: input.settings.agentHistoryTokenBudget,
          tools: request.tools, historyBudgetTokens: input.settings.agentHistoryTokenBudget,
          count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
          invoke: value => {
            if (snapshot.sections.length) verifyWorldSimulationSnapshotSections_ACU(snapshot, value);
            if (input.injectWorldbook && input.fixedWorldbook) {
              if (input.fixedWorldbook.text !== (input.triggeredWorldbook ?? '')) throw new Error('WORLD_SIMULATION_WORLDBOOK_SOURCE_UNVERIFIED');
              verifyWorldSimulationFixedWorldbook_ACU(input.fixedWorldbook, value);
            }
            return this.dependencies.invoke(input.agentName, value, preset, request);
          } });
      } catch (error) {
        if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
        return failed(error, 'invoke_failed');
      }
      if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
      if (sent.status === 'rejected') return failed(sent.reason, 'invoke_failed');
      const turn = normalizeAgentModelReply_ACU(sent.response);
      const raw = typeof sent.response === 'string' ? sent.response : turn.content;
      try {
        let payload: Record<string, unknown>;
        let delivery: Record<string, unknown> | null = null;
        let actions: OneShotAction_ACU[] | null = null;
        if (toolMode === 'tools') {
          if (!turn.toolCalls.length) throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_REQUIRED: phải gọi read, write_sql hoặc submit');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(turn.toolCalls), [AGENT_SUBMIT_TOOL_NAME_ACU]);
          delivery = split.decision ? submitPayloadObject_ACU(split.decision.payload) : null;
          actions = split.tools.length ? split.tools.map(({ call, payload: args }) => ({ name: call.name, args })) : null;
        } else {
          if (turn.toolCalls.length) throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: hiện ở chế độ JSON, không gọi hàm; hãy viết read hoặc write_sql thành đối tượng JSON');
          actions = oneShotJsonActions_ACU(raw, snapshotWorldSimulationEvidenceRegistry_ACU(input.registry));
          if (!actions) delivery = parseWorldSimulationJsonPayload_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[input.agentName], ['status']);
        }
        if (delivery) {
          if (delivery.agentName !== input.agentName) throw new Error('WORLD_SIMULATION_ONE_SHOT_AGENT_MISMATCH');
          if (Object.keys(delivery).some(key => ['sql', 'patch', 'action'].includes(key))) throw new Error('WORLD_SIMULATION_ONE_SHOT_DELIVERY_WRITE_FORBIDDEN');
          if (delivery.status === 'candidate' && !pendingDelivery?.candidate) throw new Error('WORLD_SIMULATION_ONE_SHOT_CANDIDATE_REQUIRED');
          if (delivery.status === 'no_change' && writeAttempted) throw new Error('WORLD_SIMULATION_ONE_SHOT_NO_CHANGE_AFTER_WRITE');
          const result = parseWorldSimulationSpecialistResult_ACU({ ...delivery,
            ...(delivery.status === 'candidate' ? { patch: pendingDelivery!.candidate!.patch } : {}) }, snapshotWorldSimulationEvidenceRegistry_ACU(input.registry));
          const outcome = outcomeFromSpecialistResult_ACU(result, modules, input.runId, input.candidateSeq, false);
          return result.status === 'candidate' ? { ...pendingDelivery!, ...outcome,
            summary: pendingDelivery!.unresolvedIssues?.length ? `${outcome.summary} (còn ${pendingDelivery!.unresolvedIssues.length} mục chưa hoàn tất, để lượt sau bổ sung)` : outcome.summary,
            unresolvedIssues: pendingDelivery!.unresolvedIssues } : outcome;
        }
        if (actions) {
          if (pendingDelivery) throw new Error('WORLD_SIMULATION_ONE_SHOT_DELIVERY_REQUIRED');
          if (actions.some(action => action.name === 'write_sql')) writeAttempted = true;
          if (actions.length !== 1) throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_LIMIT');
          const [{ name, args, read }] = actions;
          if (name === 'read') {
            // 分开说明拒绝原因，纠错轮与会话流都能看出是哪条规则。
            if (writeAttempted) throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: đã nộp write_sql, sau đó không được read nữa');
            if (reads >= maxReads) throw new Error(`WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: hạn mức read của lượt này (${maxReads} lần) đã dùng hết, chỉ có thể nộp write_sql hoặc giao kết quả`);
            const parsed = read ?? parseWorldSimulationMainAction_ACU(args, false, snapshotWorldSimulationEvidenceRegistry_ACU(input.registry));
            if (parsed.kind !== 'read') throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: tham số read chỉ có thể là {"reads":["địa chỉ cụ thể"]}');
            reads++;
            const results = await runWorldSimulationToolBatch_ACU({ calls: [parsed], registry: input.registry, dependencies: input.tools,
              gate: { state: readGateState, config: { historyTokenBudget: input.settings.agentHistoryTokenBudget,
                readTokenBudget: input.settings.agentReadTokenBudget, fallbackTokens: input.settings.agentReadFallbackTokens },
                usage, maxReads: input.settings.agentRunBudget.maxReads, readOnce: true,
                canReadAddress: address => worldSimulationCanReadAddress_ACU(input.agentName, address),
                count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU } });
            if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(turn.content, turn.toolCalls, [toolText_ACU(results)]));
            else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: `【Kết quả công cụ】\n${toolText_ACU(results)}` });
            logSession({ kind: 'tool_read', title: `Đọc tài liệu (${results.length} mục)`,
              detail: results.map(item => `${item.address} ${item.status}${item.summary ? `：${item.summary}` : ''}`).join('; '),
              ok: results.every(item => item.status === 'ok' || item.status === 'empty') });
            continue;
          }
          if (name !== 'write_sql') throw new Error(`WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: chỉ cho phép read hoặc write_sql, nhận được ${name}`);
          // evidenceRefs 是共享工具目录的历史参数：这里按锚点自行绑定证据，收到就忽略，不判失败。
          const extra = Object.keys(args).filter(key => !['action', 'sql', 'evidenceRefs'].includes(key));
          if (extra.length) throw new Error(`WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: write_sql chỉ nhận tham số sql, tham số thừa ${extra.join(', ')}`);
          if (typeof args.sql !== 'string' || !args.sql.trim()) throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_FORBIDDEN: tham số sql của write_sql phải là chuỗi không rỗng');
          payload = { status: 'candidate', sql: args.sql };
          sqlSubmitted = true;
          // 提交的 SQL 原文进会话历史：用户要能看到这一轮究竟写了什么，而不只是成功或失败。
          writeEntryId = logSession({ kind: 'write_sql', ok: true, status: 'running',
            title: `Nộp SQL (${args.sql.split(';').filter(part => part.trim()).length} câu lệnh)`, detail: args.sql });
        } else throw new Error('WORLD_SIMULATION_ONE_SHOT_TOOL_REQUIRED');
        if (payload.status === 'failed') return failed(payload.message);
        const normalized = normalizeOneShotSpecialistPayload_ACU(payload, { agentName: input.agentName, writableModules: modules,
          givenLedger: input.givenLedger, baseLedgerRevision: input.baseLedgerRevision, anchorEvidenceRef: input.anchorEvidenceRef, authorizedRefs: authorized() });
        locatedIssues = normalized.issues;
        // 与智能续写同样宽容：合法语句已被逐条隔离出来，不能因为个别语句非法就整批丢弃。
        // 完全没有可用语句才直接要纠错；有可用语句时先把部分候选算出来，再决定是回执还是落账。
        const usablePatch = normalized.payload.status === 'candidate';
        if (!usablePatch && (normalized.issues.length || payload.status === 'candidate')) {
          throw new Error(normalized.issues.slice(0, 8).map(issue => `${issue.path}: ${issue.message}`).join('; ') || 'WORLD_SIMULATION_ONE_SHOT_SQL_REJECTED');
        }
        const snapshot = snapshotWorldSimulationEvidenceRegistry_ACU(input.registry);
        let outcome: WorldSimulationSubagentOutcome_ACU;
        try { outcome = outcomeFromSpecialistResult_ACU(parseWorldSimulationSpecialistResult_ACU(normalized.payload, snapshot), modules, input.runId, input.candidateSeq, false); }
        catch (error) {
          if (normalized.payload.status !== 'candidate') throw error;
          outcome = salvageCandidateOutcome_ACU(normalized.payload, modules, snapshot, input.runId, input.candidateSeq, false);
        }
        if (outcome.candidate) {
          // Match the transaction's domain validation before releasing a candidate; do not
          // treat a syntactically valid SQL reply as a successfully applied write. Batch two
          // sees a preview ledger, but its singleton revisions must remain bound to the run
          // base for the final replay. Adjust only a disposable preflight copy.
          const candidate = outcome.candidate;
          const previewPatch = Object.fromEntries(Object.entries(candidate.patch).map(([module, value]) =>
            ['clock', 'player', 'guidance'].includes(module) && value && typeof value === 'object'
              ? [module, { ...value, expectedRevision: input.givenLedger.revision }]
              : [module, value])) as typeof candidate.patch;
          const report = preflightWorldSimulationCandidates_ACU(input.givenLedger,
            [{ ...candidate, patch: previewPatch }], authorized(), input.settings);
          if (report.blocking.length) {
            locatedIssues = report.blocking.filter(item => modules.includes(item.module as WorldSimulationLedgerModule_ACU))
              .map(item => ({ module: item.module as WorldSimulationLedgerModule_ACU, source: 'transaction_rejected', path: item.path, message: item.message }));
            throw new Error(report.blocking.slice(0, 8).map(item => `${item.path}: ${item.message}${item.details?.expected ? `; cho phép ${item.details.expected}` : ''}`).join('; '));
          }
        }
        // 首轮建账只覆盖了部分模块时，记为待修复而不是再烧一轮模型调用。
        // 与智能续写的 missingFields 回执同义：已接受的先落账，缺的模块由下一轮按 pendingFixes 补齐。
        const uncovered = outcome.candidate
          ? oneShotUncoveredModules_ACU(modules, input.givenLedger, outcome.candidate.patch as Record<string, unknown>, input.baseLedgerRevision)
          : [];
        const residual: WorldSimulationSubagentIssue_ACU[] = [...locatedIssues,
          ...uncovered.map(module => ({ module, source: 'contract_rejected' as const, path: module,
            message: `Dựng sổ cái đợt đầu chưa bao phủ ${module}, module này vẫn rỗng; lượt sau phải dựa vào Sổ thế giới và neo để bổ sung mục ban đầu` }))];
        // 先算出这一轮可交付的候选：有残余就带上 unresolvedIssues，供跨轮兜底与下一轮补录。
        const deliverable: WorldSimulationSubagentOutcome_ACU = residual.length
          ? { ...outcome, unresolvedIssues: residual,
            summary: `${outcome.summary} (còn ${residual.length} mục chưa hoàn tất, để lượt sau bổ sung)` }
          : outcome;
        // 跨轮保留残余更少的一份：纠错轮整批失效时，不把上一轮已合法的语句丢掉。
        if (!salvaged || (deliverable.unresolvedIssues?.length ?? 0) <= (salvaged.unresolvedIssues?.length ?? 0)) salvaged = deliverable;
        // 校验与交付分开；缺口留给下一轮，但本轮候选仍须独立确认。
        if (!locatedIssues.length) {
          updateSession(writeEntryId, { ok: true, status: 'done',
            title: residual.length ? `Đã qua kiểm tra, còn ${residual.length} mục để lượt sau` : 'Đã qua kiểm tra' });
          requestDelivery(deliverable, turn, raw);
          continue;
        }
        // 首轮仍回执一次，给模型改对整批的机会；salvaged 已记下这份候选。
        if (repairs < 1) {
          throw new Error(locatedIssues.slice(0, 8).map(issue => `${issue.path}: ${issue.message}`).join('; ') || 'WORLD_SIMULATION_ONE_SHOT_SQL_REJECTED');
        }
        updateSession(writeEntryId, { ok: true, status: 'done', title: `Chấp nhận một phần, còn ${residual.length} mục để lượt sau` });
        requestDelivery(salvaged ?? deliverable, turn, raw);
        continue;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const lastAttempt = repairs++ >= 1;
        // SQL 原文已由 write_sql 条目完整保留；只有没有工具调用（纯文本回复）时才在这里附原文片段。
        const submitted = !sqlSubmitted ? (turn.toolCalls.map(call => `${call.name} ${call.arguments}`).join('; ') || raw) : '';
        updateSession(writeEntryId, { ok: false, status: 'failed',
          title: lastAttempt ? 'Nộp bị từ chối, đã hết số lần sửa lỗi' : 'Nộp bị từ chối, đã gửi phiếu sửa lỗi' });
        logSession({ kind: 'protocol_retry', ok: false,
          title: lastAttempt ? (salvaged ? 'Sửa lỗi không thành công, ghi sổ phần đã hợp lệ ở đợt đầu' : 'Nộp bị từ chối, đã hết số lần sửa lỗi') : 'Nộp bị từ chối, đã gửi phiếu sửa lỗi',
          detail: `${reason}${submitted ? ` | Mô hình đã nộp: ${submitted.slice(0, 900)}` : ''}` });
        // 纠错写入失效时可保留首轮合法候选；交付错误不能触发自动成功。
        if (lastAttempt) {
          if (sqlSubmitted && salvaged?.candidate && !pendingDelivery) {
            requestDelivery(salvaged, turn, raw);
            continue;
          }
          return failed(error, 'protocol_failed', locatedIssues);
        }
        const hint = oneShotRepairHint_ACU(locatedIssues, oneShotTables_ACU(modules));
        const retry = toolMode === 'tools'
          ? 'Nếu thực sự có thay đổi, chỉ gọi lại write_sql một lần và sửa các SQL bị từ chối; khi ứng viên đã được kiểm tra hoặc không có thay đổi thì gọi riêng submit, không thể hoàn thành thì dùng submit để giao failed. Không xuất JSON hay SQL trần, không được coi phản hồi rỗng là không đổi.'
          : 'Nếu thực sự có thay đổi, chỉ xuất lại một lần {"action":"write_sql","sql":"..."} và sửa các SQL bị từ chối; khi ứng viên đã được kiểm tra hoặc không có thay đổi thì xuất riêng JSON nộp, không thể hoàn thành thì dùng hợp đồng failed. Không xuất SQL trần, không được coi phản hồi rỗng là không đổi.';
        const feedback = `Lần nộp trước không được chấp nhận: ${reason}. ${hint} ${retry}`;
        if (toolMode === 'tools' && turn.toolCalls.length && turn.toolCalls.every(call => call.id && call.name)) transcript.push(...nativeToolExchange_ACU(turn.content, turn.toolCalls, turn.toolCalls.map(() => feedback)));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: feedback });
      }
    }
    return failed('WORLD_SIMULATION_ONE_SHOT_CALL_LIMIT');
  }

  async run(input: WorldSimulationSubagentRunInput_ACU): Promise<WorldSimulationSubagentOutcome_ACU> {
    const definition = findWorldSimulationAgentDefinition_ACU(input.delegation.agentName);
    if (!definition || !['specialist', 'researcher'].includes(definition.kind)) {
      throw new Error('WORLD_SIMULATION_DELEGATION_AGENT_INVALID');
    }
    const agentName = definition.name;
    // 旧逐栏运行恢复时保留原写入工具；新一次性调用仍仅开放 read。
    const legacyTools = definition.writableModules.length && !worldSimulationAgentNativeTools_ACU(agentName).includes('write_sql')
      ? [...worldSimulationAgentNativeTools_ACU(agentName), 'write_sql' as const] : worldSimulationAgentNativeTools_ACU(agentName);
    const preset = resolveWorldSimulationAgentApiPreset_ACU(input.settings, agentName, 'agent_delegate', this.dependencies.apiPreset);
    const writableModules = definition.writableModules.filter(module => !input.writableModules || input.writableModules.includes(module));
    const toolMode = input.toolMode ?? resolveWorldSimulationToolMode_ACU(preset);
    // tools 模式：现有工具 + submit 交付函数；json 模式请求不带 tools，缓存键带 mode:json。
    const request = worldSimulationInvokeTools_ACU(toolMode, [...agentNativeTools_ACU(legacyTools), worldSimulationSpecialistSubmitTool_ACU()]);
    const context = withTask_ACU(input.promptContext, { instruction: input.delegation.instruction, reads: input.delegation.reads }, undefined, writableModules);
    const transcript: Array<{ role: string; content: string }> = [];
    const repair = createWorldSimulationProtocolRepairState_ACU(this.dependencies.protocolRetries ?? 2);
    const readGateState = createWorldSimulationReadGateState_ACU();
    const toolUsage = { readsUsed: 0 };
    let toolRounds = 0;
    let writeRounds = 0;
    const confirmedFields = new Set<string>();
    const writeProblems = new Map<string, WorldSimulationSubagentIssue_ACU>();
    let writeAttempted = false;
    let writeStateUnknown = false;
    const recordWriteReceipt = (receipt: WorldSimulationFieldCommitReceipt_ACU): void => {
      if (receipt.partials === null || receipt.ledgerRevision === null) writeStateUnknown = true;
      if (receipt.status === 'committed') { writeProblems.delete('host'); for (const item of receipt.accepted) writeProblems.delete(`${item.module}#${item.id}`); }
      for (const item of receipt.accepted) {
        confirmedFields.add(`${item.module}:${item.id}:${item.field}`);
        writeProblems.delete(`${item.module}#${item.id}.${item.field}`);
      }
      for (const item of receipt.rejected) {
        const match = /^(clock|dimensions|seeds|actors|player|rumors|chronicle|guidance)#([^.#]+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(item.path);
        const module = match?.[1] as WorldSimulationLedgerModule_ACU | undefined;
        writeProblems.set(item.path, { module: module && writableModules.includes(module) ? module : writableModules[0],
          source: 'transaction_rejected', path: item.path, message: item.reason,
          ...(match ? { id: match[2] } : {}) });
      }
    };
    const terminalIssues = (): WorldSimulationSubagentIssue_ACU[] => {
      if (!writeAttempted) return [];
      const issues = new Map(writeProblems);
      if (writeStateUnknown) issues.set('write_state', { module: writableModules[0], source: 'invoke_failed',
        path: 'write_state', message: 'Trạng thái lưu hoặc bù theo từng cột chưa được xác nhận, phải đọc lại sổ cái có thẩm quyền' });
      let fields: WorldSimulationLedgerFieldSnapshot_ACU | undefined;
      try { fields = input.readFieldSnapshot?.(); }
      catch (error) { issues.set('field_view', { module: writableModules[0], source: 'invoke_failed', path: 'field_view',
        message: error instanceof Error ? error.message : String(error) }); }
      if (!fields && !issues.has('field_view')) issues.set('field_view', { module: writableModules[0], source: 'invoke_failed', path: 'field_view',
        message: 'Chế độ xem phân cột có thẩm quyền hiện không khả dụng' });
      if (fields) {
        for (const module of writableModules) for (const record of Object.values(fields.records[module] ?? {})) {
          if (record.status !== 'partial') continue;
          for (const field of record.missingFields) issues.set(`${module}#${record.id}.${field}`, { module,
            source: 'transaction_rejected', id: record.id, path: `${module}#${record.id}.${field}`, message: `Cột bắt buộc ${field} chưa được nộp` });
        }
        for (const key of confirmedFields) {
          const [module, id, field] = key.split(':') as [WorldSimulationLedgerModule_ACU, string, string];
          if (!fields.records[module]?.[id]?.fields[field]) issues.set(`${module}#${id}.${field}`, { module, id,
            source: 'invoke_failed', path: `${module}#${id}.${field}`, message: 'Phiếu ghi chưa được xác nhận trong sổ cái có thẩm quyền hiện tại' });
        }
      }
      return [...issues.values()];
    };
    const checkedOutcome = (outcome: WorldSimulationSubagentOutcome_ACU): WorldSimulationSubagentOutcome_ACU => {
      const issues = terminalIssues();
      if (!issues.length) return confirmedFields.size && outcome.status === 'no_change'
        ? { ...outcome, acceptedKeys: [...confirmedFields], completion: 'complete_changed',
          moduleCompletion: Object.fromEntries(writableModules.map(module => [module, 'complete_changed'])) }
        : outcome;
      return { agentName, status: 'failed', summary: 'Bảo trì theo từng cột chưa đạt', reasonCode: 'WORLD_SIMULATION_FIELD_INCOMPLETE',
        evidenceRefs: [], uncertainties: [], completion: 'failed',
        moduleCompletion: Object.fromEntries(writableModules.map(module => [module, 'failed'])),
        unresolvedIssues: [...issues, ...(outcome.unresolvedIssues ?? [])], acceptedKeys: [...confirmedFields] };
    };
    const maxWriteRounds = input.writeSql && writableModules.length ? Math.max(1, input.settings.agentRunBudget.maxIterations) : 0;
    const maxCalls = 1 + input.settings.agentRunBudget.maxExtraReads + maxWriteRounds + repair.maxAttempts + 1;

    for (let attempt = 0; attempt < maxCalls; attempt += 1) {
      if (input.isCurrent && !input.isCurrent()) throw new Error('WORLD_SIMULATION_RUN_STALE');
      const requestSnapshot = snapshotWorldSimulationEvidenceRegistry_ACU(input.registry);
      const readBudget = resolveWorldSimulationReadBudget_ACU({
        historyTokenBudget: input.settings.agentHistoryTokenBudget,
        readTokenBudget: input.settings.agentReadTokenBudget,
        fallbackTokens: input.settings.agentReadFallbackTokens,
      });
      const remainingTokens = Math.max(0, readBudget.effectiveMaxReadTokens - readGateState.grantedTokens);
      const remainingRounds = Math.max(0, input.settings.agentRunBudget.maxExtraReads - toolRounds);
      const readAction = definition.kind === 'researcher' ? 'read/search' : 'read';
      const readBudgetText = `Ngân sách đọc còn lại của lượt này: khoảng ${remainingTokens} tokens (giới hạn ${readBudget.effectiveMaxReadTokens}, đã cấp ${readGateState.grantedTokens}); còn lại lượt ${readAction} ${remainingRounds}/${input.settings.agentRunBudget.maxExtraReads}.`;
      const requestContext = { ...context, ...(input.readCurrent ? { worldState: input.readCurrent() } : {}), evidenceRegistry: requestSnapshot, readBudgetText };
      const resolvers = createWorldSimulationPlaceholderResolvers_ACU(requestContext);
      // 旧会话的逐栏恢复必须继续使用 write_sql 协议；v21 的三个默认提示词只供 runOneShot。
      const legacyPrompt = (['undercurrent-analyst', 'dramatis-keeper', 'guidance-composer'] as readonly string[]).includes(agentName)
        ? buildV20WorldSimulationAgentPrompt_ACU(agentName)
        : input.settings.agentPrompts[agentName]
          ?? (agentName === 'timekeeper' || agentName === 'chronicler'
            ? buildV20WorldSimulationAgentPrompt_ACU(agentName) : undefined);
      if (!legacyPrompt) throw new Error(`WORLD_SIMULATION_AGENT_PROMPT_MISSING:${agentName}`);
      const split = splitWorldSimulationSubagentPrompt_ACU(adaptWorldSimulationPromptSegmentsToToolMode_ACU(agentName, legacyPrompt, toolMode), agentName);
      const rendered = await renderWorldSimulationPrompt_ACU(split.segments, agentName, resolvers);
      const snapshot = await renderWorldSimulationSnapshotSections_ACU(split.snapshotTemplate, resolvers,
        isWorldSimulationLedgerContext_ACU(requestContext.worldState) ? { ledger: requestContext.worldState.revision } : {}, agentName);
      const snapshotText = snapshot.text;
      const guidance = split.movedGuidanceIndex >= 0 ? rendered.messages[split.movedGuidanceIndex]?.content : '';
      const appendix = [snapshotText, guidance, input.triggeredWorldbook ?? ''].filter(Boolean).join('\n\n');
      const protocolGuard = { role: 'system', content: worldSimulationProtocolForMode_ACU(agentName, worldSimulationSpecialistRuntimeProtocolInstruction_ACU(agentName, writableModules), toolMode) };
      const drafted = assembleAgentPrompt_ACU([...(rendered.messages.some(isAgentFormatAnswer_ACU) ? [] : [protocolGuard]),
        ...rendered.messages.filter((message, index) => index !== split.movedGuidanceIndex)], transcript, appendix);
      const messages = finishWorldSimulationMessages_ACU(toolMode, drafted, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName]);
      const sent = await executeWorldSimulationFinalRequest_ACU({
        messages,
        inputLimitTokens: input.settings.agentHistoryTokenBudget,
        tools: request.tools,
        historyBudgetTokens: input.settings.agentHistoryTokenBudget,
        count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
        invoke: value => {
          if (snapshot.sections.length) verifyWorldSimulationSnapshotSections_ACU(snapshot, value);
          if (input.fixedWorldbook) {
            if (input.fixedWorldbook.text !== (input.triggeredWorldbook ?? '')) throw new Error('WORLD_SIMULATION_WORLDBOOK_SOURCE_UNVERIFIED');
            verifyWorldSimulationFixedWorldbook_ACU(input.fixedWorldbook, value);
          }
          return this.dependencies.invoke(agentName, value, preset, request);
        },
      });
      if (input.isCurrent && !input.isCurrent()) throw new Error('WORLD_SIMULATION_RUN_STALE');
      if (sent.status === 'rejected') throw new Error(sent.reason);
      const turn = normalizeAgentModelReply_ACU(sent.response);
      const nativeCalls: AiNativeToolCall_ACU[] = turn.toolCalls;
      const raw = typeof sent.response === 'string' ? sent.response : turn.content;
      let calls: ReturnType<typeof parseWorldSimulationSubagentToolCalls_ACU>;
      // tools 模式下 submit 的参数（已去掉 action），交给原契约解析器。
      let submitted: Record<string, unknown> | null = null;
      try {
        if (toolMode === 'tools') {
          if (!nativeCalls.length) throw new Error('Ở chế độ công cụ bắt buộc phải gọi hàm: đọc và ghi dùng hàm tương ứng, nộp kết quả thì gọi submit, không xuất văn bản JSON');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(nativeCalls), [AGENT_SUBMIT_TOOL_NAME_ACU]);
          if (split.decision) submitted = submitPayloadObject_ACU(split.decision.payload);
          calls = split.tools.length ? split.tools.map(({ call, payload }) => {
            if (call.name === 'write_sql') {
              if (!legacyTools.includes('write_sql') || !input.writeSql || !writableModules.length || Object.keys(payload).some(key => !['action', 'sql', 'evidenceRefs'].includes(key))) throw new Error('write_sql chưa được ủy quyền hoặc tham số không hợp lệ');
              return parseWorldSimulationSubagentToolCalls_ACU(JSON.stringify(payload), '', requestSnapshot, true)![0];
            }
            if (!worldSimulationAgentNativeTools_ACU(agentName).includes(call.name as 'read' | 'search')) throw new Error(`Công cụ ${call.name} chưa được profile ${agentName} ủy quyền`);
            const parsed = parseWorldSimulationMainAction_ACU(payload, false, requestSnapshot);
            if (parsed.kind !== call.name) throw new Error('Tên công cụ không khớp với hành động');
            return parsed as Extract<ReturnType<typeof parseWorldSimulationMainAction_ACU>, { kind: 'read' | 'search' }>;
          }) : null;
        } else {
          if (nativeCalls.length) throw new Error('Hiện ở chế độ JSON, không gọi hàm; hãy viết hành động thành đối tượng JSON để xuất');
          // 文本 JSON 的 read/search/write_sql 按批次执行；授权与 tools 模式同一口径。
          calls = parseWorldSimulationSubagentToolCalls_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName], requestSnapshot,
            legacyTools.includes('write_sql') && !!input.writeSql && writableModules.length > 0);
          for (const call of calls ?? []) {
            if (call.kind !== 'write_sql' && !worldSimulationAgentNativeTools_ACU(agentName).includes(call.kind)) throw new Error(`Công cụ ${call.kind} chưa được profile ${agentName} ủy quyền`);
          }
        }
      } catch (error) {
        const failure = recordWorldSimulationProtocolFailure_ACU(repair, error);
        if (!failure.retry && writeAttempted) return checkedOutcome({ agentName, status: 'failed', summary: 'Đã hết lượt thử lại giao thức công cụ theo từng cột',
          reasonCode: 'WORLD_SIMULATION_PROTOCOL_FAILED', evidenceRefs: [], uncertainties: [], completion: 'failed',
          unresolvedIssues: [{ module: writableModules[0], source: 'protocol_failed', path: 'write_sql', message: `${failure.issue.reasonCode}: ${failure.issue.path}` }],
          acceptedKeys: [...confirmedFields] });
        if (!failure.retry) throw error;
        const reason = renderWorldSimulationSpecialistProtocolRejection_ACU(failure.issue, agentName, writableModules, toolMode);
        if (toolMode === 'tools' && nativeCalls.length) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, nativeCalls.map(() => reason)));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: reason }); // 非工具协议纠错
        continue;
      }
      if (calls) {
        const perCall: unknown[][] = [];
        for (let index = 0; index < calls.length; index += 1) {
          const call = calls[index];
          const bucket: unknown[] = [];
          perCall.push(bucket);
          if (call.kind === 'write_sql') {
            if (writeRounds >= maxWriteRounds) {
              bucket.push({ action: 'write_sql', originalSql: call.sql, status: 'rejected', accepted: [], reason: 'Đã hết lượt write_sql', remainingWriteRounds: 0 });
              continue;
            }
            writeRounds += 1;
            writeAttempted = true;
            if (input.isCurrent && !input.isCurrent()) throw new Error('WORLD_SIMULATION_RUN_STALE');
            try {
              const receipt = await input.writeSql!({ role: agentName, sql: call.sql,
                evidenceRegistry: snapshotWorldSimulationEvidenceRegistry_ACU(input.registry), declaredEvidenceRefs: call.evidenceRefs, allowedModules: writableModules,
                isCurrent: input.isCurrent });
              if (input.isCurrent && !input.isCurrent()) throw new Error('WORLD_SIMULATION_RUN_STALE');
              recordWriteReceipt(receipt);
              const repair = renderWorldSimulationWriteRepair_ACU(writableModules, receipt);
              bucket.push({ action: 'write_sql', originalSql: call.sql, ...receipt,
                fieldOutcome: receipt.partials === null || receipt.ledgerRevision === null ? 'Trạng thái lưu không rõ; hãy đọc trường có thẩm quyền trước' : {
                  saved: receipt.accepted.map(item => ({ module: item.module, id: item.id, field: item.field, revision: item.revision, ...('value' in item ? { value: item.value } : {}) })),
                  notSaved: [...receipt.partials.flatMap(item => item.missingFields.map(field => `${item.module}#${item.id}.${field}`)), ...receipt.rejected.map(item => item.path)],
                  generatedIds: [...new Set(receipt.accepted.map(item => `${item.module}#${item.id}`))],
                }, ...(repair ? { repair } : {}), readAddresses: [...new Set([
                ...receipt.accepted.map(item => `field:${item.module}:${item.id}:${item.field}`),
                ...(receipt.partials ?? []).map(item => `field:${item.module}:${item.id}`),
                ...rejectedFieldReadAddresses_ACU(receipt),
              ])],
                remainingWriteRounds: maxWriteRounds - writeRounds });
            } catch (error) {
              if (error instanceof Error && error.message === 'WORLD_SIMULATION_RUN_STALE') throw error;
              const reason = error instanceof Error ? error.message : String(error);
              writeStateUnknown = true;
              writeProblems.set('host', { module: writableModules[0], source: 'invoke_failed', path: 'host', message: reason });
              const unknown: Parameters<typeof renderWorldSimulationWriteRepair_ACU>[1] & Record<string, unknown> = { action: 'write_sql', originalSql: call.sql, status: 'rejected', accepted: [], rejected: [{ path: 'host', reason }],
                partials: null, ledgerRevision: null, readAddresses: [], reason,
                remainingReadRounds: Math.max(0, input.settings.agentRunBudget.maxExtraReads - toolRounds),
                remainingWriteRounds: maxWriteRounds - writeRounds };
              bucket.push({ ...unknown, repair: renderWorldSimulationWriteRepair_ACU(writableModules, unknown) });
            }
          } else if (toolRounds >= input.settings.agentRunBudget.maxExtraReads) {
            bucket.push({ action: call.kind, status: 'rejected', reason: `Đã hết lượt ${definition.kind === 'researcher' ? 'read/search' : 'read'}` });
          } else {
            if (call.kind === 'read') {
              const batch = [call];
              while (index + 1 < calls.length && calls[index + 1].kind === 'read') {
                batch.push(calls[++index] as typeof call);
                perCall.push([]);
              }
              toolRounds += 1;
              bucket.push(...await runWorldSimulationToolBatch_ACU({
                calls: batch, registry: input.registry, dependencies: input.tools,
                gate: { state: readGateState,
                  config: { historyTokenBudget: input.settings.agentHistoryTokenBudget, readTokenBudget: input.settings.agentReadTokenBudget, fallbackTokens: input.settings.agentReadFallbackTokens },
                  usage: toolUsage, maxReads: input.settings.agentRunBudget.maxReads, readOnce: definition.kind !== 'researcher',
                  ...(sent.defaultReadFenceTokens === undefined ? {} : { defaultReadFenceTokens: sent.defaultReadFenceTokens }),
                  ...(input.readRoundState && input.roundId ? { readRoundState: input.readRoundState,
                    readRoundKey: JSON.stringify([agentName, input.roundId]) } : {}),
                  canReadAddress: address => worldSimulationCanReadAddress_ACU(agentName, address),
                  count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU },
              }));
              continue;
            }
            toolRounds += 1;
            bucket.push(...await runWorldSimulationToolBatch_ACU({
              calls: [call], registry: input.registry, dependencies: input.tools,
              gate: { state: readGateState,
                config: { historyTokenBudget: input.settings.agentHistoryTokenBudget, readTokenBudget: input.settings.agentReadTokenBudget, fallbackTokens: input.settings.agentReadFallbackTokens },
                usage: toolUsage, maxReads: input.settings.agentRunBudget.maxReads,
                count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU },
            }));
          }
        }
        const summary = { remainingReadRounds: Math.max(0, input.settings.agentRunBudget.maxExtraReads - toolRounds), remainingWriteRounds: maxWriteRounds - writeRounds };
        if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, perCall.map(items => JSON.stringify({ results: items, ...summary }))));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: `【Kết quả công cụ】\n${JSON.stringify({ results: perCall.flat(), ...summary })}` });
        continue;
      }
      try {
        const draft = submitted
          ? { payload: submitted, truncated: false }
          : parseWorldSimulationJsonDraft_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName], ['status']);
        const payload = bindSpecialistIdentity_ACU(draft.payload, agentName);
        if (String(payload.agentName ?? '').trim() !== agentName) throw new Error('WORLD_SIMULATION_AGENT_IDENTITY_MISMATCH');
        try {
          const result = parseWorldSimulationSpecialistResult_ACU(payload, requestSnapshot);
          return checkedOutcome(outcomeFromSpecialistResult_ACU(
            result,
            definition.writableModules,
            input.runId,
            input.candidateSeq ?? 1,
            draft.truncated,
          ));
        } catch (strictError) {
          try {
            return checkedOutcome(salvageCandidateOutcome_ACU(
              payload,
              definition.writableModules,
              requestSnapshot,
              input.runId,
              input.candidateSeq ?? 1,
              draft.truncated,
            ));
          } catch {
            throw strictError;
          }
        }
      } catch (error) {
        const failure = recordWorldSimulationProtocolFailure_ACU(repair, error);
        if (!failure.retry && writeAttempted) return checkedOutcome({ agentName, status: 'failed', summary: 'Đã hết lượt thử lại giao thức hợp đồng theo từng cột',
          reasonCode: 'WORLD_SIMULATION_PROTOCOL_FAILED', evidenceRefs: [], uncertainties: [], completion: 'failed',
          unresolvedIssues: [{ module: writableModules[0], source: 'protocol_failed', path: 'contract', message: `${failure.issue.reasonCode}: ${failure.issue.path}` }],
          acceptedKeys: [...confirmedFields] });
        if (!failure.retry) throw error;
        const rejection = renderWorldSimulationSpecialistProtocolRejection_ACU(failure.issue, agentName, definition.writableModules, toolMode);
        if (toolMode === 'tools' && nativeCalls.length) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, nativeCalls.map(() => rejection)));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: rejection });
      }
    }
    if (writeAttempted) return checkedOutcome({ agentName, status: 'failed', summary: 'Ngân sách công cụ/mô hình theo từng cột đã hết',
      reasonCode: 'WORLD_SIMULATION_SUBAGENT_CALL_LIMIT', evidenceRefs: [], uncertainties: [],
      completion: 'failed', moduleCompletion: Object.fromEntries(writableModules.map(module => [module, 'failed'])),
      unresolvedIssues: [], acceptedKeys: [...confirmedFields] });
    throw new Error(`WORLD_SIMULATION_SUBAGENT_CALL_LIMIT:${agentName}:${maxCalls}`);
  }

  async runReviewer(input: WorldSimulationReviewInput_ACU): Promise<WorldSimulationReviewerResult_ACU> {
    if (!input.candidates.length) throw new Error('WORLD_SIMULATION_REVIEW_CANDIDATES_REQUIRED');
    const agentName = 'causality-reviewer' as const;
    const preset = resolveWorldSimulationAgentApiPreset_ACU(input.settings, agentName, 'agent_delegate', this.dependencies.apiPreset);
    const context = withTask_ACU(input.promptContext, { objective: 'Rà soát tính toàn vẹn về thời gian, nhân quả, quyền hạn, revision và bằng chứng của ứng viên' }, input.candidates, []);
    const toolMode = input.toolMode ?? resolveWorldSimulationToolMode_ACU(preset);
    const request = worldSimulationInvokeTools_ACU(toolMode, [...agentNativeTools_ACU(worldSimulationAgentNativeTools_ACU(agentName)), worldSimulationReviewerSubmitTool_ACU()]);
    const transcript: Array<{ role: string; content: string }> = [];
    const repair = createWorldSimulationProtocolRepairState_ACU(this.dependencies.protocolRetries ?? 2);
    const readGateState = createWorldSimulationReadGateState_ACU();
    const toolUsage = { readsUsed: 0 };
    let toolRounds = 0;
    const maxCalls = 1 + input.settings.agentRunBudget.maxExtraReads + repair.maxAttempts + 1;
    for (let attempt = 0; attempt < maxCalls; attempt += 1) {
      if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
      const requestSnapshot = snapshotWorldSimulationEvidenceRegistry_ACU(input.registry);
      const readBudget = resolveWorldSimulationReadBudget_ACU({
        historyTokenBudget: input.settings.agentHistoryTokenBudget,
        readTokenBudget: input.settings.agentReadTokenBudget,
        fallbackTokens: input.settings.agentReadFallbackTokens,
      });
      const readBudgetText = `Ngân sách đọc còn lại của lượt này: khoảng ${Math.max(0, readBudget.effectiveMaxReadTokens - readGateState.grantedTokens)} tokens; còn lại lượt read ${Math.max(0, input.settings.agentRunBudget.maxExtraReads - toolRounds)}/${input.settings.agentRunBudget.maxExtraReads}.`;
      const requestContext = { ...context, evidenceRegistry: requestSnapshot, readBudgetText };
      const resolvers = createWorldSimulationPlaceholderResolvers_ACU(requestContext);
      const split = splitWorldSimulationSubagentPrompt_ACU(adaptWorldSimulationPromptSegmentsToToolMode_ACU(agentName, input.settings.agentPrompts[agentName], toolMode), agentName);
      const rendered = await renderWorldSimulationPrompt_ACU(split.segments, agentName, resolvers);
      const snapshot = await renderWorldSimulationSnapshotSections_ACU(split.snapshotTemplate, resolvers,
        isWorldSimulationLedgerContext_ACU(requestContext.worldState) ? { ledger: requestContext.worldState.revision } : {}, agentName);
      const snapshotText = snapshot.text;
      const guidance = split.movedGuidanceIndex >= 0 ? rendered.messages[split.movedGuidanceIndex]?.content : '';
      const appendix = [snapshotText, guidance, input.triggeredWorldbook ?? ''].filter(Boolean).join('\n\n');
      const protocolGuard = { role: 'system', content: worldSimulationProtocolForMode_ACU(agentName, worldSimulationReviewerRuntimeProtocolInstruction_ACU(), toolMode) };
      const reviewerDraft = assembleAgentPrompt_ACU([...(rendered.messages.some(isAgentFormatAnswer_ACU) ? [] : [protocolGuard]),
        ...rendered.messages.filter((message, index) => index !== split.movedGuidanceIndex)], transcript, appendix);
      const sent = await executeWorldSimulationFinalRequest_ACU({
        messages: finishWorldSimulationMessages_ACU(toolMode, reviewerDraft, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName]),
        inputLimitTokens: input.settings.agentHistoryTokenBudget,
        tools: request.tools,
        historyBudgetTokens: input.settings.agentHistoryTokenBudget,
        count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
        invoke: value => {
          if (snapshot.sections.length) verifyWorldSimulationSnapshotSections_ACU(snapshot, value);
          if (input.fixedWorldbook) {
            if (input.fixedWorldbook.text !== (input.triggeredWorldbook ?? '')) throw new Error('WORLD_SIMULATION_WORLDBOOK_SOURCE_UNVERIFIED');
            verifyWorldSimulationFixedWorldbook_ACU(input.fixedWorldbook, value);
          }
          return this.dependencies.invoke(agentName, value, preset, request);
        },
      });
      if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
      if (sent.status === 'rejected') throw new Error(sent.reason);
      const reviewerTurn = normalizeAgentModelReply_ACU(sent.response);
      const reviewerNative = reviewerTurn.toolCalls;
      const raw = typeof sent.response === 'string' ? sent.response : reviewerTurn.content;
      let calls: ReturnType<typeof toolCalls_ACU>;
      let submitted: Record<string, unknown> | null = null;
      try {
        if (toolMode === 'tools') {
          if (!reviewerNative.length) throw new Error('Ở chế độ công cụ bắt buộc phải gọi hàm: đọc bổ sung dùng read, nộp kết luận rà soát thì gọi submit, không xuất văn bản JSON');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(reviewerNative), [AGENT_SUBMIT_TOOL_NAME_ACU]);
          if (split.decision) submitted = submitPayloadObject_ACU(split.decision.payload);
          calls = split.tools.length ? split.tools.map(({ call, payload }) => {
            if (!worldSimulationAgentNativeTools_ACU(agentName).includes(call.name as 'read' | 'search')) throw new Error(`Công cụ ${call.name} chưa được profile ${agentName} ủy quyền`);
            const parsed = parseWorldSimulationMainAction_ACU(payload, false, requestSnapshot);
            if (parsed.kind !== 'read') throw new Error('reviewer chỉ được phép read');
            return parsed as Extract<ReturnType<typeof parseWorldSimulationMainAction_ACU>, { kind: 'read' | 'search' }>;
          }) : null;
        } else {
          if (reviewerNative.length) throw new Error('Hiện ở chế độ JSON, không gọi hàm; hãy viết hành động thành đối tượng JSON để xuất');
          calls = toolCalls_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName], requestSnapshot);
          if (calls?.some(call => call.kind !== 'read')) throw new Error('reviewer chỉ được phép read');
        }
      } catch (error) {
        if (toolMode === 'tools' && reviewerNative.length) {
          const reason = error instanceof Error ? error.message : String(error);
          transcript.push(...nativeToolExchange_ACU(reviewerTurn.content, reviewerNative, reviewerNative.map(() => reason)));
          continue;
        }
        const failure = recordWorldSimulationProtocolFailure_ACU(repair, error);
        if (!failure.retry) throw error;
        transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: renderWorldSimulationReviewerProtocolRejection_ACU(failure.issue, toolMode) });
        continue;
      }
      if (calls) {
        if (toolRounds >= input.settings.agentRunBudget.maxExtraReads) {
          const exhausted = toolMode === 'tools'
            ? 'Đã hết lượt read của reviewer, hãy dựa trên ứng viên và bằng chứng hiện có để gọi submit nộp kết luận rà soát.'
            : 'Đã hết lượt read của reviewer, hãy dựa trên ứng viên và bằng chứng hiện có để xuất JSON chung thẩm.';
          if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(reviewerTurn.content, reviewerNative, reviewerNative.map(() => exhausted)));
          else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: exhausted });
          continue;
        }
        toolRounds += 1;
        const batchResults = await runWorldSimulationToolBatch_ACU({
          calls, registry: input.registry, dependencies: input.tools,
          gate: {
            state: readGateState,
            config: { historyTokenBudget: input.settings.agentHistoryTokenBudget, readTokenBudget: input.settings.agentReadTokenBudget, fallbackTokens: input.settings.agentReadFallbackTokens },
            usage: toolUsage,
            maxReads: input.settings.agentRunBudget.maxReads,
            readOnce: true,
            ...(sent.defaultReadFenceTokens === undefined ? {} : { defaultReadFenceTokens: sent.defaultReadFenceTokens }),
            ...(input.readRoundState && input.roundId ? { readRoundState: input.readRoundState,
              readRoundKey: JSON.stringify([agentName, input.roundId]) } : {}),
            canReadAddress: address => worldSimulationCanReadAddress_ACU(agentName, address),
            count: this.dependencies.countTokens ?? countWorldSimulationTokens_ACU,
          },
        });
        if (input.isCurrent?.() === false) throw new Error('WORLD_SIMULATION_RUN_STALE');
        if (toolMode === 'tools') transcript.push(...nativeToolExchange_ACU(reviewerTurn.content, reviewerNative,
          calls.map((_, index) => index === 0 ? toolText_ACU(batchResults) : 'Lô đọc logic này đã được quyết toán thống nhất, xem kết quả ở phiếu công cụ đầu tiên.')));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: `【Kết quả công cụ】\n${toolText_ACU(batchResults)}` });
        continue;
      }
      try {
        const payload = submitted ?? parseWorldSimulationJsonPayload_ACU(raw, WORLD_SIMULATION_AGENT_PREFILLS_ACU[agentName], ['verdict']);
        const result = parseWorldSimulationReviewerResult_ACU(payload);
        const known = new Set(input.candidates.map(item => item.candidateId));
        const unknown = result.acceptedCandidateIds.filter(id => !known.has(id));
        if (unknown.length) throw new Error(`WORLD_SIMULATION_REVIEW_UNKNOWN_CANDIDATE:${unknown.join(',')}`);
        if (result.verdict === 'accept' && !result.acceptedCandidateIds.length) throw new Error('WORLD_SIMULATION_REVIEW_ACCEPTANCE_REQUIRED');
        if (result.verdict === 'reject' && result.acceptedCandidateIds.length) throw new Error('WORLD_SIMULATION_REVIEW_REJECT_WITH_ACCEPTED');
        return result;
      } catch (error) {
        const failure = recordWorldSimulationProtocolFailure_ACU(repair, error);
        if (!failure.retry) throw error;
        const rejection = renderWorldSimulationReviewerProtocolRejection_ACU(failure.issue, toolMode);
        if (toolMode === 'tools' && reviewerNative.length) transcript.push(...nativeToolExchange_ACU(reviewerTurn.content, reviewerNative, reviewerNative.map(() => rejection)));
        else transcript.push({ role: 'assistant', content: raw || '(empty)' }, { role: 'user', content: rejection });
      }
    }
    throw new Error(`WORLD_SIMULATION_REVIEWER_CALL_LIMIT:${maxCalls}`);
  }

}
