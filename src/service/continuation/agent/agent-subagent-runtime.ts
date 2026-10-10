import { USER_PREFILL_CONTENT_ACU } from '../../../shared/user-prefill.js';
import { agentSnapshotTemplate_ACU, assembleAgentPrompt_ACU } from '../../../shared/agent-prompt-layout';
import { arcArchitectFormatAnswer_ACU } from './arc-architect-prompt';
import { maintainerFormatAnswer_ACU } from './maintainer-prompt';
import { maintainerDeltaSql_ACU } from './agent-maintainer-submit';
import { webResearcherFormatAnswer_ACU } from './web-researcher-prompt';
/**
 * service/continuation/agent/agent-subagent-runtime.ts — 子代理运行时
 *
 * 子代理不是一次性问答，而是一个受限的小循环：主 Agent 派工时给出种子读集，
 * 子代理拿到材料后还可以自己输出 read / search 工具批次补充调阅，运行时执行工具、
 * 把结果作为 user 消息追加进本次派工的对话，再让它继续，直到交出契约 JSON。
 *
 * 提供共享资料时，维护代理只可调阅自身维护范围；其余角色的工具权限由运行时校验。
 * 种子读集和后续批次分别经过门禁；读取失败时不得把同批其它正文回灌给模型。
 *
 * 只读契约仍由主循环结算；write_sql 通过受控生产端口即时保存并回读。
 */

import { normalizeContinuationInternalAiRetryLimit_ACU } from '../defaults';
import { callContinuationInternalAi_ACU, callContinuationInternalAiWithRetry_ACU, CONTINUATION_ROLE_OUTPUT_TOKEN_FLOORS_ACU, type AiUsageMetadata_ACU, type ContinuationInternalAiCallOptions_ACU } from '../internal-ai-call';
import { resolveContinuationAgentApiPreset_ACU, resolveContinuationApiPreset_ACU, type ContinuationResolvedApiPreset_ACU } from '../api-preset';
import { renderContinuationPrompt_ACU } from '../prompt-template';
import {
  ContinuationValidationError_ACU,
  createContinuationError_ACU,
  type ContinuationInternalAiRequestIdentity_ACU,
  type ContinuationPromptSegment_ACU,
  type ContinuationSettings_ACU,
} from '../model';
import { AGENT_PREFILLS_ACU } from './agent-defaults';
import { adaptContinuationPromptSegmentsToToolMode_ACU, buildContinuationAgentPromptsForMode_ACU } from './agent-prompt-mode';
import { logAgentSession_ACU, updateAgentSession_ACU } from './agent-session-log';
import { findMainSessionReadAppendix_ACU, keptSubagentMaterialTokens_ACU, omitSnapshotSectionsForSubagent_ACU, renderFallbackAgentSnapshot_ACU, stripUnownedSubagentPrompt_ACU } from './agent-shared-materials';
import { agentNativeTools_ACU, nativeToolArguments_ACU, nativeToolExchange_ACU, normalizeAgentModelReply_ACU, withJsonTailPrefill_ACU, withNativeToolThinkPrefill_ACU, type AiNativeToolCall_ACU } from '../../ai/native-tool';
import { resolveAgentToolMode_ACU, type AgentToolMode_ACU } from '../../ai/agent-tool-mode';
import { AGENT_SUBMIT_TOOL_NAME_ACU, continuationSubmitTool_ACU, splitNativeDecisionCalls_ACU, submitPayloadObject_ACU, submitPayloadText_ACU } from '../../ai/agent-decision-tools';
import { hasActiveStoryArc_ACU, readAgentModuleFoldState_ACU, readAgentModuleSnapshot_ACU } from './agent-module-store';
import { AGENT_OPERATION_ONLY_PENDING_MESSAGE_ACU, confirmAgentEmptyPatchPending_ACU } from './agent-module-field-commit';
import type { AgentFieldPage_ACU, AgentModuleFieldReceipt_ACU, AgentModuleRevisionWindow_ACU } from './agent-module-field-commit';
import { findAgentSubagentDefinition_ACU, getAgentSubagentAccessProfile_ACU, getAgentSubagentReadPrefixes_ACU, renderAgentReadCatalog_ACU, renderAgentWebToolCatalog_ACU, type AgentSubagentDefinition_ACU } from './agent-catalog';
import { renderAgentUserRequirements_ACU } from './agent-user-requirements';
import {
  compactAgentProtocolError_ACU,
  mergeAgentMaintainerOutputs_ACU,
  parseAgentComposerOutput_ACU,
  parseAgentFinalReviewerOutput_ACU,
  parseAgentJsonPayload_ACU,
  parseAgentJsonPayloadDraft_ACU,
  parseAgentToolCall_ACU,
  parseAgentWebToolCall_ACU,
  parseAgentMaintainerOutputDraft_ACU,
  parseAgentPlannerOutput_ACU,
  parseAgentResearcherOutput_ACU,
  parseAgentResearcherToolCalls_ACU,
  parseAgentReviewerOutput_ACU,
  parseAgentSubagentToolCalls_ACU,
  parseAgentWritableToolCalls_ACU,
  parseAgentResearcherWorkingNotes_ACU,
  renderAgentContractContinuationRequest_ACU,
  type AgentContractRejection_ACU,
} from './agent-protocol';
import {
  AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU,
  AgentWebClient_ACU,
  enabledEncyclopediaSources_ACU,
  type AgentFetchedPage_ACU,
} from './agent-web-client';
import { buildAgentFinalReviewEvidence_ACU, type AgentFinalReviewEvidence_ACU } from './agent-final-review-context';
import {
  buildAgentWorldbookScanText_ACU,
  renderAgentStoryCatalog_ACU,
  renderAgentStoryOverview_ACU,
  renderAgentStoryTail_ACU,
  renderAgentOutlineWindow_ACU,
  renderAgentUnsettledHistory_ACU,
  resolveAgentReadToken_ACU,
  resolveAgentReadAddressAxis_ACU,
  resolveAgentReadTokenWithProof_ACU,
  type AgentResolveContext_ACU,
} from './agent-placeholder-resolver';
import { allocateAgentDefaultReadFences_ACU, type AgentDefaultFenceCandidate_ACU } from './agent-default-fence';
import { measureContinuationFinalRequestCapacity_ACU } from './agent-final-request-gate';
import { countAgentTokens_ACU, type TokenCounter_ACU } from './agent-token-budget';
import { buildEmptyAgentWorldbookSnapshot_ACU, renderAgentWorldbookBrowseCatalog_ACU, renderAgentWorldbookTriggeredInjection_ACU } from './agent-worldbook-read';
import { renderAgentTableCatalog_ACU } from './agent-tables';
import { runAgentSearch_ACU } from './agent-search';
import {
  createAgentReadGateState_ACU,
  gateAgentReadBatch_ACU,
  resolveAgentReadBudget_ACU,
  type AgentGateItem_ACU,
  type AgentReadGateConfig_ACU,
  type AgentReadGateState_ACU,
} from './agent-read-gate';
import { AGENT_FINAL_REVIEWER_NAME_ACU } from './agent-model';
import type {
  AgentComposerOutput_ACU,
  AgentEmptyPatchConfirmation_ACU,
  AgentMaterialCompletionState_ACU,
  AgentPendingFixSource_ACU,
  AgentPendingFix_ACU,
  AgentDelegation_ACU,
  AgentFinalReviewerOutput_ACU,
  AgentMaintainerOutput_ACU,
  AgentModuleRevisions_ACU,
  AgentPlannerOutput_ACU,
  AgentReadFence_ACU,
  AgentResearcherOutput_ACU,
  AgentReviewerOutput_ACU,
  AgentRunBudget_ACU,
  AgentSubagentKind_ACU,
  AgentToolCall_ACU,
  AgentWebRefResolvedItem_ACU,
  AgentWebRefResolvedPatch_ACU,
  AgentWebRefSource_ACU,
  AgentWebRefStatus_ACU,
  AgentWebToolCall_ACU,
  AgentWritableModule_ACU,
  AgentSubagentName_ACU,
} from './agent-model';

/**
 * 子代理事件概览的行数上限（按角色）。子代理每次派工都是全新上下文、无提示词缓存，
 * 概览随纪要表线性增长会让长对话里每次派工的固定成本失控，因此按尾部窗口截断。
 * 召回命中的更早轮次不受截断影响（渲染器会将其前置展示），窗口外脉络可用
 * $TABLE:纪要表:行区间 精读，截断说明里带有回溯地址。
 */
export const AGENT_SUBAGENT_OVERVIEW_ROWS_ACU = {
  /** mainline-planner 每轮必派，只需近期脉络与召回命中的关键旧轮。 */
  mainlinePlanner: 50,
  /** 其余子代理（含 arc-architect 的全局校准）给更宽的窗口。 */
  default: 100,
} as const;

export interface AgentSubagentUnresolvedIssue_ACU {
  module: AgentWritableModule_ACU;
  source: AgentPendingFixSource_ACU;
  path: string;
  message: string;
  id?: string;
  rejectionKind?: 'empty_patch';
  revision?: number;
}

/** 一次子代理执行的结果。写集事务留给主循环应用，这里只交出解析后的输出。 */
export interface AgentSubagentRunResult_ACU {
  agentName: string;
  kind: AgentSubagentKind_ACU;
  /** 该子代理职责固定对应的可写模块（arc → storyArc，maintain → hooks+infoGap，其余为空）。 */
  writes: AgentWritableModule_ACU[];
  /**
   * 总纲子代理的输出。它与 maintainer 共用一份写集契约，但必须分成两个字段：
   * 主循环对 maintainer 结果会把结算水位推到末楼，总纲写入不代表历史已结算，
   * 复用同一字段会让未结算区间被误判为已处理。
   */
  arc: AgentMaintainerOutput_ACU | null;
  maintainer: AgentMaintainerOutput_ACU | null;
  planner: AgentPlannerOutput_ACU | null;
  reviewer: AgentReviewerOutput_ACU | null;
  /** web-researcher 的输出：pageRef 已回填成完整条目，主循环用 applyAgentWebRefsDelta_ACU 落库。 */
  researcher: AgentResearcherOutput_ACU | null;
  /** 用户要求维护子代理的全量替换清单；其它角色为 null。 */
  requirements: string[] | null;
  /** instruction-composer 的写作指令；其它角色省略。 */
  composer?: AgentComposerOutput_ACU | null;
  /** 契约类子代理的结构化完成状态；其它角色省略。 */
  completion?: Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>;
  /** 契约类子代理按职责模块给出的完成状态。 */
  moduleCompletion?: Partial<Record<AgentWritableModule_ACU, Exclude<AgentMaterialCompletionState_ACU, 'legacy_unknown'>>>;
  /** 补足额度耗尽后仍未清偿的问题。 */
  unresolvedIssues?: AgentSubagentUnresolvedIssue_ACU[];
  /** 仅来自提交口的无业务变更核实，不接受模型自报。 */
  operationOnlyConfirmed?: AgentModuleFieldReceipt_ACU['operationOnlyConfirmed'];
  /** 仅由完整权威帧和本派工修订号窗口生成，不接受模型自报。 */
  emptyPatchConfirmed?: AgentEmptyPatchConfirmation_ACU[];
  /** 当前权威帧仍确认的逐栏回执；版本变化后调用方不得用它清账。 */
  fieldConfirmation?: { keys: string[]; revisions: AgentModuleRevisions_ACU };
  /** 已通过解析并暂存的稳定条目键，供后续补足去重。 */
  acceptedKeys?: string[];
  /** 本次派工实际发出的模型调用次数（read/search、write_sql 与协议修正均计入）。 */
  iterations: number;
  attempts: number;
  /** 小循环里通过 read/search 补充调阅的地址（读 token 与搜索指纹），进主 Agent 的结果摘要。 */
  expandedReads: string[];
  /** 渲染读集材料那一刻的模块修订号。主循环用它做写入并发校验，不依赖子代理自报。 */
  readRevisions: AgentModuleRevisions_ACU;
  /**
   * 本次派工全部 AI 调用的累计 token 用量；完全没有 usage 回调时为 null。
   * 任一次已观测调用未报告某字段时，该累计字段保持 undefined。
   */
  usage: AiUsageMetadata_ACU | null;
  /** 即时写工具已执行；旧最终写集不得再覆盖本次保存的栏目。 */
  usedFieldWrites?: boolean;
}

export interface AgentReadRoundState_ACU {
  successfulReadBatches: Set<string>;
  pendingReadBatches: Set<string>;
}

export function createAgentReadRoundState_ACU(): AgentReadRoundState_ACU {
  return { successfulReadBatches: new Set<string>(), pendingReadBatches: new Set<string>() };
}

export interface AgentSubagentRunInput_ACU {
  delegation: AgentDelegation_ACU;
  /** 稳定的工作流轮标识；读取额度按 agentName + roundId 计账。 */
  roundId: string;
  settings: ContinuationSettings_ACU;
  resolveContext: AgentResolveContext_ACU;
  budget: AgentRunBudget_ACU;
  preset: ContinuationResolvedApiPreset_ACU;
  createIdentity: (agentName: string, attempt: number) => ContinuationInternalAiRequestIdentity_ACU;
  isCurrent: (identity: ContinuationInternalAiRequestIdentity_ACU) => boolean;
  signal?: AbortSignal | null;
  /** 修正轮只允许维护员触碰仍待修复的模块；首轮不传则使用职责固定写集。 */
  targetModules?: readonly AgentWritableModule_ACU[];
  /** 主工作流传入的待修身份，不代替权威资料与版本核实。 */
  pendingFixes?: readonly AgentPendingFix_ACU[];
  /** 同一主会话轮次内由所有同名子代理调用共享的读取额度状态。 */
  readRoundState?: AgentReadRoundState_ACU;
  writeSql?: (input: { role: AgentSubagentName_ACU; sql: string; resolvePage: (handle: string) => AgentFieldPage_ACU | null; isCurrent?: () => boolean; revisionWindow?: AgentModuleRevisionWindow_ACU; expectedRevisions?: Partial<AgentModuleRevisions_ACU> }) => Promise<AgentModuleFieldReceipt_ACU>;
  /** 主会话为本轮备好的世界书全文和已有检索。传入后子代理不能再读这些范围。 */
  sharedMaterials?: string;
  /** 主会话当前运行时快照。附在子代理末尾，与主会话看到的是同一份。 */
  mainSnapshot?: string;
  /** 主会话已确认的原身份消息投影；本次工具往返追加在其后。 */
  mainHistory?: readonly import('../../ai/native-tool').AiWireMessage_ACU[];
  /** 本次运行的工具协议；缺省为 json（请求不带函数，动作写成 JSON 对象）。 */
  toolMode?: AgentToolMode_ACU;
}

/** 终审由 finalize 前的受控状态机调用，不接受普通 delegation。 */
export interface AgentFinalReviewRunInput_ACU {
  settings: ContinuationSettings_ACU;
  resolveContext: AgentResolveContext_ACU;
  candidateInstruction: string;
  currentUserInput: string;
  planningSummary?: string;
  createIdentity: (agentName: string, attempt: number) => ContinuationInternalAiRequestIdentity_ACU;
  isCurrent: (identity: ContinuationInternalAiRequestIdentity_ACU) => boolean;
  signal?: AbortSignal | null;
  sharedMaterials?: string;
  mainSnapshot?: string;
  mainHistory?: readonly import('../../ai/native-tool').AiWireMessage_ACU[];
  toolMode?: AgentToolMode_ACU;
}

export interface AgentFinalReviewRunResult_ACU {
  output: AgentFinalReviewerOutput_ACU;
  evidence: AgentFinalReviewEvidence_ACU;
  iterations: number;
  attempts: number;
  toolRounds: number;
  readTokens: number;
  expandedReads: string[];
  readRevisions: AgentModuleRevisions_ACU;
  usage: AiUsageMetadata_ACU | null;
}

export interface AgentSubagentRuntimeDependencies_ACU {
  callInternalAi: (
    messages: Array<{ role: string; content: string }>,
    preset: ContinuationResolvedApiPreset_ACU,
    identity: ContinuationInternalAiRequestIdentity_ACU,
    signal?: AbortSignal | null,
    options?: ContinuationInternalAiCallOptions_ACU,
  ) => Promise<string | import('../../ai/native-tool').AiChatTurn_ACU | null>;
  resolveApiPreset: typeof resolveContinuationApiPreset_ACU;
  resolveAgentApiPreset?: typeof resolveContinuationAgentApiPreset_ACU;
  /** web-researcher 的出网客户端；测试注入假客户端以摆脱网络。 */
  webClient?: AgentWebClient_ACU;
  /** 酒馆自身 origin，用于拒绝 web_read 抓自己；缺省取 location.origin。 */
  hostOrigin?: () => string;
  /** 最终请求容量门禁与默认上围栏的 token 计数器；缺省走宿主分词器。 */
  countTokens?: TokenCounter_ACU;
}

const defaultDependencies_ACU: AgentSubagentRuntimeDependencies_ACU = {
  callInternalAi: callContinuationInternalAi_ACU,
  resolveApiPreset: resolveContinuationApiPreset_ACU,
  resolveAgentApiPreset: resolveContinuationAgentApiPreset_ACU,
  hostOrigin: () => (typeof location !== 'undefined' ? location.origin : ''),
};

const PROMPT_KEY_PREFILLS_ACU: Record<AgentSubagentDefinition_ACU['promptKey'], string> = {
  arcArchitect: AGENT_PREFILLS_ACU.arc,
  maintainer: AGENT_PREFILLS_ACU.maintainer,
  mainlinePlanner: AGENT_PREFILLS_ACU.planner,
  beatPlanner: AGENT_PREFILLS_ACU.planner,
  webResearcher: AGENT_PREFILLS_ACU.researcher,
  instructionComposer: AGENT_PREFILLS_ACU.composer,
};

/** 各类子代理契约对象的判别键：解析器据此从模型全文中挑出正确的 JSON 对象。 */
const KIND_PAYLOAD_KEYS_ACU: Record<AgentSubagentKind_ACU, readonly string[]> = {
  arc: ['delta', 'summary'],
  maintain: ['delta', 'summary'],
  plan: ['recommendation', 'summary'],
  review: ['verdict'],
  research: ['delta', 'summary'],
  compose: ['instruction', 'summary'],
};

/** 一次派工内已抓取页面的句柄缓存：网页正文只在本次派工用于归纳，契约仅回填来源元数据。 */
interface ResearcherPageCache_ACU {
  pages: Map<string, AgentFetchedPage_ACU & { query: string }>;
  /** 已抓取过的 URL → 句柄，同页重抓直接返回旧句柄不计页数。 */
  byUrl: Map<string, string>;
  pagesUsed: number;
}

/**
 * 契约类子代理（总纲/维护）在一次派工里最多追加的续写/修补轮数。
 * 输出被截断或个别条目非法时，只索要剩余或修正条目，不整份重来；这两轮不占协议重试额度。
 */
export const AGENT_CONTRACT_CONTINUATION_ROUNDS_ACU = 2;

function readStaysWithOwner_ACU(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => key === prefix || key.startsWith(`${prefix}:`));
}

const KIND_FIXED_WRITES_ACU: Record<AgentSubagentKind_ACU, readonly AgentWritableModule_ACU[]> = {
  arc: ['storyArc'],
  maintain: ['hooks', 'infoGap', 'chronology'],
  plan: [],
  review: [],
  research: ['webRefs'],
  compose: [],
};

function rejectDelegation_ACU(message: string, details?: Record<string, unknown>): never {
  throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_AGENT_WRITE_REJECTED', 'agent_delegate', message, false, details));
}

function subagentFailed_ACU(message: string, retryable: boolean, details?: Record<string, unknown>): ContinuationValidationError_ACU {
  return new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_AGENT_SUBAGENT_FAILED', 'agent_delegate', message, retryable, details));
}

function selectPromptSegments_ACU(settings: ContinuationSettings_ACU, definition: AgentSubagentDefinition_ACU, mode: AgentToolMode_ACU): readonly ContinuationPromptSegment_ACU[] {
  return adaptContinuationPromptSegmentsToToolMode_ACU(definition.promptKey, settings.agentPrompts[definition.promptKey], mode);
}

function splitDefaultSubagentMaterials_ACU(
  segments: readonly ContinuationPromptSegment_ACU[],
  key: keyof ContinuationSettings_ACU['agentPrompts'],
  mode: AgentToolMode_ACU,
): { segments: ContinuationPromptSegment_ACU[]; taskTemplate: string } {
  const defaults = buildContinuationAgentPromptsForMode_ACU(mode)[key];
  const taskIndex = defaults.findIndex(segment => segment.content.includes('$AGENT_TASK'));
  const candidate = taskIndex >= 0 ? segments[taskIndex] : undefined;
  if (!candidate?.enabled || !candidate.content.includes('$AGENT_TASK') || candidate.content !== defaults[taskIndex].content) {
    return { segments: segments.map(segment => ({ ...segment })), taskTemplate: '' };
  }
  return {
    segments: segments.map((segment, index) => index === taskIndex ? { ...segment, content: 'Nhiệm vụ lần này, phạm vi ghi, tư liệu và danh sách tự kiểm tra xem trong snapshot hiện tại độc lập.' } : { ...segment }),
    taskTemplate: candidate.content,
  };
}

export function renderStoryArcVolumePlanInstruction_ACU(settings: ContinuationSettings_ACU): string {
  const plan = settings.storyArcVolumePlan;
  const capacity = 'Mỗi volume mới phải khai báo narrativeRole, targetStageRange, targetTimeSpan, progressCeiling, ít nhất một sustainingThreads và ít nhất một payoffTargets. targetStageRange là mốc dung lượng mang tính diễn giải: hiệu chỉnh theo mỗi lượt khoảng 800–1200 chữ, giai đoạn chuẩn 6–10 lượt; 600 nghìn chữ chỉ tương ứng kiểm tra bậc độ lớn khoảng 500–750 lượt, không cam kết số chữ hay số chương cố định.';
  if (plan === 'short') return `【总纲卷数计划】Tuyến ngắn: khi tạo mới hoặc tái cấu trúc toàn bộ tổng cương thì hoạch định 7–8 tập. ${capacity}`;
  if (plan === 'medium') return `【总纲卷数计划】Tuyến vừa: khi tạo mới hoặc tái cấu trúc toàn bộ tổng cương thì hoạch định 10–14 tập. ${capacity}`;
  if (plan === 'long') return `【总纲卷数计划】Tuyến dài: khi tạo mới hoặc tái cấu trúc toàn bộ tổng cương thì hoạch định 20 tập. ${capacity}`;
  const count = settings.customStoryArcVolumeCount;
  return `【总纲卷数计划】Tùy chỉnh: khi tạo mới hoặc tái cấu trúc toàn bộ tổng cương thì hoạch định ${count ?? 'chưa cấu hình'} tập. ${capacity}`;
}

function describeWriteScope_ACU(writes: readonly AgentWritableModule_ACU[]): string {
  if (!writes.length) return 'Nhiệm vụ của bạn không bao gồm ghi dữ liệu. Bạn chỉ cần trả về đề xuất hoặc phán quyết, không xuất delta.';
  const labels: Record<AgentWritableModule_ACU, string> = { hooks: '$HOOKS_LEDGER sổ phục bút', infoGap: '$INFO_GAP dòng thời gian nhận thức và chênh lệch thông tin', constraints: '$ACTIVE_CONSTRAINTS ràng buộc dài hạn', storyArc: '$STORY_ARC tổng cương câu chuyện', chronology: '$CHRONOLOGY sổ niên đại học câu chuyện', webRefs: '$WEB_REFS kho tư liệu bách khoa', userRequirements: '$USER_REQUIREMENTS yêu cầu của người dùng' };
  return `Phạm vi ghi cố định của bạn: ${writes.map(item => labels[item]).join(', ')}. Các mô-đun ngoài nhiệm vụ tuyệt đối không được xuất hiện trong delta.`;
}

function agentReadRoundKey_ACU(agentName: string, roundId: string): string {
  return JSON.stringify([agentName, roundId]);
}

interface SubagentGate_ACU {
  state: AgentReadGateState_ACU;
  config: AgentReadGateConfig_ACU;
  /** 本次派工已放行的读取地址（含种子）。重复调阅返回一行提示、不重注、不计账。 */
  granted: Set<string>;
  /** 收窄读取的原始地址 -> 实际已提供的子范围与剩余地址；原地址不能冒充已完整放行。 */
  narrowed: Map<string, { address: string; remainder?: string }>;
  /** 普通角色的成功工具读取批次；种子资料与失败批次不占额度。 */
  successfulReadBatch: boolean;
  /** 跨同一主会话轮次共享的读取额度键；终审等独立入口可省略。 */
  readRoundKey?: string;
  readRoundState?: AgentReadRoundState_ACU;
  /**
   * 产生当前工具调用的那次最终请求算出的 60% 默认上围栏预算；只作地址适配器解析默认读取范围的输入。
   * 同一模型回合内已放行的读取会从中扣除，下一次请求前由容量门禁重新计量。
   */
  defaultReadFenceTokens?: number;
}

interface SubagentMaterial_ACU {
  key: string;
  label: string;
  text: string;
  status?: 'failed';
  /** 本地读取地址的解析结果；未显式提供上围栏的读取据此在批次层按默认上围栏解析范围。 */
  read?: { title: string; body: string; requestedFence?: AgentReadFence_ACU };
}

/**
 * 把一条运行时消息插到尾部预填充之前。渲染后的消息序列若以 assistant 预填充收尾，
 * 追加内容必须放在它前面，否则预填充不再是最后一条消息、失去续写引导作用。
 */
export function insertBeforeTrailingPrefill_ACU(
  messages: ReadonlyArray<{ role: string; content: string }>,
  extra: { role: string; content: string },
): Array<{ role: string; content: string }> {
  const last = messages[messages.length - 1];
  if (last && (last.role === 'assistant' || (last.role === 'user' && last.content === USER_PREFILL_CONTENT_ACU))) return [...messages.slice(0, -1), extra, last];
  return [...messages, extra];
}

/**
 * 子代理读取预算状态文本。子代理提示词一次渲染即固定，预算这类随工具轮变化的实时状态
 * 由运行时在首轮注入、并在每次工具批次后追加刷新；本侧门禁是单批次独立判定，额度不跨批累计。
 */
function renderSubagentReadBudgetNote_ACU(params: {
  maxReadTokens: number; fallbackTokens: number; maxToolRounds: number; toolRoundsUsed: number; grantedTokens: number; readOnce?: boolean;
}): string {
  const remaining = Math.max(0, params.maxToolRounds - params.toolRoundsUsed);
  return [
    `【读取预算状态】Giới hạn mỗi lô đọc khoảng ${params.maxReadTokens} tokens; khi gần ngưỡng tóm tắt, chỉ lô đọc kỹ không quá ${params.fallbackTokens} tokens mới được cho qua.`,
    `Số vòng công cụ còn lại ${remaining} / ${params.maxToolRounds} (lần giao việc này đã tích lũy cho phép đọc khoảng ${params.grantedTokens} tokens, chỉ để theo dõi, không trừ hạn mức các lô sau).`,
    params.readOnce
      ? 'Lượt này chỉ cho phép một lô đọc thành công: khi thật sự cần đọc bổ sung, hãy đưa toàn bộ địa chỉ vào cùng một lần trả lời để đọc song song; lô thất bại không chiếm hạn mức và có thể thử lại sau khi sửa; đã đọc hoặc không cần đọc thì giao ngay, chỗ thiếu ghi trung thực là "thiếu thông tin", không được bịa.'
      : 'Phân bổ tra cứu theo ngân sách: trước hết search để định vị, rồi dùng địa chỉ hẹp (khoảng tầng/khoảng hàng bảng/ID mô-đun) để đọc kỹ; hết số vòng thì giao dựa trên tư liệu hiện có, chỗ thiếu ghi trung thực là "thiếu thông tin", không được bịa.',
  ].join('\n');
}

function researcherProtocolError_ACU(message: string): never {
  throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_AGENT_PROTOCOL_INVALID', 'agent_delegate', message, true));
}

/**
 * 用页面缓存回填 web-researcher 契约里的 pageRef。句柄不存在按协议错误处理并回灌可用句柄清单，
 * 让模型改正而不是让运行时猜；pageRef 指向抓取失败的页面同样拒绝——没有可靠来源就不能入库。
 */
function resolveResearcherDraft_ACU(draft: ReturnType<typeof parseAgentResearcherOutput_ACU>, cache: ResearcherPageCache_ACU): AgentResearcherOutput_ACU {
  const available = [...cache.pages.keys()];
  const resolvePage_ACU = (pageRef: string): { title: string; source: AgentWebRefSource_ACU; url: string; query: string; sourceStatus: AgentWebRefStatus_ACU } => {
    const key = pageRef.trim().toUpperCase();
    const page = cache.pages.get(key);
    if (!page) {
      researcherProtocolError_ACU(`pageRef "${pageRef}" không có trong kết quả công cụ của lần giao việc này. Handle khả dụng: ${available.length ? available.join(', ') : '(chưa tải trang nào, hãy tải bằng encyclopedia_read / web_read trước)'}`);
    }
    if (page.status !== 'ok' || !page.text) {
      researcherProtocolError_ACU(`Trang ứng với pageRef "${pageRef}" tải thất bại (${page.note || page.status}), không thể nhập kho; hãy đổi nguồn hoặc đổi từ khóa để tải lại, hoặc bỏ mục này khỏi hợp đồng`);
    }
    return { title: page.title, source: page.source, url: page.url, query: page.query, sourceStatus: page.status };
  };
  const items = draft.items.map((item): AgentWebRefResolvedItem_ACU => {
    if (item.action === 'retire') {
      return { action: 'retire', id: item.id, title: '', source: 'web', url: '', query: '', tags: [], brief: '', summary: '', sourceStatus: 'ok', reason: item.reason };
    }
    const page = resolvePage_ACU(item.pageRef);
    return {
      action: 'upsert',
      id: item.id,
      title: item.title || page.title,
      source: page.source,
      url: page.url,
      query: page.query,
      tags: item.tags,
      brief: item.brief,
      summary: item.summary,
      sourceStatus: page.sourceStatus,
      reason: '',
    };
  });
  const patches = (draft.patches ?? []).map((patch): AgentWebRefResolvedPatch_ACU => {
    const resolved: AgentWebRefResolvedPatch_ACU = { id: patch.id };
    if (patch.pageRef) {
      const page = resolvePage_ACU(patch.pageRef);
      resolved.source = page.source;
      resolved.url = page.url;
      resolved.query = page.query;
      resolved.sourceStatus = page.sourceStatus;
      if (!patch.title && page.title) resolved.title = page.title;
    }
    if (patch.title) resolved.title = patch.title;
    if (patch.tags) resolved.tags = patch.tags;
    if (patch.brief) resolved.brief = patch.brief;
    if (patch.summary !== undefined) resolved.summary = patch.summary;
    return resolved;
  });
  return { summary: draft.summary, expectedRevision: draft.expectedRevision, items, patches };
}

/** 把一个读地址解析成材料条目。text 已带分节标题，可直接拼接注入。 */
function resolveMaterial_ACU(token: string, context: AgentResolveContext_ACU, requestedFence?: AgentReadFence_ACU): SubagentMaterial_ACU {
  const resolved = resolveAgentReadTokenWithProof_ACU(token, context, requestedFence);
  const proofMissing = resolved.status !== 'failed'
    && (!resolved.proof || resolved.proof.stableAddress !== token || resolved.proof.completeWithinFence !== true);
  const failed = resolved.status === 'failed' || proofMissing;
  return {
    key: token,
    label: token,
    text: `### ${resolved.title} (${token})\n${proofMissing ? 'fence-proof-missing' : resolved.text}`,
    ...(failed
      ? { status: 'failed' as const }
      : { read: { title: resolved.title, body: resolved.text, ...(requestedFence === undefined ? {} : { requestedFence }) } }),
  };
}

/** 只有定位到合法模块和安全 ID 的领域拒绝路径才可转为权威读取地址。 */
function blankMaintainerOutput_ACU(summary: string): AgentMaintainerOutput_ACU {
  return {
    summary,
    delta: {
      expectedRevisions: {},
      hooks: [], hookPatches: [], infoGap: [], infoGapPatches: [],
      storyArc: [], storyArcPatches: [], chronology: [], chronologyPatches: [],
      constraintProposals: [],
    },
  };
}

const SQL_QUOTING_ACU = 'Chuỗi dùng dấu nháy đơn, dấu nháy đơn trong chính văn viết thành hai dấu nháy đơn. Mảng và đối tượng dùng văn bản JSON bao bằng dấu nháy đơn, ví dụ \'["mục"]\', \'{"min":1,"max":2}\'. Tên cột dùng snake_case. Hàng mới có thể không ghi id và expected_revision; nếu ghi expected_revision thì phải là 0. UPDATE/DELETE hàng đã có thì ghi id và số hiệu chỉnh hiện tại của mô-đun đó trong WHERE, đừng ghi hai mục này trong SET. Số hiệu chỉnh ở cấp mô-đun: các hàng của cùng một mô-đun dùng chung một số, lấy giá trị của mô-đun đó trong revisions của biên nhận gần nhất hoặc revisions đọc được từ $FIELD; fieldRevision trong fieldOutcome.saved chỉ là phiên bản của một cột đơn lẻ, không được ghi vào expected_revision.';

/** 各维护角色的 write_sql 格式、范例和使用时机。运行时注入，不依赖提示词模板是否已迁移。 */
function renderMaintenanceSqlGuide_ACU(name: string, toolMode: AgentToolMode_ACU = 'json'): string {
  const head = [
    toolMode === 'tools'
      ? 'Gọi hàm write_sql để nộp. sql của một lần gọi có thể chứa nhiều câu lệnh, ngăn cách bằng dấu chấm phẩy, đừng tách thành nhiều lần gọi, cũng đừng viết thành JSON, delta hay Markdown.'
      : 'Nộp bằng đối tượng hành động write_sql: {"action":"write_sql","sql":"câu lệnh"}. Một sql có thể chứa nhiều câu lệnh, ngăn cách bằng dấu chấm phẩy, đừng tách thành nhiều đối tượng, cũng đừng viết thành delta hay Markdown.',
    SQL_QUOTING_ACU,
    `${toolMode === 'tools' ? 'Chỉ gọi khi tư liệu thật sự cần thêm, sửa hoặc xóa. Nếu không có thay đổi thì đừng gọi, hãy gọi thẳng submit để giao summary.' : 'Chỉ xuất write_sql khi tư liệu thật sự cần thêm, sửa hoặc xóa. Nếu không có thay đổi thì đừng xuất, hãy giao thẳng summary của JSON cuối cùng.'}status=committed thì accepted đã được lưu; khi có partials thì chỉ UPDATE bổ sung các cột chưa lưu theo missingFields, đừng gửi lại cả hàng. Khi trạng thái lưu không chắc chắn thì read khung chuẩn trước.`,
  ];
  if (name === 'arc-architect') {
    return [
      ...head,
      'Chỉ ghi story_arc. scope=story toàn cục chỉ được có một bản ghi active, đừng ghi các cột cấp tập. volume ngoài các cột bắt buộc của story còn phải ghi narrative_role, target_stage_range, target_time_span, progress_ceiling, sustaining_threads, payoff_targets. Cùng một lúc chỉ được có một volume có status là active, các tập còn lại là planned.',
      'Khi nào dùng: chưa có tổng cương thì INSERT toàn truyện và các tập; sau khi giai đoạn hoàn thành chỉ UPDATE stage_numbers của tập hiện tại; khi tập khép lại thì UPDATE status và căn cứ hoàn thành; bỏ một tập thì dùng DELETE và ghi reason.',
      'Ví dụ (toàn truyện cộng tập một, hàng mới có số hiệu chỉnh là 0):',
      'INSERT INTO story_arc (scope, title, direction, escalation, withheld, status) VALUES (\'story\', \'Truy tìm sự thật\', \'Nhân vật chính phải làm rõ lai lịch cấm địa, thất bại sẽ mất tư cách vào thành\', \'Từ nghi ngờ ngoài cổng đến xác nhận người gác cổng biết chuyện\', \'Thân phận cuối cùng\', \'active\');',
      'INSERT INTO story_arc (scope, title, direction, escalation, withheld, status, narrative_role, target_stage_range, target_time_span, progress_ceiling, sustaining_threads, payoff_targets) VALUES (\'volume\', \'Vào thành\', \'Nhân vật chính chọn vào thành và làm quen người gác cổng\', \'Từ quan sát ngoài cổng đến lấy được manh mối đầu tiên\', \'Thân phận thật của người gác cổng\', \'active\', \'setup\', \'{"min":1,"max":2}\', \'vài ngày\', \'Chỉ xác nhận lối vào, không vén lõi cấm địa\', \'["Lòng tin với người gác cổng"]\', \'["Lấy được manh mối mảnh tinh thể đầu tiên"]\');',
      'Sửa tập đã có (7 chỉ là minh họa, thay bằng giá trị hiện tại của revisions.storyArc): UPDATE story_arc SET stage_numbers = \'[1]\' WHERE id = \'VOL-01\' AND expected_revision = 7;',
      'Xóa: DELETE FROM story_arc WHERE id = \'VOL-02\' AND reason = \'Mâu thuẫn với chính văn\' AND expected_revision = 7;',
    ].join('\n');
  }
  if (name === 'hook-cognition-maintainer') {
    return [
      ...head,
      'Chỉ ghi hooks, info_gap, chronology và constraint_proposals đề xuất đăng ký. Chỉ đăng ký những thay đổi đã thực sự xảy ra trong chính văn. Trường thời gian trong dàn ý là kế hoạch, không được ghi vào chronology.',
      'Khi nào dùng: gọi khi chính văn mới xuất hiện manh mối, phục bút bị chạm lại, nhân vật biết thêm điều gì, hoặc chính văn thực sự qua đêm/qua ngày. Không có thay đổi có thể chứng thực thì đừng gọi.',
      'Ví dụ phục bút: INSERT INTO hooks (summary, status, importance, planted_index, planned_payoff) VALUES (\'Người gác cổng giấu mảnh tinh thể trong tay phải\', \'planted\', \'mid\', 3, \'Sau khi vào thành, người gác cổng tự tay giao ra\');',
      'status chỉ được là planted, reinforced, misled, partially_paid, paid, abandoned. importance chỉ được là high, mid, low.',
      'Ví dụ chênh lệch thông tin: INSERT INTO info_gap (topic, objective_fact, reader_known, character_knowledge, reveal_status) VALUES (\'Lai lịch mảnh tinh thể\', \'Mảnh tinh thể đến từ lõi cấm địa\', \'Độc giả chỉ thấy người gác cổng giấu mảnh tinh thể\', \'[{"name":"Người gác cổng","knows":"Tự tay giữ mảnh tinh thể"}]\', \'partial\');',
      'Khi reveal_status là revealed thì phải ghi đồng thời reveal_index; chưa tiết lộ thì reveal_index ghi NULL. Nội dung nhân vật biết phải truy được về tự trải qua, tận mắt thấy, nghe nói, đọc được hoặc được kể lại.',
      'Ví dụ niên đại học: INSERT INTO chronology (anchor, elapsed, precision, transition, evidence_indexes) VALUES (\'Sáng sớm ngày thứ hai sau khi vào thành\', \'Khoảng hai ngày kể từ mở đầu\', \'approximate\', \'Canh ở cổng thành suốt một đêm\', \'[3,4]\');',
      'precision chỉ được là exact, approximate, unknown. evidence_indexes phải là số tầng chính văn AI đã xuất hiện, có thể trích dẫn tầng đang quyết toán lần này; tầng của người dùng và tầng không tồn tại sẽ bị từ chối.',
      "Đề xuất ràng buộc: chỉ đăng ký đề xuất khi chính văn thật sự bộc lộ ranh giới mới cần tuân thủ lâu dài; việc này không trực tiếp sửa ràng buộc dài hạn, phải do Agent chính quyết định. constraint_proposals chỉ được INSERT, chỉ có một cột text, không ghi id, UPDATE hay DELETE. Ví dụ: INSERT INTO constraint_proposals (text) VALUES ('Trước khi thu hồi phục bút, đừng tiết lộ sớm thân phận người gác cổng');",
      'Sửa phục bút đã có (7 chỉ là minh họa, thay bằng giá trị hiện tại của revisions.hooks): UPDATE hooks SET status = \'reinforced\' WHERE id = \'H001\' AND expected_revision = 7;',
      'Hủy bỏ: DELETE FROM hooks WHERE id = \'H001\' AND reason = \'Chính văn đã nêu rõ việc thu hồi\' AND expected_revision = 7;',
    ].join('\n');
  }
  if (name === 'web-researcher') {
    return [
      ...head,
      'Chỉ ghi web_refs. page_ref phải là handle trang do encyclopedia_read hoặc web_read trả về trong lượt này, ví dụ P1. Không bịa URL, nguyên văn không nhập kho.',
      'Khi nào dùng: INSERT sau khi tải được trang dùng được; UPDATE hoặc DELETE khi xác nhận mục cũ đã lỗi thời hoặc sai. Chưa tải được trang thì đừng INSERT.',
      'Ví dụ: INSERT INTO web_refs (page_ref, name, brief, tags, detail) VALUES (\'P1\', \'Người gác cổng\', \'Người canh gác thường trực ở lối vào cấm địa\', \'["Nhân vật"]\', \'Trang ghi rõ ông ta chỉ biết chuyện trước cổng sắt\');',
      'Sửa mục đã có (7 chỉ là minh họa, thay bằng giá trị hiện tại của revisions.webRefs): UPDATE web_refs SET name = \'Người gác cổng\', brief = \'Người canh gác thường trực ở lối vào cấm địa\', page_ref = \'P1\' WHERE id = \'WR-001\' AND expected_revision = 7;',
      'Xóa: DELETE FROM web_refs WHERE id = \'WR-001\' AND reason = \'Trang đã không còn tồn tại\' AND expected_revision = 7;',
    ].join('\n');
  }
  return head.join('\n');
}

/** 回执给出已保存草稿的缺栏时，只示范补齐这些栏目，不重写已接受栏目。 */
function renderMissingAgentSql_ACU(
  item: NonNullable<AgentModuleFieldReceipt_ACU['partials']>[number],
  revision: number,
): string | null {
  const table = { hooks: 'hooks', infoGap: 'info_gap', storyArc: 'story_arc', chronology: 'chronology', webRefs: 'web_refs' }[item.module];
  const samples: Record<string, Record<string, string>> = {
    hooks: { summary: "'Người gác cổng giấu mảnh tinh thể'", status: "'planted'", importance: "'mid'", plantedIndex: '3', plannedPayoff: "'Sau khi vào thành, người gác cổng giao ra'" },
    infoGap: { topic: "'Lai lịch mảnh tinh thể'", objectiveFact: "'Đến từ lõi cấm địa'", readerKnown: "'Độc giả chỉ thấy người gác cổng giấu mảnh tinh thể'", characterKnowledge: `'[{"name":"Người gác cổng","knows":"Tự tay giữ mảnh tinh thể"}]'`, revealStatus: "'unrevealed'" },
    storyArc: { scope: item.id.startsWith('VOL-') ? "'volume'" : "'story'", title: "'Truy tìm khi vào thành'", direction: "'Nhân vật chính làm rõ lai lịch mảnh tinh thể'", escalation: "'Từ người gác cổng che giấu đến manh mối lộ ra'", withheld: "'Công dụng thật của mảnh tinh thể'", status: item.id.startsWith('VOL-') ? "'planned'" : "'active'", narrativeRole: "'setup'", targetStageRange: `'{"min":1,"max":2}'`, targetTimeSpan: "'vài ngày'", progressCeiling: "'Chỉ xác nhận lối vào cấm địa'", sustainingThreads: `'["Lòng tin với người gác cổng"]'`, payoffTargets: `'["Lấy được manh mối đầu tiên"]'` },
    chronology: { anchor: "'Ngày hôm sau khi vào thành'", elapsed: "'khoảng hai ngày'", precision: "'approximate'", transition: "'canh suốt một đêm'", evidenceIndexes: "'[3]'" },
    webRefs: { title: "'Người gác cổng'", brief: "'Người canh gác lối vào cấm địa'", url: "'P1'" },
  };
  // web_refs.url 只能由本次成功读取的页面句柄 page_ref 颁发，不能直接写 URL。
  const assignments = item.missingFields.map(field => {
    const sample = samples[item.module]?.[field];
    if (!sample) return null;
    const column = field === 'url' && item.module === 'webRefs' ? 'page_ref' : field === 'title' && item.module === 'webRefs' ? 'name'
      : field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return `${column} = ${sample}`;
  });
  if (!table || !assignments.length || assignments.some(value => value === null)) return null;
  return `UPDATE ${table} SET ${assignments.join(', ')} WHERE id = '${item.id.replace(/'/g, "''")}' AND expected_revision = ${revision};`;
}

/** 写回执以已落库的栏目为基线；保存不确定时不能根据旧号建议写入。 */
function renderWriteSqlRepair_ACU(receipt: AgentModuleFieldReceipt_ACU): string {
  if (receipt.partials === null || receipt.revisions === null) {
    const stale = receipt.rejected.find(item => item.path === 'chat');
    if (stale) return `【write_sql 任务失效】${stale.reason}. Đây không phải lỗi trường, không tiếp tục đọc ghi trong tác vụ cũ.`;
    return '【write_sql 补栏】Trạng thái lưu hoặc khôi phục không chắc chắn. Trước hết read cột chuẩn $FIELD:mô-đun:ID theo ID của biên nhận lần trước, xác minh các cột đã lưu và revisions hiện tại; đừng gửi lại SQL gốc hay đoán số hiệu chỉnh.';
  }
  const lines: string[] = [];
  const operationPaths = new Set((receipt.operationOnlyConfirmed ?? []).flatMap(item => item.rejectedPaths));
  if (operationPaths.size) lines.push('Thao tác thuần trường hệ thống đã bị từ chối và chưa ghi; thời gian chạy đã xác minh bản ghi đích đầy đủ và số hiệu chỉnh hiện tại khớp. Đừng sửa nội dung nghiệp vụ chỉ để xóa báo lỗi, đừng gửi lại trường hệ thống; sau khi đối chiếu chính văn lượt này, nếu không có thay đổi nghiệp vụ thì giao riêng summary, nếu có thay đổi thật thì vẫn chỉ ghi các trường nghiệp vụ hợp lệ.');
  if (receipt.rejected.length || receipt.partials.length) lines.push(`expected_revision trong WHERE dùng số hiệu chỉnh mô-đun hiện tại revisions: ${JSON.stringify(receipt.revisions)}; revision của accepted / alreadySaved là số hiệu chỉnh trường, không phải số hiệu chỉnh mô-đun.`);
  if (receipt.alreadySaved?.length) lines.push(`Đã lưu trước đó và lần này không ghi lặp: ${receipt.alreadySaved.map(item => `${item.module}#${item.id}.${item.field}`).join(', ')}. Đừng nộp lại các cột này.`);
  const drafts = receipt.partials.filter(item => item.missingFields.length || item.promotionError);
  if (drafts.length || receipt.rejected.length) {
    lines.push('Ví dụ đối chiếu trường: INSERT gốc định ghi A/B/C/D, nếu accepted của biên nhận xác nhận A/C đã lưu còn missingFields hoặc rejected chỉ ra B/D chưa lưu, lần sau chỉ UPDATE B/D theo ID thật và revision hiện tại mà biên nhận đưa ra; không được gửi lại INSERT hay A/C.');
  }
  for (const item of drafts) {
    const revision = receipt.revisions[item.module];
    lines.push(`${item.module}#${item.id} đã có bản nháp; chỉ thiếu ${item.missingFields.join(', ') || 'chỉnh sửa cần cho kiểm tra miền'}. Số hiệu chỉnh mô-đun hiện tại ${revision}.`);
    if (item.missingFields.length) {
      const sql = renderMissingAgentSql_ACU(item, revision);
      if (sql) lines.push(`Ví dụ chỉ bổ sung cột thiếu: ${sql}`);
      else lines.push('Trước hết read $FIELD:mô-đun:ID tương ứng, đối chiếu các cột có thể ghi theo missingFields, rồi chỉ bổ sung các cột chưa lưu.');
    }
    if (item.module === 'webRefs' && item.missingFields.includes('url')) lines.push('page_ref phải đến từ handle trang của encyclopedia_read hoặc web_read thành công trong lượt này; chưa có handle thì đọc trang trước, đừng coi P1 là handle thực.');
    if (item.promotionError) lines.push(`Chưa thể nâng cấp: ${item.promotionError}. Nếu missingFields rỗng thì read đối chiếu các cột đã lưu trước, rồi chỉ sửa các cột không qua kiểm tra miền; không được sao nguyên ví dụ thiếu cột.`);
  }
  for (const item of receipt.rejected) {
    if (item.reason.startsWith('already_absent')) {
      lines.push(`${item.path}: mục tiêu xóa đã không còn tồn tại, coi như đã xóa xong. Đừng INSERT tạo lại mục này, cũng đừng gửi lại DELETE này.`);
      continue;
    }
    if (operationPaths.has(item.path)) {
      lines.push(`${item.path}: ${item.reason}. Đây là thao tác sai đã được xác minh, không phải cột nghiệp vụ chờ bổ sung.`);
      continue;
    }
    if (item.operationOnlyTarget) lines.push('Trường hệ thống không thể ghi bổ sung. Trước hết đối chiếu cùng mục và số hiệu chỉnh mô-đun hiện tại; khi bản ghi không đầy đủ, xung đột phiên bản hoặc không rõ đã lưu hay chưa, vẫn phải xử lý chỗ thiếu thật, không được tuyên bố không có thay đổi.');
    lines.push(`${item.path}: ${item.reason}. Cột bị từ chối chưa được lưu; đối chiếu kiểu, enum và bằng chứng chính văn theo báo lỗi, chỉ bổ sung cột bị từ chối, không gửi lại accepted.`);
    if (item.reason === 'not_found') lines.push('Mục tiêu của UPDATE không tồn tại: trước hết read $FIELD:mô-đun:ID tương ứng để xác minh; chỉ khi chính văn thật sự mới xuất hiện mục này mới dùng INSERT tạo hàng mới, bản nháp đã có phải dùng UPDATE, mục đã xóa thì đừng tạo lại.');
    if (item.reason === 'id_exists' || item.reason.startsWith('revision_conflict')) lines.push('Trước hết read $FIELD:mô-đun:ID tương ứng để xác minh các cột đã lưu, rồi dùng số hiệu chỉnh mô-đun hiện tại trong revisions của biên nhận hoặc snapshot chuẩn để ghi bổ sung; đừng dùng số cũ hay số 0 của ví dụ.');
    if (item.reason.includes('字段数与值数量不一致')) lines.push('Tên cột và VALUES phải tương ứng từng mục; kiểm tra xem có đặt nhầm chính văn vào danh sách tên cột hoặc thiếu giá trị không, đừng thêm id / expected_revision một cách mù quáng. Chỉ câu lệnh thất bại là chưa ghi, các câu lệnh khác xác nhận theo accepted / alreadySaved, không gửi lại.');
    if (item.reason.includes('字符串字面量未闭合')) lines.push('Kiểm tra dấu nháy đơn tiếng Anh của chuỗi có thành cặp không, dấu nháy đơn trong chính văn viết thành hai dấu nháy đơn.');
    if (item.reason.includes('必须是非空字符串数组') || item.reason.includes('mảng chuỗi không rỗng')) lines.push("Mảng phải viết thành văn bản JSON bao bằng dấu nháy đơn, ví dụ '[\"Lòng tin với người gác cổng\"]', không được thay bằng dấu phẩy hay gạch đứng.");
  }
  return lines.join('\n');
}

/** 契约 SQL 已经按栏目落库时，只追缺栏和被拒栏目，不再把整行收成会失败的 patch。 */
function renderIncompleteFieldWrite_ACU(receipt: AgentModuleFieldReceipt_ACU): string | null {
  // 删除目标已不存在是幂等完成，不要求补写。
  const rejected = receipt.rejected.filter(item => item.path !== 'host' && !item.reason.startsWith('already_absent'));
  const missing = (receipt.partials ?? []).filter(item => item.missingFields.length || item.promotionError);
  if (!rejected.length && !missing.length && receipt.partials !== null && !renderWriteSqlRepair_ACU(receipt)) return null;
  const lines: string[] = [];
  if (receipt.accepted.length) lines.push(`Đã ghi và giữ lại ${receipt.accepted.length} cột. Đừng gửi lại các cột này.`);
  if (rejected.length) {
    lines.push('Các cột sau chưa được ghi:');
    for (const item of rejected) lines.push(`- ${item.path}: ${item.reason}`);
  }
  if (missing.length) {
    lines.push('Các mục sau còn thiếu cột bắt buộc, bổ sung đủ thì mới trở thành tư liệu chính thức:');
    for (const item of missing) lines.push(`- ${item.module}#${item.id}: ${item.missingFields.join(', ') || 'nâng cấp thất bại'}${item.promotionError ? ` (${item.promotionError})` : ''}`);
  }
  if (receipt.partials === null || receipt.revisions === null) lines.push('Trạng thái lưu không chắc chắn. Trước hết read $FIELD:mô-đun:ID để đọc khung chuẩn, rồi mới quyết định ghi bổ sung.');
  const repair = renderWriteSqlRepair_ACU(receipt);
  if (repair) lines.push(repair);
  lines.push(receipt.partials === null || receipt.revisions === null
    ? 'Khi trạng thái lưu không chắc chắn thì read khung chuẩn trước để xác nhận các cột đã lưu và số hiệu chỉnh, đừng ghi tiếp.'
    : 'Chỉ bổ sung các cột chưa lưu; bản nháp đã có dùng UPDATE, WHERE kèm id và expected_revision của mô-đun hiện tại. Chỉ hàng hoàn toàn mới được đọc chuẩn xác nhận là chưa tồn tại mới dùng INSERT. Đừng tách thành nhiều lần gọi.');
  return lines.join('\n');
}

/** 总纲还没建立时，直接要一条 SQL，不再把模型赶回 delta.storyArc。 */
function renderArcSqlBootstrap_ACU(chat: any[], remainingWriteRounds: number, toolMode: AgentToolMode_ACU): string {
  if (remainingWriteRounds <= 0) {
    return `Tổng cương vẫn chưa thể thực thi, số vòng write_sql đã dùng hết, không nộp ghi nữa. ${toolMode === 'tools' ? 'Gọi riêng submit' : 'Xuất riêng JSON cuối cùng'}, báo cáo trung thực trong summary rằng tổng cương chưa được lập cùng các chỗ thiếu, không kèm sql.`;
  }
  const lines = [
    'Tổng cương vẫn chưa thể thực thi. summary, Markdown, delta và mảng storyArc cấp cao nhất đều sẽ không nhập kho.',
    toolMode === 'tools'
      ? 'Hãy gọi write_sql. INSERT hàng mới luôn ghi expected_revision là 0. Bổ sung hàng đã có thì dùng số hiệu chỉnh mô-đun hiện tại, nhiều UPDATE trong cùng một sql đều dùng số này.'
      : 'Hãy xuất riêng {"action":"write_sql","sql":"toàn bộ câu lệnh"}. INSERT hàng mới luôn ghi expected_revision là 0. Bổ sung hàng đã có thì dùng số hiệu chỉnh mô-đun hiện tại, nhiều UPDATE trong cùng một sql đều dùng số này.',
  ];
  const folded = readAgentModuleFoldState_ACU(chat);
  if (folded.salvaged || folded.candidates.some(item => !item.valid)) {
    lines.push('Trạng thái khung tư liệu không chắc chắn. Trước hết read $FIELD:storyArc để đọc khung chuẩn, rồi mới quyết định ghi bổ sung.');
    return lines.join('\n');
  }
  const revision = folded.snapshot.revisions.storyArc;
  lines.push(`Số hiệu chỉnh story_arc hiện tại là ${revision}. INSERT hàng mới luôn ghi expected_revision là 0; chỉ khi bổ sung hàng đã có mới ghi ${revision}. Mỗi INSERT đều phải kèm withheld.`);
  const records = Object.entries(folded.fields.records.storyArc ?? {});
  if (!records.length) {
    lines.push('Hiện chưa có bản ghi tổng cương nào. Đặt một dòng scope=\'story\' (hướng đi toàn truyện) và toàn bộ volume vào cùng một sql để ghi một lần, đừng tách thành nhiều lần gọi. story không kèm narrative_role, target_stage_range, sustaining_threads, payoff_targets. Chỉ tập đầu tiên có status=\'active\', các tập còn lại là \'planned\'.');
  } else {
    lines.push('Đã có bản ghi theo cột, đừng gửi lại các cột đã lưu:');
    for (const [id, record] of records) {
      const saved = Object.keys(record.fields);
      lines.push(`- ${id} (${record.status === 'complete' ? 'đã là mục chính thức' : 'chưa trở thành mục chính thức'}): đã có ${saved.join(', ') || 'không có'}; thiếu ${record.missingFields.join(', ') || 'không có'}.`);
    }
    lines.push('Cột thiếu dùng UPDATE, WHERE kèm id và số hiệu chỉnh ở trên. Chỉ id chưa có mới dùng INSERT.');
  }
  lines.push('sustaining_threads và payoff_targets phải là mảng JSON bao bằng dấu nháy đơn, ví dụ \'["tuyến kinh doanh"]\'. target_stage_range ví dụ \'{"min":6,"max":10}\'. Dấu nháy đơn trong chuỗi viết thành hai dấu nháy đơn.');
  return lines.join('\n');
}

function rejectedFieldReadAddresses_ACU(receipt: AgentModuleFieldReceipt_ACU): string[] {
  if (receipt.partials === null || receipt.revisions === null) return [];
  return receipt.rejected.flatMap(({ path }) => {
    const match = /^(storyArc|hooks|infoGap|chronology|webRefs)#([A-Za-z0-9_-]{1,128})(?:\.[A-Za-z][A-Za-z0-9]*|$)$/.exec(path);
    return match && !['__proto__', 'prototype', 'constructor'].includes(match[2]) ? [`$FIELD:${match[1]}:${match[2]}`] : [];
  });
}

/** 子代理运行时。一个实例可服务多次派工，自身不持有任何本轮状态。 */
export class AgentSubagentRuntime_ACU {
  private readonly dependencies: AgentSubagentRuntimeDependencies_ACU;
  constructor(dependencies: Partial<AgentSubagentRuntimeDependencies_ACU> = {}) {
    this.dependencies = { ...defaultDependencies_ACU, ...dependencies };
  }

  /**
   * 执行一次派工。
   * @param input 派工内容、设置、解析上下文、预算与身份工厂
   * @returns 解析后的子代理输出；种子超预算或重试耗尽时抛错
   */
  async run(input: AgentSubagentRunInput_ACU): Promise<AgentSubagentRunResult_ACU> {
    const definition = findAgentSubagentDefinition_ACU(input.delegation.agentName);
    if (!definition) {
      rejectDelegation_ACU(`Trong danh mục không có agent phụ tên ${input.delegation.agentName}`, { agentName: input.delegation.agentName });
    }
    const accessProfile = getAgentSubagentAccessProfile_ACU(definition.kind);
    const writes = definition.kind === 'maintain' && input.targetModules?.length
      ? [...KIND_FIXED_WRITES_ACU[definition.kind]].filter((module): module is AgentWritableModule_ACU => input.targetModules!.includes(module))
      : [...KIND_FIXED_WRITES_ACU[definition.kind]];
    const readRoundState = input.readRoundState ?? createAgentReadRoundState_ACU();
    const readRoundKey = agentReadRoundKey_ACU(definition.name, input.roundId);
    const gate: SubagentGate_ACU = {
      state: createAgentReadGateState_ACU(),
      config: {
        historyTokenBudget: input.settings.agentHistoryTokenBudget,
        readTokenBudget: input.settings.agentReadTokenBudget,
        fallbackTokens: input.settings.agentReadFallbackTokens,
      },
      granted: new Set(),
      narrowed: new Map(),
      successfulReadBatch: false,
      readRoundKey,
      readRoundState,
    };

    // 种子与工具读取使用同一角色授权；越权种子整次派工拒绝，不发送 provider 请求。
    const seedTokens = [...new Set(input.delegation.reads.map(raw => String(raw ?? '').trim()).filter(Boolean))];
    const authorizedReads = getAgentSubagentReadPrefixes_ACU(definition.kind, writes);
    const unauthorizedSeed = seedTokens.find(token => !readStaysWithOwner_ACU(token, authorizedReads));
    if (unauthorizedSeed) {
      rejectDelegation_ACU(`Địa chỉ hạt giống của lần giao việc chưa được ${definition.name} cấp quyền: ${unauthorizedSeed}`, { agentName: definition.name, address: unauthorizedSeed });
    }
    const seeds = seedTokens.map(token => resolveMaterial_ACU(token, input.resolveContext));
    const failedSeed = seeds.find(seed => seed.status === 'failed');
    if (failedSeed) throw subagentFailed_ACU(`Đọc địa chỉ hạt giống của lần giao việc thất bại: ${failedSeed.key}`, false, { address: failedSeed.key, reason: failedSeed.text });
    const seedDecision = await gateAgentReadBatch_ACU(seeds.map(seed => ({ label: seed.label, text: seed.text })), gate.state, gate.config, 0);
    if (!seedDecision.allowed) {
      rejectDelegation_ACU(
        `Tập đọc hạt giống của lần giao việc vượt ngân sách đọc, toàn bộ lần giao việc không được thực thi. Hãy thu hẹp reads: chính văn dùng khoảng $STORY_RANGE hẹp hơn, bảng dùng $TABLE:tên bảng:khoảng hàng, mô-đun thì đọc kỹ theo ID.\n${seedDecision.report}`,
        { agentName: definition.name, seedTokens, batchTokens: seedDecision.batchTokens },
      );
    }
    gate.state.grantedTokens += seedDecision.batchTokens;
    for (const seed of seeds) gate.granted.add(seed.key);
    const materials = seeds.length
      ? seeds.map(seed => seed.text).join('\n\n')
      : `Lần này không tiêm tư liệu hạt giống nào cho bạn. Thông tin cần thiết hãy dùng công cụ ${accessProfile.allowSearch ? 'read / search' : 'read'} để tra cứu theo địa chỉ trong từng danh mục.`;

    // 捕获与渲染必须同一时刻取自同一份快照，否则并发校验的基准就不是子代理真正读到的版本。
    const readRevisions: AgentModuleRevisions_ACU = { ...input.resolveContext.moduleSnapshot.revisions };
    // 本派工的修订号窗口：自身提交推进的模块号由提交口接管，外部写入会让提交口把窗口重置到最新版。
    const revisionWindow: AgentModuleRevisionWindow_ACU = {};
    for (const module of writes) {
      if (module === 'hooks' || module === 'infoGap' || module === 'storyArc' || module === 'chronology' || module === 'webRefs') revisionWindow[module] = { base: readRevisions[module], head: readRevisions[module] };
    }
    // 概览行数按角色裁剪：mainline-planner 每轮必派、只需近期脉络，取最近 50 轮；其余子代理
    // （含 arc-architect）取最近 100 轮。召回命中的更早轮次不受截断影响（前置展示纪要全文）。
    const overviewMaxRows = definition.promptKey === 'mainlinePlanner'
      ? AGENT_SUBAGENT_OVERVIEW_ROWS_ACU.mainlinePlanner
      : AGENT_SUBAGENT_OVERVIEW_ROWS_ACU.default;
    const isResearch = definition.kind === 'research';
    const webSettings = input.settings.webResearch;
    const pageCache: ResearcherPageCache_ACU = { pages: new Map(), byUrl: new Map(), pagesUsed: 0 };
    // 网页检索天然要多轮「搜 → 读 → 补搜」，工具轮上限独立于普通子代理的 maxExtraReads；总纲保留多轮世界书 read/search。
    // 维护、策划、审查与世界推演 one-shot 同口径：至多一个成功读取批次，读完直接交付。
    const readOnceKind = definition.kind === 'maintain' || definition.kind === 'plan' || definition.kind === 'review';
    const maxToolRounds = Math.max(0, isResearch
      ? webSettings.maxToolRounds
      : readOnceKind ? Math.min(1, input.budget.maxExtraReads) : input.budget.maxExtraReads);
    const readBudget = resolveAgentReadBudget_ACU(gate.config);
    const renderReadBudgetNote = (roundsUsed: number): string => renderSubagentReadBudgetNote_ACU({
      maxReadTokens: readBudget.effectiveMaxReadTokens,
      fallbackTokens: readBudget.effectiveFallbackTokens,
      maxToolRounds,
      toolRoundsUsed: roundsUsed,
      grantedTokens: gate.state.grantedTokens,
      readOnce: readOnceKind,
    });
    // 整次派工先固定协议，再映射默认正文与拆出动态任务段。
    const toolMode: AgentToolMode_ACU = input.toolMode ?? resolveAgentToolMode_ACU('continuation', input.preset);
    const nativeMode = toolMode === 'tools';
    const keptTokens = keptSubagentMaterialTokens_ACU(definition.kind, writes);
    const split = splitDefaultSubagentMaterials_ACU(selectPromptSegments_ACU(input.settings, definition, toolMode), definition.promptKey, toolMode);
    const promptSegments = stripUnownedSubagentPrompt_ACU(split.segments, keptTokens);
    const resolvers = {
      $AGENT_READ_MATERIALS: () => materials,
      $AGENT_TASK: () => input.delegation.prompt,
      $AGENT_WRITE_SCOPE: () => describeWriteScope_ACU(writes),
      $USER_INTENT: () => input.resolveContext.originInstruction || '(Người dùng chưa cung cấp yêu cầu ban đầu)',
      $USER_REQUIREMENTS: () => renderAgentUserRequirements_ACU(input.resolveContext.moduleSnapshot, input.resolveContext.originInstruction),
      $OUTLINE_WINDOW: () => renderAgentOutlineWindow_ACU(input.resolveContext),
      // 资料目录与固定注入：默认提示词按角色矩阵引用；未引用的占位符不产生开销（惰性渲染）。
      $AGENT_READ_CATALOG: () => renderAgentReadCatalog_ACU(toolMode),
      $STORY_CATALOG: () => renderAgentStoryCatalog_ACU(input.resolveContext),
      $TABLE_CATALOG: () => renderAgentTableCatalog_ACU(input.resolveContext.tableData),
      $WORLDBOOK_CATALOG: () => renderAgentWorldbookBrowseCatalog_ACU(input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false)),
      $WORLDBOOK_HITS: () => {
        const worldbook = input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
        if (definition.kind === 'arc') return 'Tổng cương không tiêm toàn văn các mục khớp. Hãy tự chọn read theo danh mục sổ thế giới đã bật, hoặc dùng miền worldbook của search để tìm theo từ khóa.';
        return renderAgentWorldbookTriggeredInjection_ACU(worldbook, buildAgentWorldbookScanText_ACU(input.resolveContext));
      },
      $STORY_OVERVIEW: () => renderAgentStoryOverview_ACU({ tableData: input.resolveContext.tableData, recallCodes: input.resolveContext.recallCodes }, { maxRows: overviewMaxRows }),
      $STORY_TAIL: () => renderAgentStoryTail_ACU(input.resolveContext),
      $HISTORY_UNSETTLED: () => renderAgentUnsettledHistory_ACU(input.resolveContext),
      $HOOKS_LEDGER: () => resolveAgentReadToken_ACU('$HOOKS_LEDGER', input.resolveContext).text,
      $INFO_GAP: () => resolveAgentReadToken_ACU('$INFO_GAP', input.resolveContext).text,
      $ACTIVE_CONSTRAINTS: () => resolveAgentReadToken_ACU('$ACTIVE_CONSTRAINTS', input.resolveContext).text,
      $STORY_ARC: () => resolveAgentReadToken_ACU('$STORY_ARC', input.resolveContext).text,
      $CHRONOLOGY: () => resolveAgentReadToken_ACU('$CHRONOLOGY', input.resolveContext).text,
      $WEB_REFS: () => resolveAgentReadToken_ACU('$WEB_REFS', input.resolveContext).text,
      $WEB_TOOL_CATALOG: () => renderAgentWebToolCatalog_ACU({
        sources: enabledEncyclopediaSources_ACU(webSettings).map(source => `${source} (${AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU[source]})`),
        provider: webSettings.searchProvider,
        maxPages: webSettings.maxPages,
        pageCharLimit: webSettings.pageCharLimit,
        pagesUsed: pageCache.pagesUsed,
      }, toolMode),
    };
    const rendered = await renderContinuationPrompt_ACU(promptSegments, resolvers, 'agent_delegate');
    const renderTaskMaterial = async (): Promise<string> => split.taskTemplate
      ? (await renderContinuationPrompt_ACU([{ role: 'user', content: split.taskTemplate }], resolvers, 'agent_delegate')).messages[0].content
      : '';

    const prefill = PROMPT_KEY_PREFILLS_ACU[definition.promptKey];
    // 总纲卷数计划是随设置变化的运行时指令，不进提示词模板；但它必须落在尾部预填充之前——
    // 追加在预填充之后会让对话以一条 user 消息收尾，预填充失效，模型会另起一段回复而不是续写 JSON。
    let baseMessages = rendered.messages;
    const maintenanceFormat = definition.promptKey === 'arcArchitect' ? arcArchitectFormatAnswer_ACU
      : definition.promptKey === 'maintainer' ? maintainerFormatAnswer_ACU
      : definition.promptKey === 'webResearcher' ? webResearcherFormatAnswer_ACU : undefined;
    const hasMaintenanceFormat = maintenanceFormat !== undefined && rendered.messages.some(message =>
      message.role === 'assistant' && (message.content === maintenanceFormat('json')
        || message.content === maintenanceFormat('tools')));
    const sharedReadExhausted = readOnceKind && readRoundState.successfulReadBatches.has(readRoundKey);
    const readScopeSnapshot = authorizedReads.length
      ? `Vai trò này chỉ được read các địa chỉ riêng hoặc liên quan chặt chẽ sau: ${authorizedReads.join(', ')}. ${accessProfile.allowSearch ? 'Tìm kiếm sổ thế giới chỉ trong phạm vi đã cấp quyền.' : 'Không được search cục bộ.'}${readOnceKind ? sharedReadExhausted || maxToolRounds === 0
        ? 'Hạn mức đọc lần này đã dùng hết, không thể read nữa; giao việc lại không khôi phục hạn mức của cùng lượt. Hãy giao dựa trên tư liệu đã tiêm và biên nhận, khi thiếu bằng chứng thì nói rõ trung thực các chỗ thiếu chưa xác nhận. Giới hạn đọc không thay đổi quyền ghi của lần này.'
        : 'Mỗi lượt tối đa một lô đọc thành công: khi thật sự cần đọc bổ sung, hãy đưa địa chỉ vào cùng một lần trả lời để đọc đủ song song; nếu phần tiêm cố định và danh mục đã đủ thì đừng đọc, giao ngay.' : ''}`
      : 'Vai trò này không có công cụ tra cứu cục bộ, hãy giao trực tiếp dựa trên tư liệu đã chuẩn bị.';
    const tableNames: Partial<Record<AgentWritableModule_ACU, string>> = {
      hooks: 'hooks', infoGap: 'info_gap', storyArc: 'story_arc', chronology: 'chronology', webRefs: 'web_refs',
    };
    const writableTables = ` ${writes.map(module => tableNames[module]).filter(Boolean).join(', ')}${definition.kind === 'maintain' ? '; constraint_proposals chỉ đăng ký đề xuất' : ''}`;
    // 授权随请求快照下发；历史之后只剩固定预填充，不再插入额外 system 段。
    const maintenanceAuthorization = maintenanceFormat !== undefined
      ? `【本次读取与写入授权】\n${readScopeSnapshot}\n${input.writeSql && writes.length
        ? definition.kind === 'maintain'
          ? `Lần này cho phép dùng summary + delta để nộp một lần các thay đổi bảo trì, chương trình lưu và đọc lại; write_sql vẫn có thể ghi tương thích vào${writableTables}. Chỉ công nhận status=committed và đọc lại chuẩn, không gửi lại các cột đã lưu.`
          : `Lần này cho phép write_sql ghi vào${writableTables}; chỉ công nhận kết quả lưu trong biên nhận ghi.`
        : 'Lần này không có quyền ghi write_sql, không nộp ghi, chỉ giao kết quả đối chiếu và các chỗ thiếu.'}`
      : definition.promptKey === 'mainlinePlanner' || definition.promptKey === 'beatPlanner'
        ? `【本次读取与交付授权】\n${readScopeSnapshot}\nVai trò này chỉ trả về đề xuất hoạch định, không ghi tư liệu, không điều động vai trò khác.`
        : definition.promptKey === 'instructionComposer'
          ? `【本次读取与交付授权】\n${readScopeSnapshot}\nVai trò này chỉ giao chỉ thị viết, không ghi tư liệu, không điều động vai trò khác.`
          : '';
    const presentTokens = new Set([...promptSegments, ...(split.taskTemplate ? [{ content: split.taskTemplate }] : [])].flatMap(segment => segment.content.match(/\$[A-Z][A-Z0-9_]*/g) ?? [] as string[]));
    const renderRequestSnapshot = async (): Promise<string> => {
      const editable = agentSnapshotTemplate_ACU(promptSegments, '');
      if (promptSegments.some(segment => segment.snapshotTemplate !== undefined)) {
        const ownSnapshot = editable.trim() ? (await renderContinuationPrompt_ACU([{ role: 'system', content: editable }], resolvers, 'agent_delegate')).messages[0].content : editable;
        const worldbook = input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
        const injection = renderAgentWorldbookTriggeredInjection_ACU(worldbook, buildAgentWorldbookScanText_ACU(input.resolveContext));
        const readsAt = findMainSessionReadAppendix_ACU(input.mainSnapshot ?? '', injection);
        const tokens = new Set(editable.match(/\$[A-Z][A-Z0-9_]*/g) ?? []);
        return [ownSnapshot, tokens.has('$AGENT_TASK') ? '' : `【本次派工任务】\n${input.delegation.prompt}`,
          tokens.has('$AGENT_READ_MATERIALS') ? '' : `【本轮种子资料】\n${materials}`,
          definition.kind !== 'arc' && !tokens.has('$WORLDBOOK_HITS') ? `【本轮语境命中的世界书条目】\n${injection}` : '',
          readsAt >= 0 ? omitSnapshotSectionsForSubagent_ACU((input.mainSnapshot ?? '').slice(readsAt), tokens) : '',
          definition.promptKey === 'arcArchitect' ? renderStoryArcVolumePlanInstruction_ACU(input.settings) : '',
          maintenanceAuthorization, input.sharedMaterials ?? ''].filter(Boolean).join('\n\n');
      }
      const originalSnapshot = input.mainSnapshot?.trim() ? input.mainSnapshot : '';
      const worldbook = input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
      const worldbookInjection = renderAgentWorldbookTriggeredInjection_ACU(worldbook, buildAgentWorldbookScanText_ACU(input.resolveContext));
      const mainReadsAt = findMainSessionReadAppendix_ACU(originalSnapshot, worldbookInjection);
      const latestSnapshot = usedFieldWrites
        ? [await renderFallbackAgentSnapshot_ACU(input.settings, input.resolveContext, toolMode), ...(mainReadsAt >= 0 ? [originalSnapshot.slice(mainReadsAt + 2)] : [])].join('\n\n')
        : originalSnapshot || await renderFallbackAgentSnapshot_ACU(input.settings, input.resolveContext, toolMode);
      const snapshotText = omitSnapshotSectionsForSubagent_ACU(latestSnapshot, presentTokens,
        { dropTriggeredWorldbook: definition.kind === 'arc', worldbookInjection });
      const taskMaterial = await renderTaskMaterial();
      return [snapshotText, taskMaterial || `【本次派工任务】\n${input.delegation.prompt}`, ...(taskMaterial ? [] : [`【本轮种子资料】\n${materials}`]), definition.promptKey === 'arcArchitect' ? renderStoryArcVolumePlanInstruction_ACU(input.settings) : '', maintenanceAuthorization, input.sharedMaterials ?? ''].filter(Boolean).join('\n\n');
    };
    // 预算状态随每次请求尾部快照刷新。
    const allowSearch = accessProfile.allowSearch;
    const ownReads = authorizedReads;
    const authorizedToolNames = new Set<string>([...accessProfile.tools, ...(input.writeSql && writes.length ? ['write_sql'] : [])]);
    if (input.writeSql && writes.length && !hasMaintenanceFormat) {
      baseMessages = insertBeforeTrailingPrefill_ACU(baseMessages, { role: 'system', content: renderMaintenanceSqlGuide_ACU(definition.name, toolMode) });
    }
    if (!maintenanceAuthorization) {
      baseMessages = insertBeforeTrailingPrefill_ACU(baseMessages, { role: 'system', content: readScopeSnapshot });
    }
    const retries = normalizeContinuationInternalAiRetryLimit_ACU(input.settings.internalAiRetryLimit);
    // 小循环的追加消息：子代理自己的输出（assistant）与工具结果。原生工具回执使用 role=tool。
    const transcript: Array<{ role: string; content: string; tool_calls?: NonNullable<ReturnType<typeof nativeToolExchange_ACU>[number]['tool_calls']>; tool_call_id?: string }> = [];
    const trailingPrefill = (baseMessages[baseMessages.length - 1]?.role === 'assistant' || baseMessages[baseMessages.length - 1]?.content === USER_PREFILL_CONTENT_ACU) ? baseMessages.pop() : undefined;
    const expandedReads: string[] = [];
    const researchToolCallIds = new Set<string>();
    const researchWorkingNotes: string[] = [];
    const compactResearchTranscript = (): void => {
      if (!researchWorkingNotes.length) return;
      for (const message of transcript) {
        if (message.role !== 'tool' || !message.tool_call_id || !researchToolCallIds.has(message.tool_call_id)) continue;
        message.content = `【网页工作笔记】\n${researchWorkingNotes.join('\n')}`;
      }
    };
    let toolRoundsUsed = 0;
    let writeRoundsUsed = 0;
    const maxWriteRounds = input.writeSql && writes.length ? Math.max(1, input.budget.maxIterations) : 0;
    let usedFieldWrites = false;
    const confirmedFields = new Set<string>();
    const confirmedFieldRevisions = new Map<string, number>();
    const writeProblems = new Map<string, AgentSubagentUnresolvedIssue_ACU>();
    const sqlRepairTargets = new Map<string, NonNullable<AgentModuleFieldReceipt_ACU['rejected'][number]['repairTarget']>>();
    let writeAttempted = false;
    let writeStateUnknown = false;
    const operationOnlyProofs = new Map<string, NonNullable<AgentModuleFieldReceipt_ACU['operationOnlyConfirmed']>[number]>();
    const operationOnlyTargets = new Map<string, NonNullable<AgentModuleFieldReceipt_ACU['rejected'][number]['operationOnlyTarget']>>();
    const recordWriteReceipt = (receipt: AgentModuleFieldReceipt_ACU): void => {
      if (receipt.partials === null || receipt.revisions === null) writeStateUnknown = true;
      const operationPaths = new Set<string>();
      if (!writeStateUnknown && (receipt.status === 'rejected' || receipt.status === 'committed')) {
        for (const proof of receipt.operationOnlyConfirmed ?? []) {
          if (!writes.includes(proof.module) || receipt.revisions?.[proof.module] !== proof.revision) continue;
          operationOnlyProofs.set(`${proof.module}#${proof.id}`, proof);
          for (const path of proof.rejectedPaths) operationPaths.add(path);
          writeProblems.delete(`${proof.module}#${proof.id}.operationOnly`);
        }
      }
      const confirmed = [...receipt.accepted, ...(receipt.partials !== null && receipt.revisions !== null ? receipt.alreadySaved ?? [] : [])];
      const confirmedThisReceipt = new Set(confirmed.map(item => `${item.module}:${item.id}:${item.field}`));
      for (const item of confirmed) {
        const key = `${item.module}#${item.id}.${item.field}`;
        confirmedFields.add(`${item.module}:${item.id}:${item.field}`);
        if (!writeStateUnknown && (receipt.status === 'committed' || receipt.status === 'rejected')) {
          confirmedFieldRevisions.set(`${item.module}:${item.id}:${item.field}`, item.revision);
          writeProblems.delete(key);
        }
      }
      for (const item of receipt.rejected) {
        // 删除目标已不存在属于幂等完成，不是待修复缺口。
        if (item.reason.startsWith('already_absent')) continue;
        if (operationPaths.has(item.path)) continue;
        if (item.operationOnlyTarget) {
          const target = item.operationOnlyTarget;
          operationOnlyTargets.set(`${target.module}#${target.id}`, target);
          writeProblems.set(`${target.module}#${target.id}.operationOnly`, { module: target.module,
            source: 'transaction_rejected', id: target.id, path: `${target.module}#${target.id}.operationOnly`,
            message: AGENT_OPERATION_ONLY_PENDING_MESSAGE_ACU });
          continue;
        }
        const match = /^(hooks|infoGap|storyArc|chronology|webRefs)#([^.#]+)(?:\.([A-Za-z][A-Za-z0-9]*))?$/.exec(item.path);
        const table = /^sql\[\d+\]\.(hooks|info_gap|story_arc|chronology|web_refs)(?:\.|$)/.exec(item.path)?.[1];
        const tableModules: Record<string, AgentWritableModule_ACU> = {
          hooks: 'hooks', info_gap: 'infoGap', story_arc: 'storyArc', chronology: 'chronology', web_refs: 'webRefs' };
        const module = (item.repairTarget?.module ?? match?.[1] ?? (table ? tableModules[table] : undefined)) as AgentWritableModule_ACU | undefined;
        const key = item.repairTarget ? `sql:${JSON.stringify(item.repairTarget)}` : item.path;
        if (item.repairTarget) sqlRepairTargets.set(key, item.repairTarget);
        writeProblems.set(key, { module: module ?? writes[0],
          source: 'transaction_rejected', path: item.path, message: item.reason,
          ...(match ? { id: match[2] } : {}) });
      }
      const settledIds = new Set(confirmed.map(item => `${item.module}#${item.id}`));
      // 同条目获得新确认才能解决旧行级拒绝；本次仍被拒的条目不能误清。
      for (const key of [...writeProblems.keys()]) {
        if (settledIds.has(key) && !receipt.rejected.some(item => item.path === key)) writeProblems.delete(key);
      }
      if (receipt.partials === null || receipt.revisions === null) return;
      const folded = readAgentModuleFoldState_ACU(input.resolveContext.chat);
      if (writeStateUnknown || folded.salvaged || folded.candidates.some(item => !item.valid)) return;
      for (const [key, target] of sqlRepairTargets) {
        const matches = Object.values(folded.fields.records[target.module] ?? {}).filter(record =>
          target.column === 'id' ? record.id === target.value : record.fields[target.column]?.value === target.value);
        if (matches.length !== 1) continue;
        const record = matches[0];
        if (record.status !== 'complete' || !settledIds.has(`${target.module}#${record.id}`)
          || receipt.rejected.some(item => item.path === `${target.module}#${record.id}` || item.path.startsWith(`${target.module}#${record.id}.`)
            || (item.repairTarget?.module === target.module
              && (item.repairTarget.column === 'id' ? item.repairTarget.value === record.id
                : record.fields[item.repairTarget.column]?.value === item.repairTarget.value)))
          // 旧 SQL 拒绝只能由本次明确确认的目标字段解决，不能借用历史确认。
          || !target.fields.every(field => record.fields[field]
            && confirmedThisReceipt.has(`${target.module}:${record.id}:${field}`))) continue;
        writeProblems.delete(key);
        sqlRepairTargets.delete(key);
      }
    };
    const terminalIssues = (): AgentSubagentUnresolvedIssue_ACU[] => {
      if (!writeAttempted) return [];
      const issues = new Map(writeProblems);
      if (writeStateUnknown) {
        issues.set('write_state', { module: writes[0], source: 'invoke_failed', path: 'write_state',
          message: 'Trạng thái lưu theo cột hoặc bù trừ chưa được xác nhận, phải đọc lại tư liệu chuẩn' });
      }
      const folded = readAgentModuleFoldState_ACU(input.resolveContext.chat);
      if (folded.salvaged || folded.candidates.some(item => !item.valid)) {
        issues.set('frame', { module: writes[0], source: 'invoke_failed', path: 'frame', message: 'Khung tư liệu bị hỏng, không thể xác nhận đã hoàn tất theo cột' });
      } else {
        // 可唯一定位的旧 SQL 拒绝转为字段缺口，跨派工后仍能与合法回执精确对账。
        for (const [key, target] of sqlRepairTargets) {
          const problem = issues.get(key);
          const matches = Object.values(folded.fields.records[target.module] ?? {}).filter(record =>
            target.column === 'id' ? record.id === target.value : record.fields[target.column]?.value === target.value);
          if (!problem || matches.length !== 1) continue;
          issues.delete(key);
          for (const field of target.fields) {
            const path = `${target.module}#${matches[0].id}.${field}`;
            if (!issues.has(path)) issues.set(path, { ...problem, module: target.module, id: matches[0].id, path });
          }
        }
        for (const [key, proof] of operationOnlyProofs) {
          const record = folded.fields.records[proof.module]?.[proof.id];
          const row = folded.snapshot[proof.module].find(item => item.id === proof.id);
          if (writeStateUnknown || folded.snapshot.revisions[proof.module] !== proof.revision
            || !row || row.retired || (record && record.status !== 'complete')) {
            issues.set(`${key}.operationOnly`, { module: proof.module, id: proof.id, source: 'transaction_rejected',
              path: `${key}.operationOnly`, message: AGENT_OPERATION_ONLY_PENDING_MESSAGE_ACU });
          }
        }
        for (const module of writes) for (const record of Object.values(folded.fields.records[module] ?? {})) {
          if (record.status !== 'partial') continue;
          for (const field of record.missingFields) issues.set(`${module}#${record.id}.${field}`, { module,
            source: 'transaction_rejected', id: record.id, path: `${module}#${record.id}.${field}`, message: `Cột bắt buộc ${field} chưa được nộp` });
        }
        for (const key of confirmedFields) {
          const [module, id, field] = key.split(':') as [AgentWritableModule_ACU, string, string];
          const record = folded.fields.records[module]?.[id];
          if (!record?.fields[field]) issues.set(`${module}#${id}.${field}`, { module, id, source: 'invoke_failed',
            path: `${module}#${id}.${field}`, message: 'Biên nhận ghi chưa được xác nhận trong tư liệu chuẩn hiện tại' });
        }
      }
      return [...issues.values()];
    };
    let protocolRejections = 0;
    let attempt = 0;
    let lastReason = '';
    let committedWriteObserved = false;
    // 本次派工的累计用量。只有每次已观测调用都报告某字段时，该字段才具备可求和的完整性。
    let usageTotal: AiUsageMetadata_ACU | null = null;
    const addCompleteCount = (current: number | undefined, incoming: number | undefined): number | undefined => (
      current !== undefined && incoming !== undefined ? current + incoming : undefined
    );
    const callOptions: ContinuationInternalAiCallOptions_ACU = {
      promptCacheEnabled: true,
      // 每次派工的对话全新；命名空间按角色和可用工具稳定划分，不跟随尝试号。
      cacheScope: `sub-${definition.name}`,
      cacheTools: nativeMode
        ? [...accessProfile.tools, ...(input.writeSql && writes.length ? ['write_sql', ...writes.map(module => `module:${module}`)] : []), AGENT_SUBMIT_TOOL_NAME_ACU]
        : ['mode:json', ...(input.writeSql && writes.length ? writes.map(module => `module:${module}`) : [])],
      tools: nativeMode ? [...agentNativeTools_ACU([...accessProfile.tools, ...(input.writeSql && writes.length ? ['write_sql' as const] : [])]), continuationSubmitTool_ACU(definition.kind)] : [],
      minOutputTokens: CONTINUATION_ROLE_OUTPUT_TOKEN_FLOORS_ACU[definition.promptKey],
      onUsage: usage => {
        usageTotal = usageTotal
          ? {
            promptTokens: addCompleteCount(usageTotal.promptTokens, usage.promptTokens),
            completionTokens: addCompleteCount(usageTotal.completionTokens, usage.completionTokens),
            cachedTokens: addCompleteCount(usageTotal.cachedTokens, usage.cachedTokens),
            cacheWriteTokens: addCompleteCount(usageTotal.cacheWriteTokens, usage.cacheWriteTokens),
          }
          : {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            cachedTokens: usage.cachedTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
          };
      },
    };
    // 调用总数上界 = 首轮 + 读取轮 + 写轮 + 协议重试 + 额度用尽后的最后通牒轮 + 契约续写/修补轮。到界仍未交付即失败。
    const contractKind = definition.kind === 'arc' || definition.kind === 'maintain';
    const maxContinuations = contractKind ? AGENT_CONTRACT_CONTINUATION_ROUNDS_ACU : 0;
    const maxCalls = 1 + maxToolRounds + maxWriteRounds + retries + 1 + maxContinuations;
    // 契约草稿累积：截断或单条非法时不整份重来，先收下合法条目，再只向模型索要剩余/修正条目。
    let accumulated: AgentMaintainerOutput_ACU | null = null;
    let continuationsUsed = 0;
    // 跨轮未清偿的被拒条目：模型在续写里没有重发修正版就不能算完成，否则条目会被静默丢掉。
    let outstanding: AgentContractRejection_ACU[] = [];
    const emptyPatchProofs = new Map<string, AgentEmptyPatchConfirmation_ACU>();
    const confirmEmptyPatches = (output: AgentMaintainerOutput_ACU, rejected: readonly AgentContractRejection_ACU[], truncated: boolean): AgentEmptyPatchConfirmation_ACU[] => {
      if (writeStateUnknown || truncated || !output.summary.trim() || acceptedKeys(output).size
        || output.delta.constraintProposals.length || terminalIssues().length) return [];
      const folded = readAgentModuleFoldState_ACU(input.resolveContext.chat);
      if (folded.salvaged || folded.candidates.some(item => !item.valid)) return [];
      const proofSnapshot = { ...folded.snapshot,
        pendingFixes: [...folded.snapshot.pendingFixes, ...(input.pendingFixes ?? [])] };
      const proofs = confirmAgentEmptyPatchPending_ACU(proofSnapshot, folded.fields, revisionWindow,
        rejected.filter(item => item.rejectionKind === 'empty_patch' && item.revision !== undefined)
          .map(item => ({ module: item.module, id: item.id, revision: item.revision! })));
      return proofs.filter(proof => writes.includes(proof.module) && !rejected.some(item => item.module === proof.module
        && (item.rejectionKind !== 'empty_patch' || item.id !== proof.id)));
    };
    const acceptedKeys = (output: AgentMaintainerOutput_ACU): Set<string> => new Set([
      ...[...output.delta.hooks, ...output.delta.hookPatches].map(item => `hooks:${item.id}`),
      ...[...output.delta.infoGap, ...output.delta.infoGapPatches].map(item => `infoGap:${item.id}`),
      ...[...output.delta.storyArc, ...output.delta.storyArcPatches].map(item => `storyArc:${item.id}`),
      ...[...output.delta.chronology, ...output.delta.chronologyPatches].map(item => `chronology:${item.id}`),
    ]);
    const deliverContract = (
      output: AgentMaintainerOutput_ACU,
      rejected: readonly AgentContractRejection_ACU[] = [],
      truncated = false,
    ): AgentSubagentRunResult_ACU => {
      const accepted = [...new Set([...acceptedKeys(output), ...confirmedFields])];
      // 独立核对交付可以撤回旧的纯系统字段操作，但不能替代未保存的业务写集。
      if (!writeStateUnknown && !rejected.length && !truncated && !acceptedKeys(output).size
        && !output.delta.constraintProposals.length) {
        const folded = readAgentModuleFoldState_ACU(input.resolveContext.chat);
        for (const module of ['hooks', 'infoGap', 'chronology'] as const) {
        if (!writes.includes(module)) continue;
        const window = revisionWindow[module];
        if (!folded.salvaged && folded.candidates.every(item => item.valid)
          && window?.base === readRevisions[module] && window.head === folded.snapshot.revisions[module]
          && Object.values(folded.fields.records[module] ?? {}).every(record => record.status === 'complete')) {
          const ids = new Set<string>();
          for (const fix of folded.snapshot.pendingFixes) {
            if (fix.module !== module) continue;
            for (const issue of fix.violations) {
              if ((issue.source ?? fix.source) !== 'transaction_rejected') continue;
              const match = new RegExp(`^${module}#([^.#]+)\\.operationOnly$`).exec(issue.path);
              if (!match || issue.message !== AGENT_OPERATION_ONLY_PENDING_MESSAGE_ACU) continue;
              ids.add(match[1]);
            }
          }
          for (const proof of operationOnlyProofs.values()) if (proof.module === module
            && proof.revision >= window.base && proof.revision <= window.head) ids.add(proof.id);
          for (const target of operationOnlyTargets.values()) if (target.module === module
            && target.expectedRevision >= window.base && target.expectedRevision <= window.head) ids.add(target.id);
          for (const id of ids) {
            const row = folded.snapshot[module].find(item => item.id === id);
            const record = folded.fields.records[module]?.[id];
            if (!row || row.retired || (record && record.status !== 'complete')) continue;
            const previous = operationOnlyProofs.get(`${module}#${id}`);
            operationOnlyProofs.set(`${module}#${id}`, { module, id,
              revision: folded.snapshot.revisions[module], rejectedPaths: previous?.rejectedPaths ?? [] });
            writeProblems.delete(`${module}#${id}.operationOnly`);
          }
        }
        }
      }
      const unresolvedIssues: AgentSubagentUnresolvedIssue_ACU[] = [...terminalIssues(), ...rejected.map(item => ({
        module: item.module,
        source: 'contract_rejected' as const,
        path: item.id && !/[.#:]/.test(item.id)
          ? `${item.module}#${item.id}${item.rejectionKind === 'empty_patch' ? '.emptyPatch' : item.field ? `.${item.field}` : ''}`
          : `${item.module}[${item.index}]`,
        message: item.reason,
        ...(item.id ? { id: item.id } : {}),
        ...(item.rejectionKind && item.id && !/[.#:]/.test(item.id) ? { rejectionKind: item.rejectionKind } : {}),
        ...(item.revision !== undefined ? { revision: item.revision } : {}),
      }))];
      if (truncated) {
        for (const module of writes) {
          unresolvedIssues.push({
            module,
            source: 'truncated',
            path: module,
            message: 'Đầu ra hợp đồng bị cắt giữa chừng trong JSON, các mục ở cuối chưa được xác nhận đầy đủ',
          });
        }
      }
      const issueModules = new Set(unresolvedIssues.map(item => item.module));
      const currentFold = readAgentModuleFoldState_ACU(input.resolveContext.chat);
      const emptyPatchConfirmed = !unresolvedIssues.length
        ? [...new Map([...emptyPatchProofs.values(), ...confirmEmptyPatches(output, [], truncated)]
          .map(proof => [`${proof.module}:${proof.id}:${proof.rejectedRevision}`, proof] as const)).values()]
          .filter(proof => !writeStateUnknown && !currentFold.salvaged && currentFold.candidates.every(item => item.valid)
            && currentFold.snapshot.revisions[proof.module] === proof.revision)
        : [];
      const fieldConfirmation = !writeStateUnknown && !currentFold.salvaged && currentFold.candidates.every(item => item.valid)
        ? { keys: [...confirmedFieldRevisions].filter(([key, revision]) => {
          const [module, id, field] = key.split(':') as [AgentWritableModule_ACU, string, string];
          return writes.includes(module) && currentFold.fields.records[module]?.[id]?.fields[field]?.revision === revision
            && !unresolvedIssues.some(issue => issue.path === `${module}#${id}.${field}`);
        }).map(([key]) => key), revisions: { ...currentFold.snapshot.revisions } }
        : undefined;
      const moduleCompletion: AgentSubagentRunResult_ACU['moduleCompletion'] = {};
      for (const module of writes) {
        const hasAccepted = accepted.some(key => key.startsWith(`${module}:`));
        moduleCompletion[module] = issueModules.has(module)
          ? (hasAccepted ? 'partial' : 'failed')
          : (hasAccepted ? 'complete_changed' : 'complete_no_change');
      }
      const changed = accepted.length > 0 || output.delta.constraintProposals.length > 0;
      const completion: NonNullable<AgentSubagentRunResult_ACU['completion']> = unresolvedIssues.length
        ? (writeAttempted ? 'failed' : changed ? 'partial' : 'failed')
        : (changed ? 'complete_changed' : 'complete_no_change');
      if (writeAttempted && unresolvedIssues.length) for (const module of writes) {
        if (moduleCompletion[module] === 'partial') moduleCompletion[module] = 'failed';
      }
      return {
      agentName: definition.name,
      kind: definition.kind,
      writes,
      arc: definition.kind === 'arc' && completion !== 'failed' ? output : null,
      maintainer: definition.kind === 'maintain' && completion !== 'failed' ? output : null,
      planner: null,
      reviewer: null,
      researcher: null,
      requirements: null,
      completion,
      moduleCompletion,
      unresolvedIssues,
      fieldConfirmation,
      emptyPatchConfirmed,
      operationOnlyConfirmed: [...operationOnlyProofs.values()].filter(proof => !writeStateUnknown
        && !unresolvedIssues.some(issue => issue.module === proof.module)),
      acceptedKeys: accepted,
      iterations: attempt,
      attempts: attempt,
      expandedReads: [...expandedReads],
      readRevisions,
      usage: usageTotal,
      usedFieldWrites,
      };
    };

    for (let call = 0; call < maxCalls; call += 1) {
      const identity = input.createIdentity(definition.name, attempt);
      attempt += 1;
      if (!input.isCurrent(identity)) {
        throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Yêu cầu của agent phụ đã hết hiệu lực', false));
      }
      // 传输错误（502/网络抖动）按设置延时重试；协议/契约拒绝仍走小循环内的对话级立即重试。
      const requestSnapshot = await renderRequestSnapshot();
      const requestBody = assembleAgentPrompt_ACU([...baseMessages, ...(trailingPrefill ? [trailingPrefill] : [])], [...(input.mainHistory ?? []), ...transcript],
        `${requestSnapshot}\n\n${renderReadBudgetNote(toolRoundsUsed)}`);
      const requestMessages = nativeMode
        ? withNativeToolThinkPrefill_ACU(requestBody)
        : withJsonTailPrefill_ACU(requestBody);
      // 容量门禁在传输重试之外：超限是确定性失败，不得被当作传输错误重发。
      gate.defaultReadFenceTokens = await this.measureFinalRequestCapacity_ACU(requestMessages, input.settings.agentHistoryTokenBudget, callOptions, definition.name);
      const raw = await callContinuationInternalAiWithRetry_ACU(
        () => this.dependencies.callInternalAi(
          requestMessages,
          input.preset,
          identity,
          input.signal,
          callOptions,
        ),
        {
          transportRetries: retries,
          retryDelaySeconds: input.settings.retryDelaySeconds,
          isCurrent: () => input.isCurrent(identity) && !input.signal?.aborted,
        },
      );
      if (!input.isCurrent(identity)) {
        throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Kết quả của agent phụ đã hết hiệu lực', false));
      }
      const turn = normalizeAgentModelReply_ACU(raw);
      const nativeCalls: AiNativeToolCall_ACU[] = turn.toolCalls;
      const protocolText = typeof raw === 'string' || raw == null ? String(raw ?? '') : turn.content;
      const rawText = protocolText.trim();

      // 函数调用参数保留原生 ID；权限和领域校验仍由对应的解析器执行。submit 只能单独调用。
      let toolCalls: ReturnType<typeof parseAgentWritableToolCalls_ACU>;
      let submitText: string | null = null;
      // 回灌反馈：工具模式给每个函数调用配一条回执，json 模式用普通 user 消息。
      const pushFeedback = (feedback: string): void => {
        if (nativeMode && nativeCalls.length) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, nativeCalls.map(() => feedback)));
        else transcript.push({ role: 'assistant', content: rawText || '(đầu ra rỗng)' }, { role: 'user', content: feedback });
      };
      const pushToolResults = (results: readonly string[]): void => {
        if (nativeMode) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, results));
        else transcript.push({ role: 'assistant', content: rawText || '(đầu ra rỗng)' }, { role: 'user', content: `【工具结果】\n${results.join('\n\n')}` });
      };
      try {
        if (nativeMode) {
          if (!nativeCalls.length) throw new Error('Ở chế độ công cụ phải gọi hàm: đọc và ghi dùng hàm tương ứng, giao kết quả thì gọi submit, đừng xuất văn bản JSON');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(nativeCalls), [AGENT_SUBMIT_TOOL_NAME_ACU]);
          if (split.decision) submitText = submitPayloadText_ACU(split.decision.payload);
          toolCalls = split.tools.length ? split.tools.map(({ call, payload }) => {
          if (isResearch && ['encyclopedia_search', 'encyclopedia_read', 'web_search', 'web_read'].includes(call.name) && payload.notes !== undefined) {
            const notes = parseAgentResearcherWorkingNotes_ACU(JSON.stringify({ action: call.name, notes: payload.notes }), '');
            for (const note of notes) if (!researchWorkingNotes.includes(note)) researchWorkingNotes.push(note);
            compactResearchTranscript();
          }
          if (call.name === 'write_sql') {
            // 兼容共享工具声明的可选证据参数；续写仍只按 SQL 与角色权限提交。
            if (!input.writeSql || !writes.length || typeof payload.sql !== 'string' || !payload.sql.trim()
              || Object.keys(payload).some(key => !['action', 'sql', 'evidenceRefs'].includes(key))) throw new Error('write_sql chưa được cấp quyền hoặc tham số không hợp lệ');
            return { kind: 'write_sql' as const, sql: payload.sql.trim() };
          }
          const { notes: _notes, ...argumentsWithoutNotes } = payload;
          if (['encyclopedia_search', 'encyclopedia_read', 'web_search', 'web_read'].includes(call.name)) {
            if (!isResearch) throw new Error(`Công cụ ra mạng ${call.name} chưa được cấp quyền`);
            return parseAgentWebToolCall_ACU(argumentsWithoutNotes);
          }
          if (!authorizedToolNames.has(call.name)) throw new Error(`Công cụ ${call.name} chưa được profile của vai trò hiện tại cấp quyền`);
          if (call.name === 'read' && (definition.kind === 'compose' || (ownReads && !ownReads.length))) throw new Error('Vai trò hiện tại chưa được cấp quyền đọc cục bộ');
          if (_notes !== undefined && !isResearch) throw new Error('Vai trò không nghiên cứu không được truyền notes');
          const parsed = parseAgentToolCall_ACU(argumentsWithoutNotes);
          if (parsed.kind !== call.name) throw new Error('Tên công cụ và hành động không khớp');
          return parsed;
          }) : null;
        } else {
          if (nativeCalls.length) throw new Error('Hiện ở chế độ JSON, đừng gọi hàm; hãy viết hành động thành đối tượng JSON để xuất');
          toolCalls = input.writeSql && writes.length
            ? parseAgentWritableToolCalls_ACU(protocolText, prefill, isResearch)
            : isResearch ? parseAgentResearcherToolCalls_ACU(protocolText, prefill) : parseAgentSubagentToolCalls_ACU(protocolText, prefill);
          if (toolCalls && isResearch) {
            for (const note of parseAgentResearcherWorkingNotes_ACU(protocolText, prefill)) if (!researchWorkingNotes.includes(note)) researchWorkingNotes.push(note);
          }
        }
      } catch (error) {
        protocolRejections += 1;
        if (protocolRejections > retries) {
          if (writeAttempted) throw subagentFailed_ACU('Sau khi ghi, số lần thử lại giao thức công cụ đã cạn, bảo trì theo cột chưa hoàn tất', false, {
            agentName: definition.name, acceptedKeys: [...confirmedFields], unresolvedIssues: [
              ...terminalIssues(), { module: writes[0], source: 'protocol_failed', path: 'write_sql', message: compactAgentProtocolError_ACU(error) },
            ],
          });
          throw error;
        }
        const reason = `Hành động công cụ chưa được thực thi: ${compactAgentProtocolError_ACU(error)}. ${nativeMode ? 'Hãy sửa lệnh gọi hàm rồi thử lại.' : 'Hãy sửa action / sql rồi thử lại.'}`;
        pushFeedback(reason);
        continue;
      }
      if (toolCalls) {
        // 读取一次型角色只按成功批次计额：失败批次不占额度、修正后可重试；同轮共享额度用完同样拒绝。
        const readsAllowed = readOnceKind
          ? maxToolRounds > 0 && !gate.successfulReadBatch && !(gate.readRoundKey && gate.readRoundState?.successfulReadBatches.has(gate.readRoundKey))
          : toolRoundsUsed < maxToolRounds;
        if (!readsAllowed && toolCalls.every(item => item.kind !== 'write_sql')) {
          const exhausted = isResearch
            ? `Số vòng công cụ đã dùng hết (giới hạn ${maxToolRounds} vòng). Hãy dựa trên các trang đã tải được mà ${nativeMode ? 'gọi riêng submit để giao' : 'xuất riêng JSON hợp đồng'}; thực thể không tra được thì liệt kê trung thực trong summary, không được ngụy tạo.\n\n${renderReadBudgetNote(toolRoundsUsed)}`
            : readOnceKind
              ? `read-once-exhausted: số vòng đọc đã dùng hết (mỗi lượt tối đa một lô đọc thành công, giới hạn lần này ${maxToolRounds}), không thể read nữa. ${input.writeSql && writes.length && maxWriteRounds - writeRoundsUsed > 0 ? nativeMode ? 'Nếu có thay đổi chứng thực được thì gọi riêng write_sql để ghi đủ; ' : 'Nếu có thay đổi chứng thực được thì xuất riêng {"action":"write_sql","sql":"toàn bộ câu lệnh"} để ghi đủ; ' : ''}Hãy dựa trên tư liệu hiện có mà ${nativeMode ? 'gọi riêng submit để giao' : 'giao riêng JSON hợp đồng'}; thông tin thật sự thiếu thì đánh dấu "thiếu thông tin", không được ngụy tạo.\n\n${renderReadBudgetNote(toolRoundsUsed)}`
              : `Số vòng read/search đã dùng hết (giới hạn ${maxToolRounds} vòng). Hãy dựa trên tư liệu hiện có mà ${nativeMode ? 'gọi riêng submit để giao' : 'xuất riêng JSON hợp đồng'}; thông tin thật sự thiếu thì đánh dấu "thiếu thông tin" trong kết quả, không được ngụy tạo.\n\n${renderReadBudgetNote(toolRoundsUsed)}`;
          // 唯一批次已用过时仍结算一次：只回报重复/收窄地址的如实提示或 read-once-exhausted，不注入任何新正文。
          const localReads = readOnceKind && maxToolRounds > 0
            ? toolCalls.filter((item): item is AgentToolCall_ACU => item.kind === 'read' || item.kind === 'search')
            : [];
          const notice = localReads.length
            ? await this.executeToolCalls_ACU(localReads, input.resolveContext, gate, expandedReads, ownReads, allowSearch, true)
            : '';
          pushToolResults(toolCalls.map((_, index) => index === 0 && notice ? `${notice}\n\n${exhausted}` : exhausted));
          continue;
        }
        if (readsAllowed && !readOnceKind && toolCalls.some(item => item.kind !== 'write_sql')) toolRoundsUsed += 1;
        const perCallResults: string[] = [];
        for (let index = 0; index < toolCalls.length; index += 1) {
          const call = toolCalls[index];
          if (call.kind === 'write_sql') {
            if (writeRoundsUsed >= maxWriteRounds) {
              const exhausted = JSON.stringify({ action: 'write_sql', originalSql: call.sql, status: 'rejected', accepted: [], reason: 'Số vòng write_sql đã dùng hết',
                remainingToolRounds: maxToolRounds - toolRoundsUsed, remainingWriteRounds: 0 });
              perCallResults.push(exhausted);
              continue;
            }
            writeRoundsUsed += 1;
            writeAttempted = true;
            // 提交的 SQL 原文进会话流：用户要能看到这一轮究竟写了什么，而不只是成功或失败。
            // 同一条目在通过、被拒、宿主异常三种结局下回写，避免内容与结论分家。
            const writeEntryId = logAgentSession_ACU({ kind: 'write_sql', agentName: definition.name, status: 'running',
              title: `Nộp SQL (${call.sql.split(';').filter(part => part.trim()).length} câu lệnh)`, detail: call.sql });
            if (!input.isCurrent(identity) || input.signal?.aborted) {
              throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Yêu cầu ghi đã hết hiệu lực', false));
            }
            try {
              const receipt = await input.writeSql!({ role: definition.name, sql: call.sql, revisionWindow,
                isCurrent: () => input.isCurrent(identity) && !input.signal?.aborted, resolvePage: handle => {
                const page = pageCache.pages.get(handle.trim().toUpperCase());
                return page?.status === 'ok' && page.text ? { title: page.title, source: page.source, url: page.url, query: page.query, sourceStatus: page.status } : null;
              } });
              if (!input.isCurrent(identity) || input.signal?.aborted) throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Biên nhận ghi đã hết hiệu lực', false));
              recordWriteReceipt(receipt);
              const stale = receipt.rejected.find(item => item.path === 'chat');
              if (stale) {
                updateAgentSession_ACU(writeEntryId, { ok: false, status: 'failed', title: 'Tác vụ ghi đã hết hiệu lực', detail: stale.reason });
                throw new ContinuationValidationError_ACU(createContinuationError_ACU(
                  'CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', stale.reason, false));
              }
              // 路径之外必须带上原因：只显示 host / chat 时用户无从判断是租约失效、宿主保存失败还是字段非法。
              const rejectedPaths = receipt.rejected.map(item => item.reason ? `${item.path} (${item.reason})` : item.path).join('; ');
              updateAgentSession_ACU(writeEntryId, {
                ok: receipt.status === 'committed',
                status: receipt.status === 'committed' ? 'done' : 'failed',
                title: receipt.status === 'committed' ? (receipt.accepted.length ? `Đã lưu ${receipt.accepted.length} cột` : receipt.alreadySaved?.length ? `Đã xác nhận ${receipt.alreadySaved.length} cột đã lưu trước đó` : 'Đã xác nhận nộp') : 'Nộp bị từ chối',
                ...(rejectedPaths ? { detail: `${call.sql}\nKhông được chấp nhận: ${rejectedPaths}` } : {}),
              });
              if (receipt.status === 'committed') {
                committedWriteObserved = true;
                usedFieldWrites = true;
                input.resolveContext.moduleSnapshot = readAgentModuleSnapshot_ACU(input.resolveContext.chat);
                for (const key of gate.granted) if (key.startsWith('$FIELD:') || key.startsWith('$HOOKS_LEDGER') || key.startsWith('$INFO_GAP') || key.startsWith('$CHRONOLOGY') || key.startsWith('$STORY_ARC') || key.startsWith('$WEB_REFS')) gate.granted.delete(key);
              }
              const repair = renderWriteSqlRepair_ACU(receipt);
              const receiptText = JSON.stringify({ action: 'write_sql', originalSql: call.sql, ...receipt,
                fieldOutcome: receipt.partials === null || receipt.revisions === null ? 'Trạng thái lưu không rõ; hãy đọc trường chuẩn trước' : {
                  saved: receipt.accepted.map(item => ({ module: item.module, id: item.id, field: item.field, fieldRevision: item.revision, ...('value' in item ? { value: item.value } : {}) })),
                  alreadySaved: receipt.alreadySaved ?? [],
                  notSaved: [...receipt.partials.flatMap(item => item.missingFields.map(field => `${item.module}#${item.id}.${field}`)), ...receipt.rejected.map(item => item.path)],
                  generatedIds: [...new Set(receipt.accepted.map(item => `${item.module}#${item.id}`))],
                },
                readAddresses: [...new Set([
                  ...[...receipt.accepted, ...(receipt.partials !== null && receipt.revisions !== null ? receipt.alreadySaved ?? [] : [])].map(item => `$FIELD:${item.module}:${item.id}:${item.field}`),
                  ...(receipt.partials ?? []).map(item => `$FIELD:${item.module}:${item.id}`),
                  ...rejectedFieldReadAddresses_ACU(receipt),
                ])],
                remainingToolRounds: maxToolRounds - toolRoundsUsed, remainingWriteRounds: maxWriteRounds - writeRoundsUsed });
              const writeResult = repair ? `${receiptText}\n${repair}` : receiptText;
              perCallResults.push(writeResult);
            } catch (error) {
              if (error instanceof ContinuationValidationError_ACU && error.error.code === 'CONTINUATION_INTERNAL_REQUEST_STALE') throw error;
              writeStateUnknown = true;
              updateAgentSession_ACU(writeEntryId, { ok: false, status: 'failed', title: 'Nộp thất bại, không thể xác nhận trạng thái lưu',
                detail: `${call.sql}\nNguyên nhân thất bại: ${compactAgentProtocolError_ACU(error)}` });
              writeProblems.set('host', { module: writes[0], source: 'invoke_failed', path: 'host', message: compactAgentProtocolError_ACU(error) });
              const unknownResult = `${JSON.stringify({ action: 'write_sql', originalSql: call.sql, status: 'rejected', accepted: [],
                rejected: [{ path: 'host', reason: compactAgentProtocolError_ACU(error) }], partials: null, revisions: null,
                readAddresses: [], reason: compactAgentProtocolError_ACU(error),
                remainingToolRounds: maxToolRounds - toolRoundsUsed, remainingWriteRounds: maxWriteRounds - writeRoundsUsed })}\n【write_sql 补栏】Không thể xác nhận trạng thái lưu. Trước hết read khung chuẩn $FIELD:mô-đun:ID tương ứng và số hiệu chỉnh hiện tại, đừng gửi lại SQL gốc.`;
              perCallResults.push(unknownResult);
            }
          } else {
            if (!readsAllowed) {
              const denied = JSON.stringify({ action: call.kind, status: 'rejected', reason: readOnceKind ? 'read-once-exhausted' : 'Số vòng read/search đã dùng hết',
                remainingToolRounds: 0, remainingWriteRounds: maxWriteRounds - writeRoundsUsed });
              perCallResults.push(denied);
              continue;
            }
            if (call.kind === 'read' || call.kind === 'search') {
              const batch: AgentToolCall_ACU[] = [call];
              while (index + 1 < toolCalls.length) {
                const next = toolCalls[index + 1];
                if (next.kind !== 'read' && next.kind !== 'search') break;
                batch.push(next);
                index += 1;
              }
              const result = await this.executeToolCalls_ACU(batch, input.resolveContext, gate, expandedReads, ownReads, allowSearch, !isResearch && definition.kind !== 'arc',
                isResearch ? { settings: input.settings, cache: pageCache } : undefined);
              if (readOnceKind && gate.successfulReadBatch) toolRoundsUsed = 1;
              perCallResults.push(result, ...batch.slice(1).map(() => 'Lô đọc logic này đã được quyết toán thống nhất, kết quả xem ở biên nhận công cụ đầu tiên.'));
              continue;
            }
            const result = await this.executeToolCalls_ACU([call], input.resolveContext, gate, expandedReads, ownReads, allowSearch, false,
              isResearch ? { settings: input.settings, cache: pageCache } : undefined);
            perCallResults.push(result);
          }
        }
        const roundNote = maxWriteRounds ? `Số vòng write_sql còn lại ${maxWriteRounds - writeRoundsUsed} / ${maxWriteRounds}.` : '';
        const note = renderReadBudgetNote(toolRoundsUsed);
        const results = toolCalls.map((_, index) => [perCallResults[index] || '工具没有返回内容', roundNote, note].filter(Boolean).join('\n\n'));
        for (const call of nativeCalls) {
          if (isResearch && ['encyclopedia_search', 'encyclopedia_read', 'web_search', 'web_read'].includes(call.name)) researchToolCallIds.add(call.id);
        }
        pushToolResults(results);
        continue;
      }

      // 交付文本：工具模式取 submit 参数，json 模式取回复正文。
      const contractText = submitText ?? protocolText;
      try {
        if (isResearch) {
          const payload = parseAgentJsonPayload_ACU(contractText, nativeCalls.length ? '' : prefill, KIND_PAYLOAD_KEYS_ACU.research);
          if (payload.sql !== undefined) throw new Error(`sql trong bản giao cuối cùng sẽ không được thực thi; ${nativeMode ? 'hãy gọi riêng write_sql để nộp ghi, nhận biên nhận rồi gọi riêng submit để giao' : 'hãy xuất riêng {"action":"write_sql","sql":"câu lệnh"}, nhận biên nhận rồi xuất riêng JSON giao cuối cùng'}`);
          const draft = parseAgentResearcherOutput_ACU(payload);
          const researcher = resolveResearcherDraft_ACU(draft, pageCache);
          return {
            agentName: definition.name,
            kind: definition.kind,
            writes,
            arc: null,
            maintainer: null,
            planner: null,
            reviewer: null,
            researcher,
            requirements: null,
            iterations: attempt,
            usedFieldWrites,
            attempts: attempt,
            expandedReads: [...expandedReads],
            readRevisions,
            usage: usageTotal,
          };
        }
        if (contractKind) {
          const draft = parseAgentJsonPayloadDraft_ACU(contractText, nativeCalls.length ? '' : prefill, KIND_PAYLOAD_KEYS_ACU[definition.kind]);
          if (draft.payload.sql !== undefined) throw new Error(`sql trong bản giao cuối cùng sẽ không được thực thi; ${nativeMode ? 'hãy gọi riêng write_sql để nộp ghi, nhận biên nhận rồi gọi riêng submit để giao' : 'hãy xuất riêng {"action":"write_sql","sql":"câu lệnh"}, nhận biên nhận rồi xuất riêng JSON giao cuối cùng'}`);
          const parsed = parseAgentMaintainerOutputDraft_ACU(draft.payload);
          let submitReceipt: AgentModuleFieldReceipt_ACU | undefined;
          if (definition.kind === 'maintain' && input.writeSql) {
            const delta = parsed.output.delta;
            for (const [module, items, patches] of [
              ['hooks', delta.hooks, delta.hookPatches], ['infoGap', delta.infoGap, delta.infoGapPatches],
              ['storyArc', delta.storyArc, delta.storyArcPatches], ['chronology', delta.chronology, delta.chronologyPatches],
            ] as const) {
              if (writes.includes(module)) continue;
              for (const [index, item] of [...items, ...patches].entries()) parsed.rejected.push({
                module, index, id: item.id, reason: 'Mô-đun này không nằm trong quyền ghi lần này',
              });
              items.length = 0; patches.length = 0;
            }
            const folded = readAgentModuleFoldState_ACU(input.resolveContext.chat);
            const sql = maintainerDeltaSql_ACU(delta, folded.snapshot, folded.fields, readRevisions);
            if (sql) {
              if (writeRoundsUsed >= maxWriteRounds) {
                return deliverContract(blankMaintainerOutput_ACU(parsed.output.summary),
                  [...parsed.rejected, { module: 'hooks', index: 0, id: '', reason: 'Số vòng ghi bảo trì đã dùng hết, tập ghi chưa được lưu' }], draft.truncated);
              }
              writeRoundsUsed += 1;
              writeAttempted = true;
              if (!input.isCurrent(identity) || input.signal?.aborted) throw new ContinuationValidationError_ACU(
                createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Bản nộp bảo trì đã hết hiệu lực', false));
              try {
                submitReceipt = await input.writeSql({ role: definition.name, sql, revisionWindow, expectedRevisions: readRevisions,
                  isCurrent: () => input.isCurrent(identity) && !input.signal?.aborted, resolvePage: () => null });
                if (!input.isCurrent(identity) || input.signal?.aborted || submitReceipt.rejected.some(item => item.path === 'chat')) {
                  throw new ContinuationValidationError_ACU(createContinuationError_ACU(
                    'CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Đích của bản nộp bảo trì đã hết hiệu lực', false));
                }
                recordWriteReceipt(submitReceipt);
                if (submitReceipt.status === 'committed') {
                  committedWriteObserved = true;
                  usedFieldWrites = true;
                  writeProblems.delete('submit');
                  input.resolveContext.moduleSnapshot = readAgentModuleSnapshot_ACU(input.resolveContext.chat);
                  for (const key of gate.granted) if (/^\$(FIELD:|HOOKS_LEDGER|INFO_GAP|CHRONOLOGY)/.test(key)) gate.granted.delete(key);
                } else if (!submitReceipt.rejected.length) {
                  writeProblems.set('submit', { module: writes[0], source: 'invoke_failed', path: 'submit', message: 'Tập ghi bảo trì chưa được xác nhận đã lưu' });
                }
              } catch (error) {
                if (error instanceof ContinuationValidationError_ACU && error.error.code === 'CONTINUATION_INTERNAL_REQUEST_STALE') throw error;
                writeStateUnknown = true;
                writeProblems.set('host', { module: writes[0], source: 'invoke_failed', path: 'host', message: compactAgentProtocolError_ACU(error) });
              }
              // 候选不是保存证明；后续交付只凭权威字段回执，调用方不得重复应用原写集。
              parsed.output.delta = { ...blankMaintainerOutput_ACU('').delta, constraintProposals: delta.constraintProposals };
            }
          }
          // 新拒绝晚于旧回执；该字段必须再次获得确认，不能复用前一次保存证明。
          for (const item of parsed.rejected) if (item.id && item.field) {
            confirmedFieldRevisions.delete(`${item.module}:${item.id}:${item.field}`);
          }
          accumulated = accumulated ? mergeAgentMaintainerOutputs_ACU(accumulated, parsed.output) : parsed.output;
          // 上一轮被拒的条目：本轮重发了合法版本即清偿；没有 id 的条目无法匹配，本轮过后不再追讨。
          const nowAccepted = acceptedKeys(parsed.output);
          const savedThisSubmit = new Set((submitReceipt?.status === 'committed'
            ? [...submitReceipt.accepted, ...(submitReceipt.alreadySaved ?? [])] : [])
            .map(item => `${item.module}:${item.id}`));
          const live = readAgentModuleFoldState_ACU(input.resolveContext.chat);
          const canConfirmFields = !writeStateUnknown && !live.salvaged && live.candidates.every(item => item.valid);
          const currentProblems = terminalIssues();
          const candidates = {
            hooks: [...parsed.output.delta.hooks, ...parsed.output.delta.hookPatches],
            infoGap: [...parsed.output.delta.infoGap, ...parsed.output.delta.infoGapPatches],
            storyArc: [...parsed.output.delta.storyArc, ...parsed.output.delta.storyArcPatches],
            chronology: [...parsed.output.delta.chronology, ...parsed.output.delta.chronologyPatches],
          };
          outstanding = outstanding.filter(item => {
            if (!item.id) return false;
            if (item.field && canConfirmFields) {
              const revision = confirmedFieldRevisions.get(`${item.module}:${item.id}:${item.field}`);
              if (revision !== undefined && live.fields.records[item.module]?.[item.id]?.fields[item.field]?.revision === revision
                && !currentProblems.some(issue => issue.path === `${item.module}#${item.id}.${item.field}`)) return false;
            }
            if (!item.field && savedThisSubmit.has(`${item.module}:${item.id}`) && canConfirmFields
              && live.fields.records[item.module]?.[item.id]?.status === 'complete'
              && !currentProblems.some(issue => issue.path === `${item.module}#${item.id}`
                || issue.path.startsWith(`${item.module}#${item.id}.`))) return false;
            if (!nowAccepted.has(`${item.module}:${item.id}`)) return true;
            return !!item.field && !candidates[item.module].some(candidate => candidate.id === item.id
              && Object.prototype.hasOwnProperty.call(candidate, item.field!));
          });
          // 只允许后续独立交付撤回已拒空操作；当前新拒绝、截断或未保存业务写集不能被无变化掩盖。
          if (!parsed.rejected.length && parsed.output.summary.trim()) {
            const proofs = confirmEmptyPatches(accumulated, outstanding, draft.truncated);
            for (const proof of proofs) emptyPatchProofs.set(`${proof.module}:${proof.id}:${proof.rejectedRevision}`, proof);
            outstanding = outstanding.filter(item => item.rejectionKind !== 'empty_patch'
              || !proofs.some(proof => proof.module === item.module && proof.id === item.id && proof.rejectedRevision === item.revision));
          }
          const pending: AgentContractRejection_ACU[] = [...outstanding, ...parsed.rejected.map(item => ({ ...item, revision: readRevisions[item.module] }))];
          outstanding = pending;
          // 总纲尚未建立时，一份没有任何 storyArc 写入的“成功”输出等于什么都没做——模型常把卷台阶写进 summary。
          // 这种空写入不能交回主 Agent 白耗它的派工上限，先在这里索要真正的条目。
          const emptyArcBootstrap = definition.kind === 'arc'
            && !hasActiveStoryArc_ACU(input.resolveContext.moduleSnapshot)
            && !accumulated.delta.storyArc.length
            && !accumulated.delta.storyArcPatches.length
            && !committedWriteObserved;
          if (emptyArcBootstrap && !pending.length && !draft.truncated && input.writeSql) {
            const request = renderArcSqlBootstrap_ACU(input.resolveContext.chat, maxWriteRounds - writeRoundsUsed, toolMode);
            if (continuationsUsed >= maxContinuations) {
              return deliverContract(accumulated, [{ module: 'storyArc', index: 0, id: '', reason: request }]);
            }
            continuationsUsed += 1;
            pushFeedback(request);
            continue;
          }
          if (emptyArcBootstrap && !pending.length && !draft.truncated) {
            pending.push({ module: 'storyArc', index: 0, id: '', reason: 'Tổng cương chưa được lập nhưng delta.storyArc rỗng. Chữ trong summary sẽ không được ghi vào đâu cả: phải đưa vào delta.storyArc 1 upsert scope=story và các upsert scope=volume theo số lượng trong 【总纲卷数计划】, mỗi mục đều kèm title / direction / escalation / withheld / status và các trường hợp đồng cấp tập (id có thể bỏ qua, hệ thống tự đánh số)' });
          }
          if (definition.kind === 'maintain' && submitReceipt && terminalIssues().length) {
            if (writeStateUnknown || continuationsUsed >= maxContinuations || writeRoundsUsed >= maxWriteRounds) {
              return deliverContract(accumulated, pending, draft.truncated);
            }
            continuationsUsed += 1;
            pushFeedback([submitReceipt ? JSON.stringify({ ...submitReceipt, action: 'submit' }) : '',
              `Chỉ sửa các mục chưa hoàn tất sau: ${JSON.stringify(terminalIssues())}`,
              pending.length ? `Định dạng giao vẫn cần sửa: ${JSON.stringify(pending)}` : '',
              draft.truncated ? 'Phần cuối bản giao bị cắt; chỉ bổ sung các mục còn lại chưa nộp.' : '',
              'Các cột đã lưu không được gửi lại; theo ID thật của biên nhận chỉ nộp patch cho các trường thất bại. Dùng summary + delta để giao bản sửa một lần, chương trình lưu thành công thì kết thúc ngay, không cần xác nhận thêm.',
            ].filter(Boolean).join('\n'));
            continue;
          }
          if (!draft.truncated && !pending.length) return deliverContract(accumulated);
          if (continuationsUsed >= maxContinuations) {
            if (pending.length) {
              return deliverContract(accumulated, pending, draft.truncated);
            }
            // 只剩截断：保留已验证条目，但显式返回 partial/failed，不能冒充完整交付。
            return deliverContract(accumulated, [], true);
          }
          continuationsUsed += 1;
          pushFeedback(definition.kind === 'maintain' && input.writeSql
            ? [draft.truncated ? 'Phần cuối bản giao bị cắt; chỉ bổ sung các mục còn lại chưa nộp.' : 'Chỉ sửa các mục giao sau.',
              `Mục chờ sửa: ${JSON.stringify(pending)}`,
              `Các cột đã lưu: ${[...confirmedFields].join(', ') || 'không có'}; không được gửi lại.`,
              nativeMode ? 'Gọi riêng submit, dùng summary + delta để nộp bản sửa một lần.'
                : 'Xuất riêng đối tượng giao hoàn chỉnh gồm summary + delta, nộp bản sửa một lần.',
            ].join('\n')
            : renderAgentContractContinuationRequest_ACU(accumulated, pending, draft.truncated, toolMode));
          continue;
        }
        const payload = parseAgentJsonPayload_ACU(contractText, nativeCalls.length ? '' : prefill, KIND_PAYLOAD_KEYS_ACU[definition.kind]);
        return {
          agentName: definition.name,
          kind: definition.kind,
          writes,
          arc: null,
          maintainer: null,
          planner: definition.kind === 'plan' ? parseAgentPlannerOutput_ACU(payload) : null,
          reviewer: definition.kind === 'review' ? parseAgentReviewerOutput_ACU(payload) : null,
          researcher: null,
          requirements: null,
          composer: definition.kind === 'compose' ? parseAgentComposerOutput_ACU(payload) : null,
          iterations: attempt,
          usedFieldWrites,
          attempts: attempt,
          expandedReads: [...expandedReads],
          readRevisions,
          usage: usageTotal,
        };
      } catch (error) {
        if (error instanceof ContinuationValidationError_ACU && (error.error.code === 'CONTINUATION_AGENT_SUBAGENT_FAILED' || error.error.code === 'CONTINUATION_INTERNAL_REQUEST_STALE')) throw error;
        lastReason = compactAgentProtocolError_ACU(error);
        protocolRejections += 1;
        if (protocolRejections > retries) {
          throw subagentFailed_ACU(`${definition.name} trả về ${retries + 1} lần liên tiếp không đúng hợp đồng`, false, {
            agentName: definition.name, lastReason,
            ...(writeAttempted ? { acceptedKeys: [...confirmedFields], unresolvedIssues: [
              ...terminalIssues(), { module: writes[0], source: 'protocol_failed', path: 'contract', message: lastReason },
            ] } : {}),
          });
        }
        // 被拒原文也要留在小循环对话里：模型必须看到自己上一次写了什么才能真正修正。
        const readRepair = maxToolRounds > toolRoundsUsed && (ownReads.length || isResearch)
          ? nativeMode
            ? 'Khi thiếu tư liệu có thể gọi trước công cụ tra cứu đang được cấp quyền, tuân thủ ngân sách đọc ở cuối.'
            : `Khi thiếu tư liệu có thể xuất trước {"action":"read","reads":["địa chỉ được cấp quyền"]}${allowSearch ? ' hoặc {"action":"search","query":"từ khóa","scope":["worldbook"]}' : ''}${isResearch ? ', tra cứu ra mạng thì xuất hành động JSON theo danh mục công cụ' : ''}, tuân thủ ngân sách đọc ở cuối.`
          : 'Hạn mức đọc đã dùng hết hoặc vai trò này không có quyền tra cứu, hãy xử lý dựa trên tư liệu đã chuẩn bị, không tra cứu nữa.';
        const writeRepair = definition.kind === 'maintain' && input.writeSql && writes.length
          ? maxWriteRounds > writeRoundsUsed
            ? 'Khi thật sự cần bảo trì thì dùng summary + delta nộp toàn bộ thay đổi một lần; chỉ bổ sung các trường thất bại, không gửi lại các cột đã lưu.'
            : 'Số vòng ghi bảo trì đã dùng hết, không nộp tập ghi nữa, hãy báo cáo trung thực các chỗ thiếu.'
          : input.writeSql && writes.length
          ? maxWriteRounds > writeRoundsUsed
            ? nativeMode
              ? 'Khi thật sự cần ghi hoặc bổ sung cột thì gọi riêng write_sql, đặt toàn bộ câu lệnh vào cùng một tham số sql; nhận biên nhận rồi mới giao.'
              : 'Khi thật sự cần ghi hoặc bổ sung cột thì xuất riêng {"action":"write_sql","sql":"toàn bộ câu lệnh"}; nhận biên nhận rồi mới giao.'
            : 'Số vòng write_sql đã dùng hết, không nộp ghi nữa, hãy báo cáo trung thực các chỗ thiếu chưa hoàn tất.'
          : '';
        const deliveryRepair = nativeMode
          ? 'Khi tư liệu và việc ghi đã hoàn tất thì gọi riêng submit để giao, không chung một lần trả lời với tra cứu hoặc ghi.'
          : 'Khi tư liệu và việc ghi đã hoàn tất thì xuất riêng JSON cuối cùng đúng hợp đồng, không kèm sql, không chung một lần trả lời với hành động công cụ.';
        const protocolRepair = `Đầu ra lần trước của bạn không được chấp nhận. Lý do: ${lastReason}\n${readRepair}\n${writeRepair}\n${deliveryRepair}`;
        pushFeedback(protocolRepair);
      }
    }

    if (writeAttempted) {
      const issues = terminalIssues();
      throw subagentFailed_ACU(`${definition.name} đã cạn ngân sách công cụ/mô hình, bảo trì theo cột chưa hoàn tất`, false, {
        agentName: definition.name, acceptedKeys: [...confirmedFields], unresolvedIssues: issues,
        remainingToolRounds: Math.max(0, maxToolRounds - toolRoundsUsed), remainingWriteRounds: Math.max(0, maxWriteRounds - writeRoundsUsed), lastReason,
      });
    }
    throw subagentFailed_ACU(`${definition.name} không giao đầu ra hợp đồng trong ${maxCalls} lần gọi`, false, { agentName: definition.name, lastReason, toolRoundsUsed });
  }

  /**
   * 运行一次发送前最终审查。它不接受普通 delegation，且固定证据与补充读取共用 finalReview 独立门禁。
   */
  async runFinalReview(input: AgentFinalReviewRunInput_ACU): Promise<AgentFinalReviewRunResult_ACU> {
    const evidence = buildAgentFinalReviewEvidence_ACU(input);
    const gate: SubagentGate_ACU = {
      state: createAgentReadGateState_ACU(),
      config: {
        historyTokenBudget: input.settings.agentHistoryTokenBudget,
        readTokenBudget: input.settings.finalReview.readTokenBudget,
        fallbackTokens: input.settings.agentReadFallbackTokens,
      },
      granted: new Set(),
      narrowed: new Map(),
      successfulReadBatch: false,
    };
    const fixedDecision = await gateAgentReadBatch_ACU(evidence.gateItems, gate.state, gate.config, 0);
    if (!fixedDecision.allowed) {
      throw subagentFailed_ACU('Bằng chứng cố định của chung thẩm vượt ngân sách đọc độc lập, chung thẩm chưa được thực thi.', false, {
        reason: fixedDecision.reason,
        report: fixedDecision.report,
        batchTokens: fixedDecision.batchTokens,
      });
    }
    gate.state.grantedTokens += fixedDecision.batchTokens;
    for (const key of evidence.fixedReadKeys) gate.granted.add(key);

    const resolveAgentPreset = this.dependencies.resolveAgentApiPreset ?? resolveContinuationAgentApiPreset_ACU;
    const preset = resolveAgentPreset(input.settings, 'finalReviewer', 'agent_delegate');
    const toolMode: AgentToolMode_ACU = input.toolMode ?? resolveAgentToolMode_ACU('continuation', preset);
    const nativeMode = toolMode === 'tools';
    const reviewKept = keptSubagentMaterialTokens_ACU('review', []);
    const reviewSplit = splitDefaultSubagentMaterials_ACU(adaptContinuationPromptSegmentsToToolMode_ACU('finalReviewer', input.settings.agentPrompts.finalReviewer, toolMode), 'finalReviewer', toolMode);
    const reviewSegments = stripUnownedSubagentPrompt_ACU(reviewSplit.segments, reviewKept);
    const reviewResolvers = {
      $USER_INTENT: () => input.resolveContext.originInstruction || '(Người dùng chưa cung cấp yêu cầu ban đầu)',
      $USER_REQUIREMENTS: () => renderAgentUserRequirements_ACU(input.resolveContext.moduleSnapshot, input.resolveContext.originInstruction),
      $OUTLINE_WINDOW: () => renderAgentOutlineWindow_ACU(input.resolveContext),
      $STORY_ARC: () => resolveAgentReadToken_ACU('$STORY_ARC', input.resolveContext).text,
      $CHRONOLOGY: () => resolveAgentReadToken_ACU('$CHRONOLOGY', input.resolveContext).text,
      $STORY_TAIL: () => renderAgentStoryTail_ACU(input.resolveContext),
      $HOOKS_LEDGER: () => evidence.hooksLedger,
      $INFO_GAP: () => evidence.infoGap,
      $WORLDBOOK_HITS: () => evidence.worldbookEvidence,
      $AGENT_READ_MATERIALS: () => evidence.supplementalMaterials,
      $AGENT_TASK: () => input.candidateInstruction,
    };
    const rendered = await renderContinuationPrompt_ACU(reviewSegments, reviewResolvers, 'agent_delegate');
    const reviewTaskMaterial = reviewSplit.taskTemplate
      ? (await renderContinuationPrompt_ACU([{ role: 'user', content: reviewSplit.taskTemplate }], reviewResolvers, 'agent_delegate')).messages[0].content
      : '';
    const readRevisions: AgentModuleRevisions_ACU = { ...input.resolveContext.moduleSnapshot.revisions };
    const prefill = AGENT_PREFILLS_ACU.reviewer;
    const retries = normalizeContinuationInternalAiRetryLimit_ACU(input.settings.internalAiRetryLimit);
    // 终审与普通子代理同口径：设置大于 0 时只开放一个成功读取批次，读完直接给判词。
    const maxToolRounds = Math.max(0, Math.min(1, input.settings.finalReview.maxExtraReads));
    const readBudget = resolveAgentReadBudget_ACU(gate.config);
    const renderReadBudgetNote = (roundsUsed: number): string => renderSubagentReadBudgetNote_ACU({
      maxReadTokens: readBudget.effectiveMaxReadTokens,
      fallbackTokens: readBudget.effectiveFallbackTokens,
      maxToolRounds,
      toolRoundsUsed: roundsUsed,
      grantedTokens: gate.state.grantedTokens,
      readOnce: true,
    });
    // 终审与普通派工同一预算语义：首轮给出上限，每个工具批次后刷新剩余轮次与遥测；注入点必须在尾部预填充之前。
    const reviewPresent = new Set([...reviewSegments, ...(reviewSplit.taskTemplate ? [{ content: reviewSplit.taskTemplate }] : [])].flatMap(segment => segment.content.match(/\$[A-Z][A-Z0-9_]*/g) ?? [] as string[]));
    const sharedMaterialsNote = input.sharedMaterials !== undefined
      ? 'Toàn văn sổ thế giới và các kho tư liệu đã nằm trong 【本轮已备资料】. Chung thẩm không có công cụ tra cứu, hãy đưa ra phán quyết trực tiếp dựa trên các tư liệu này.'
      : '';
    const renderReviewTail = async (): Promise<string> => {
      const editable = agentSnapshotTemplate_ACU(reviewSegments, '');
      if (reviewSegments.some(segment => segment.snapshotTemplate !== undefined)) {
        const ownSnapshot = editable.trim() ? (await renderContinuationPrompt_ACU([{ role: 'system', content: editable }], reviewResolvers, 'agent_delegate')).messages[0].content : editable;
        const tokens = new Set(editable.match(/\$[A-Z][A-Z0-9_]*/g) ?? []);
        const worldbook = input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
        const injection = renderAgentWorldbookTriggeredInjection_ACU(worldbook, buildAgentWorldbookScanText_ACU(input.resolveContext));
        const readsAt = findMainSessionReadAppendix_ACU(input.mainSnapshot ?? '', injection);
        return [ownSnapshot, tokens.has('$AGENT_TASK') ? '' : `【本次终审任务】\n${input.candidateInstruction}`,
          tokens.has('$WORLDBOOK_HITS') ? '' : evidence.worldbookEvidence,
          tokens.has('$AGENT_READ_MATERIALS') ? '' : evidence.supplementalMaterials,
          readsAt >= 0 ? omitSnapshotSectionsForSubagent_ACU((input.mainSnapshot ?? '').slice(readsAt), tokens) : '',
          input.sharedMaterials ?? '', sharedMaterialsNote].filter(Boolean).join('\n\n');
      }
      const originalSnapshot = input.mainSnapshot?.trim() ? input.mainSnapshot : '';
      const worldbook = input.resolveContext.worldbook ?? buildEmptyAgentWorldbookSnapshot_ACU(false);
      const worldbookInjection = renderAgentWorldbookTriggeredInjection_ACU(worldbook, buildAgentWorldbookScanText_ACU(input.resolveContext));
      const mainReadsAt = findMainSessionReadAppendix_ACU(originalSnapshot, worldbookInjection);
      const latestSnapshot = [await renderFallbackAgentSnapshot_ACU(input.settings, input.resolveContext, toolMode), ...(mainReadsAt >= 0 ? [originalSnapshot.slice(mainReadsAt + 2)] : [])].join('\n\n');
      const reviewSnapshot = omitSnapshotSectionsForSubagent_ACU(latestSnapshot, reviewPresent, { worldbookInjection });
      return [reviewSnapshot, reviewTaskMaterial || `【本次终审任务】\n${input.candidateInstruction}`, ...(reviewTaskMaterial ? [] : [evidence.worldbookEvidence, evidence.supplementalMaterials]), input.sharedMaterials ?? '', sharedMaterialsNote].filter(Boolean).join('\n\n');
    };
    const baseMessages = rendered.messages;
    const transcript: Array<{ role: string; content: string }> = [];
    const trailingPrefill = (baseMessages[baseMessages.length - 1]?.role === 'assistant' || baseMessages[baseMessages.length - 1]?.content === USER_PREFILL_CONTENT_ACU) ? baseMessages.pop() : undefined;
    const expandedReads: string[] = [];
    let toolRoundsUsed = 0;
    let protocolRejections = 0;
    let attempt = 0;
    let lastReason = '';
    let usageTotal: AiUsageMetadata_ACU | null = null;
    const addCompleteCount = (current: number | undefined, incoming: number | undefined): number | undefined => (
      current !== undefined && incoming !== undefined ? current + incoming : undefined
    );
    const callOptions: ContinuationInternalAiCallOptions_ACU = {
      promptCacheEnabled: true,
      cacheScope: 'final-reviewer',
      cacheTools: nativeMode
        ? [...(input.sharedMaterials === undefined ? ['read'] : []), 'review', AGENT_SUBMIT_TOOL_NAME_ACU]
        : ['mode:json', ...(input.sharedMaterials === undefined ? ['read'] : []), 'review'],
      tools: nativeMode ? [...(input.sharedMaterials === undefined ? agentNativeTools_ACU(['read']) : []), continuationSubmitTool_ACU('finalReview')] : [],
      minOutputTokens: CONTINUATION_ROLE_OUTPUT_TOKEN_FLOORS_ACU.finalReviewer,
      onUsage: usage => {
        usageTotal = usageTotal
          ? {
            promptTokens: addCompleteCount(usageTotal.promptTokens, usage.promptTokens),
            completionTokens: addCompleteCount(usageTotal.completionTokens, usage.completionTokens),
            cachedTokens: addCompleteCount(usageTotal.cachedTokens, usage.cachedTokens),
            cacheWriteTokens: addCompleteCount(usageTotal.cacheWriteTokens, usage.cacheWriteTokens),
          }
          : { ...usage };
      },
    };
    const maxCalls = 1 + maxToolRounds + retries + 1;
    for (let call = 0; call < maxCalls; call += 1) {
      const identity = input.createIdentity(AGENT_FINAL_REVIEWER_NAME_ACU, attempt);
      attempt += 1;
      if (!input.isCurrent(identity)) {
        throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Yêu cầu chung thẩm đã hết hiệu lực', false));
      }
      const reviewTail = await renderReviewTail();
      const requestBody = assembleAgentPrompt_ACU([...baseMessages, ...(trailingPrefill ? [trailingPrefill] : [])], [...(input.mainHistory ?? []), ...transcript],
        `${reviewTail}\n\n${renderReadBudgetNote(toolRoundsUsed)}`);
      const requestMessages = nativeMode
        ? withNativeToolThinkPrefill_ACU(requestBody)
        : withJsonTailPrefill_ACU(requestBody);
      gate.defaultReadFenceTokens = await this.measureFinalRequestCapacity_ACU(requestMessages, input.settings.agentHistoryTokenBudget, callOptions, AGENT_FINAL_REVIEWER_NAME_ACU);
      const raw = await callContinuationInternalAiWithRetry_ACU(
        () => this.dependencies.callInternalAi(requestMessages, preset, identity, input.signal, callOptions),
        {
          transportRetries: retries,
          retryDelaySeconds: input.settings.retryDelaySeconds,
          isCurrent: () => input.isCurrent(identity) && !input.signal?.aborted,
        },
      );
      if (!input.isCurrent(identity)) {
        throw new ContinuationValidationError_ACU(createContinuationError_ACU('CONTINUATION_INTERNAL_REQUEST_STALE', 'agent_delegate', 'Kết quả chung thẩm đã hết hiệu lực', false));
      }
      const turn = normalizeAgentModelReply_ACU(raw);
      const nativeCalls = turn.toolCalls;
      const protocolText = typeof raw === 'string' || raw == null ? String(raw ?? '') : turn.content;
      const rawText = protocolText.trim();
      let toolCalls: ReturnType<typeof parseAgentSubagentToolCalls_ACU>;
      let submitPayload: Record<string, unknown> | null = null;
      // 回灌：工具模式给每个函数调用配一条回执，json 模式用普通 user 消息。
      const pushFeedback = (feedback: string): void => {
        if (nativeMode && nativeCalls.length) transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, nativeCalls.map(() => feedback)));
        else transcript.push({ role: 'assistant', content: rawText || '(đầu ra rỗng)' }, { role: 'user', content: feedback });
      };
      try {
        if (nativeMode) {
          if (!nativeCalls.length) throw new Error('Phải gọi hàm: đọc bổ sung dùng read, giao phán quyết chung thẩm thì gọi submit, đừng xuất văn bản JSON');
          const split = splitNativeDecisionCalls_ACU(nativeToolArguments_ACU(nativeCalls), [AGENT_SUBMIT_TOOL_NAME_ACU]);
          if (split.decision) submitPayload = submitPayloadObject_ACU(split.decision.payload);
          toolCalls = split.tools.length ? split.tools.map(({ call, payload }) => {
            if (call.name !== 'read' || input.sharedMaterials !== undefined) throw new Error('Chung thẩm chưa được cấp quyền dùng công cụ này');
            const parsed = parseAgentToolCall_ACU(payload);
            if (parsed.kind !== 'read') throw new Error('Chung thẩm chỉ cho phép read');
            return parsed;
          }) : null;
        } else {
          toolCalls = parseAgentSubagentToolCalls_ACU(protocolText, prefill);
          if (toolCalls && (input.sharedMaterials !== undefined || toolCalls.some(item => item.kind !== 'read'))) throw new Error('Chung thẩm chỉ cho phép read');
        }
      } catch (error) {
        const reason = compactAgentProtocolError_ACU(error);
        // 有函数调用的错误只回执不计数（与此前一致）；其余协议错误计入拒绝次数。
        if (!(nativeMode && nativeCalls.length)) {
          lastReason = reason;
          protocolRejections += 1;
          if (protocolRejections > retries) throw subagentFailed_ACU(`Chung thẩm cuối trả về ${retries + 1} lần liên tiếp không đúng hợp đồng`, false, { lastReason });
        }
        pushFeedback(nativeMode ? reason : `Đầu ra lần trước của bạn không được chấp nhận. Lý do: ${reason}\nHãy sửa rồi xuất lại.`);
        continue;
      }
      if (toolCalls) {
        if (maxToolRounds === 0 || gate.successfulReadBatch) {
          const exhausted = `read-once-exhausted: số vòng đọc đã dùng hết (chung thẩm tối đa một lô đọc thành công, giới hạn lần này ${maxToolRounds}), không thể read nữa. Hãy dựa trên bằng chứng hiện có để ${nativeMode ? 'gọi submit giao phán quyết chung thẩm' : 'xuất JSON chung thẩm'} trực tiếp; nội dung không chứng thực được thì ghi là chưa xác minh, không được suy đoán.\n\n${renderReadBudgetNote(toolRoundsUsed)}`;
          pushFeedback(exhausted);
          continue;
        }
        const batchResult = await this.executeToolCalls_ACU(toolCalls, input.resolveContext, gate, expandedReads,
          input.sharedMaterials !== undefined ? [] : null, false, true);
        // 只有成功批次计额；失败批次不注入正文，修正后可重试。
        if (gate.successfulReadBatch) toolRoundsUsed = 1;
        if (nativeMode) {
          const perCallResults = toolCalls.map((_, index) => index === 0 ? batchResult : 'Lô đọc logic này đã được quyết toán thống nhất, kết quả xem ở biên nhận công cụ đầu tiên.');
          transcript.push(...nativeToolExchange_ACU(turn.content, nativeCalls, perCallResults.map(result => `${result}\n\n${renderReadBudgetNote(toolRoundsUsed)}`)));
        } else {
          transcript.push({ role: 'assistant', content: rawText || '(đầu ra rỗng)' }, { role: 'user', content: `【工具结果】\n${batchResult}\n\n${renderReadBudgetNote(toolRoundsUsed)}` });
        }
        continue;
      }
      try {
        if (nativeMode && !submitPayload) throw new Error('Giao phán quyết chung thẩm phải gọi submit');
        const payload = submitPayload ?? parseAgentJsonPayload_ACU(protocolText, prefill, ['verdict', 'summary', 'emotionFindings', 'worldFindings', 'logicFindings', 'requiredFixes', 'preserve']);
        return {
          output: parseAgentFinalReviewerOutput_ACU(payload),
          evidence,
          iterations: 1 + toolRoundsUsed,
          attempts: attempt,
          toolRounds: toolRoundsUsed,
          readTokens: gate.state.grantedTokens,
          expandedReads: [...expandedReads],
          readRevisions,
          usage: usageTotal,
        };
      } catch (error) {
        lastReason = compactAgentProtocolError_ACU(error);
        protocolRejections += 1;
        if (protocolRejections > retries) {
          throw subagentFailed_ACU(`Chung thẩm cuối trả về ${retries + 1} lần liên tiếp không đúng hợp đồng`, false, { lastReason });
        }
        // 工具模式下 submit 调用也要配回执，否则下一次请求里存在没有结果的 tool_call。
        pushFeedback(`Đầu ra lần trước của bạn không được chấp nhận. Lý do: ${lastReason}\n${nativeMode ? 'Hãy sửa rồi gọi lại submit để giao phán quyết chung thẩm.' : 'Hãy sửa rồi xuất lại đối tượng JSON đúng hợp đồng chung thẩm.'}`);
      }
    }
    throw subagentFailed_ACU(`Chung thẩm cuối không giao đầu ra hợp đồng trong ${maxCalls} lần gọi`, false, { lastReason, toolRoundsUsed });
  }

  /**
   * 最终请求容量门禁：以即将发送的完整消息与原生工具定义计量已占用上下文，
   * 返回 60% 默认上围栏预算。本地输入限制非法或耗尽时在调用前 fail-closed，
   * 以不可重试的结构化错误退出（不截断、不摘要、不重发同一超限请求）。
   */
  private async measureFinalRequestCapacity_ACU(
    messages: ReadonlyArray<{ role: string; content: string }>,
    inputLimitTokens: number,
    options: ContinuationInternalAiCallOptions_ACU,
    agentName: string,
  ): Promise<number> {
    try {
      const capacity = await measureContinuationFinalRequestCapacity_ACU({
        messages,
        tools: options.tools ?? [],
        inputLimitTokens,
        count: this.dependencies.countTokens ?? countAgentTokens_ACU,
      });
      return capacity.defaultReadFenceTokens;
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      throw subagentFailed_ACU(`Yêu cầu cuối cùng của ${agentName} vượt dung lượng ngữ cảnh (${code}), yêu cầu chưa được gửi; tư liệu không bị cắt hay tóm tắt.`, false, {
        reason: 'context-capacity-exceeded',
        code,
        inputLimitTokens,
        agentName,
      });
    }
  }

  /**
   * 执行子代理的一个工具批次并渲染结果文本。
   * 与主循环同一门禁语义：批内去重与已放行地址拆分、整批过门禁、打回报告直接作为结果回灌。
   */
  private async executeToolCalls_ACU(
    calls: ReadonlyArray<AgentToolCall_ACU | AgentWebToolCall_ACU>,
    context: AgentResolveContext_ACU,
    gate: SubagentGate_ACU,
    expandedReads: string[],
    ownReads: readonly string[] | null,
    allowSearch: boolean,
    readOnce: boolean,
    research?: { settings: ContinuationSettings_ACU; cache: ResearcherPageCache_ACU },
  ): Promise<string> {
    const fresh: SubagentMaterial_ACU[] = [];
    const duplicated: string[] = [];
    const failed: SubagentMaterial_ACU[] = [];
    const refused: string[] = [];
    const seenInBatch = new Set<string>();
    // 出网工具不过读取门禁：它们的成本由页数与字数上限约束，结果直接回灌。
    const webSections: string[] = [];
    for (const call of calls) {
      if (call.kind === 'encyclopedia_search' || call.kind === 'encyclopedia_read' || call.kind === 'web_search' || call.kind === 'web_read') {
        if (!research) {
          webSections.push(`Công cụ ra mạng ${call.kind} chỉ web-researcher mới dùng được, lần này không thực thi.`);
          continue;
        }
        webSections.push(await this.executeWebToolCall_ACU(call, research.settings, research.cache, expandedReads));
        continue;
      }
      if (call.kind === 'search' && !research && !allowSearch) {
        refused.push('Vai trò hiện tại chưa được cấp quyền tìm kiếm cục bộ.');
        continue;
      }
      if (call.kind === 'read') {
        for (const raw of call.reads) {
          const key = String(raw ?? '').trim();
          if (!key) continue;
          if (ownReads && !readStaysWithOwner_ACU(key, ownReads)) {
            failed.push({
              key,
              label: key,
              text: `${key} không nằm trong phạm vi đọc được cấp quyền của vai trò hiện tại. Hãy dùng các địa chỉ riêng hoặc liên quan chặt chẽ mà profile cho phép; địa chỉ vượt quyền sẽ không được tiêm vào chính văn.`,
              status: 'failed',
            });
            continue;
          }
          if (call.requestedFence) {
            const material = resolveMaterial_ACU(key, context, call.requestedFence);
            if (material.status === 'failed') {
              failed.push(material);
              continue;
            }
            if (seenInBatch.has(key)) continue;
            seenInBatch.add(key);
            const narrowed = gate.narrowed.get(key);
            if (narrowed) {
              duplicated.push(`Địa chỉ gốc "${key}" trước đó chỉ cung cấp toàn văn của phạm vi con thu hẹp "${narrowed.address}", không tuyên bố địa chỉ gốc đã được đưa vào toàn bộ; phần chưa đọc${narrowed.remainder ? ` hãy đọc "${narrowed.remainder}"` : ' lần này không còn phạm vi dư'}.`);
              continue;
            }
            if (gate.granted.has(key)) { duplicated.push(`地址「${key}」已放行，完整内容见上文，不再重注。`); continue; }
            fresh.push(material);
            continue;
          }
          if (seenInBatch.has(key)) continue;
          seenInBatch.add(key);
          const narrowed = gate.narrowed.get(key);
          if (narrowed) {
            duplicated.push(`Địa chỉ gốc "${key}" trước đó chỉ cung cấp toàn văn của phạm vi con thu hẹp "${narrowed.address}", không tuyên bố địa chỉ gốc đã được đưa vào toàn bộ; phần chưa đọc${narrowed.remainder ? ` hãy đọc "${narrowed.remainder}"` : ' lần này không còn phạm vi dư'}.`);
            continue;
          }
          if (gate.granted.has(key)) { duplicated.push(`地址「${key}」已放行，完整内容见上文，不再重注。`); continue; }
          const material = resolveMaterial_ACU(key, context);
          if (material.status === 'failed') failed.push(material);
          else fresh.push(material);
        }
        continue;
      }
      const key = `search|${call.isRegex ? 're' : 'kw'}|${[...call.scope].sort().join('+')}|${call.maxResults}|${call.query}`;
      if (seenInBatch.has(key)) continue;
      seenInBatch.add(key);
      const label = `search "${call.query}" (miền: ${call.scope.join(', ')})`;
      if (gate.granted.has(key)) { duplicated.push(label); continue; }
      fresh.push({ key, label, text: `### Tìm "${call.query}"\n${runAgentSearch_ACU(call, context)}` });
    }

    const sections: string[] = [...refused, ...webSections, ...failed.map(material => JSON.stringify({ action: 'read', address: material.key, status: 'failed', reason: material.text }))];
    if (failed.length || refused.length) {
      // 一条本地地址失败时，整个本地读取批次不可提交：不登记成功，也不回灌其它地址的正文。
      return `【工具结果】\n${sections.join('\n\n')}`;
    }
    if (duplicated.length) {
      sections.push(`Các yêu cầu tra cứu sau không được tiêm lặp lại:\n${duplicated.join('\n')}`);
    }
    if (fresh.length) {
      if (readOnce && gate.successfulReadBatch) {
        sections.push(JSON.stringify({ action: 'read', status: 'rejected', reason: 'read-once-exhausted' }));
        return `【工具结果】\n${sections.join('\n\n')}`;
      }
      const sharedReadRound = readOnce && gate.readRoundKey && gate.readRoundState
        ? { key: gate.readRoundKey, state: gate.readRoundState }
        : null;
      if (sharedReadRound?.state.successfulReadBatches.has(sharedReadRound.key)) {
        sections.push(JSON.stringify({ action: 'read', status: 'rejected', reason: 'read-once-exhausted' }));
        return `【工具结果】\n${sections.join('\n\n')}`;
      }
      if (sharedReadRound?.state.pendingReadBatches.has(sharedReadRound.key)) {
        sections.push(JSON.stringify({ action: 'read', status: 'rejected', reason: 'read-in-progress' }));
        return `【工具结果】\n${sections.join('\n\n')}`;
      }
      if (sharedReadRound) sharedReadRound.state.pendingReadBatches.add(sharedReadRound.key);
      try {
        const count = this.dependencies.countTokens ?? countAgentTokens_ACU;
        // 收窄放行的材料额外携带原始地址与剩余范围；登记时不再回查外层 allocation。
        let admitted: Array<SubagentMaterial_ACU & { narrowedFrom?: string; remainder?: string }> = fresh;
        let admittedTokens: number | undefined;
        // 未显式提供上围栏的本地读取：60% 默认上围栏预算经地址适配器解析为可证明的子范围；出网研究不适用。
        const defaultFenced = research ? [] : fresh.filter(material => material.read && material.read.requestedFence?.upper === undefined);
        if (defaultFenced.length) {
          const reservedTokens = (await Promise.all(fresh.filter(material => !defaultFenced.includes(material)).map(material => count(material.text))))
            .reduce((sum, tokens) => sum + tokens, 0);
          const allocation = await allocateAgentDefaultReadFences_ACU({
            candidates: defaultFenced.map((material): AgentDefaultFenceCandidate_ACU => ({
              key: material.key,
              title: material.read!.title,
              text: material.read!.body,
              ...(material.read!.requestedFence === undefined ? {} : { requestedFence: material.read!.requestedFence }),
            })),
            budgetTokens: gate.defaultReadFenceTokens,
            reservedTokens,
            axis: key => resolveAgentReadAddressAxis_ACU(key, context),
            resolve: (address, requestedFence) => resolveAgentReadTokenWithProof_ACU(address, context, requestedFence),
            count,
          });
          if (allocation.status === 'failed') {
            // 默认范围无法在预算内完整证明：整批不注入、不登记成功，修正地址后可重试。
            sections.push(...allocation.failures.map(failure => JSON.stringify({
              action: 'read', address: failure.key, status: 'failed', reason: failure.reason, message: failure.message, ...failure.details,
            })));
            return `【工具结果】\n${sections.join('\n\n')}`;
          }
          const allocated = new Map(allocation.reads.map(read => [read.key, read]));
          admitted = fresh.map(material => {
            const read = allocated.get(material.key);
            if (!read?.narrowed) return material;
            return { key: read.address, label: `${read.address} (hàng rào trên mặc định, địa chỉ gốc ${material.key})`, text: `### ${read.title} (${read.address})\n${read.text}`, narrowedFrom: material.key, ...(read.remainder ? { remainder: read.remainder } : {}) };
          });
          admittedTokens = reservedTokens + allocation.reads.reduce((sum, read) => sum + read.tokens, 0);
        }
        const items: AgentGateItem_ACU[] = admitted.map(material => ({ label: material.label, text: material.text }));
        const decision = await gateAgentReadBatch_ACU(items, gate.state, gate.config, 0);
        if (decision.allowed) {
          if (readOnce) gate.successfulReadBatch = true;
          if (sharedReadRound) sharedReadRound.state.successfulReadBatches.add(sharedReadRound.key);
          gate.state.grantedTokens += decision.batchTokens;
          for (const material of admitted) {
            gate.granted.add(material.key);
            if (material.narrowedFrom) {
              // 收窄材料的 key 已替换为实际放行子范围地址；原地址登记为“仅收窄提供”，不得冒充完整放行。
              gate.narrowed.set(material.narrowedFrom, { address: material.key, ...(material.remainder ? { remainder: material.remainder } : {}) });
            }
            expandedReads.push(material.label);
          }
          sections.push(...admitted.map(material => material.text));
          if (gate.defaultReadFenceTokens !== undefined) {
            // 同一模型回合内后续批次只能使用余下的默认上围栏预算；下一次请求前容量门禁会重新计量。
            const injected = admittedTokens ?? (await Promise.all(admitted.map(material => count(material.text)))).reduce((sum, tokens) => sum + tokens, 0);
            gate.defaultReadFenceTokens = Math.max(0, Math.floor(gate.defaultReadFenceTokens - injected));
          }
        } else {
          sections.push(decision.report);
        }
      } finally {
        if (sharedReadRound) sharedReadRound.state.pendingReadBatches.delete(sharedReadRound.key);
      }
    } else if (!duplicated.length && !webSections.length && !failed.length) {
      sections.push('Lô công cụ lần này không có địa chỉ đọc hay yêu cầu tìm kiếm hợp lệ nào. Hãy kiểm tra mảng reads của read và query của search.');
    }
    return `【工具结果】\n${sections.join('\n\n')}`;
  }

  /**
   * 执行一个出网工具调用并渲染结果。每个抓到的页面登记进句柄缓存（P1、P2…），
   * 结果文本带句柄，契约里的 pageRef 据此回填。同一 URL 重抓复用旧句柄、不计页数。
   */
  private async executeWebToolCall_ACU(
    call: AgentWebToolCall_ACU,
    settings: ContinuationSettings_ACU,
    cache: ResearcherPageCache_ACU,
    expandedReads: string[],
  ): Promise<string> {
    const client = this.dependencies.webClient ?? (this.dependencies.webClient = new AgentWebClient_ACU());
    const webSettings = settings.webResearch;
    const registerPage = (page: AgentFetchedPage_ACU, query: string): string => {
      const existing = cache.byUrl.get(page.url);
      if (existing) return existing;
      const handle = `P${cache.pages.size + 1}`;
      cache.pages.set(handle, { ...page, query });
      cache.byUrl.set(page.url, handle);
      if (page.status === 'ok') cache.pagesUsed += 1;
      return handle;
    };
    const renderPage = (handle: string, page: AgentFetchedPage_ACU, reused: boolean): string => {
      const head = `### [Handle trang ${handle}] "${page.title || '(không có tiêu đề)'}" nguồn=${page.source === 'web' ? 'trang web' : AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU[page.source]}｜${page.url}`;
      if (page.status !== 'ok') return `${head}\nTải thất bại (${page.status}): ${page.note}`;
      if (reused) return `${head}\n（该页面本次派工已抓取过，原文见上文，不再重注）`;
      return `${head}\n${page.text}`;
    };
    const pagesExhausted = (): string | null => (cache.pagesUsed >= webSettings.maxPages
      ? `Hạn mức trang của lần giao việc này đã dùng hết (${webSettings.maxPages} trang). Hãy giao JSON hợp đồng dựa trên các trang đã tải được.`
      : null);

    if (call.kind === 'encyclopedia_search') {
      const sources = call.sources.length ? call.sources : enabledEncyclopediaSources_ACU(webSettings);
      if (!sources.length) return `### Tra cứu bách khoa "${call.query}"\nKhông có nguồn bách khoa khả dụng (tất cả đều tắt trong cài đặt). Hãy dùng web_search.`;
      const disabled = call.sources.filter(source => !enabledEncyclopediaSources_ACU(webSettings).includes(source));
      const results = await Promise.all(sources.filter(source => !disabled.includes(source)).map(async source => ({ source, ...(await client.searchEncyclopedia(source, call.query)) })));
      expandedReads.push(`encyclopedia_search "${call.query}"`);
      const lines: string[] = [];
      for (const result of results) {
        const label = AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU[result.source];
        if (!result.candidates.length) { lines.push(`- ${label}: không có ứng viên${result.note ? ` (${result.note})` : ''}`); continue; }
        lines.push(`- ${label}:`);
        for (const candidate of result.candidates) {
          lines.push(`  · "${candidate.title}"${candidate.snippet ? `: ${candidate.snippet.slice(0, 120)}` : ''}｜đọc kỹ: gọi encyclopedia_read, source=${candidate.source}, title=${candidate.title}`);
        }
      }
      if (disabled.length) lines.push(`- Các nguồn sau đã tắt trong cài đặt, không tra cứu: ${disabled.map(source => AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU[source]).join(', ')}`);
      return `### Tra cứu bách khoa "${call.query}"\n${lines.join('\n')}`;
    }
    if (call.kind === 'encyclopedia_read') {
      if (!enabledEncyclopediaSources_ACU(webSettings).includes(call.source)) {
        return `### Đọc kỹ bách khoa "${call.title}"\nNguồn ${AGENT_ENCYCLOPEDIA_SOURCE_LABELS_ACU[call.source]} đã tắt trong cài đặt, không thực thi.`;
      }
      const exhausted = pagesExhausted();
      if (exhausted) return `### Đọc kỹ bách khoa "${call.title}"\n${exhausted}`;
      const page = await client.readEncyclopedia(call.source, call.title, webSettings.pageCharLimit);
      const reused = cache.byUrl.has(page.url);
      const handle = registerPage(page, call.title);
      expandedReads.push(`encyclopedia_read ${call.source}:${call.title}`);
      return renderPage(handle, page, reused);
    }
    if (call.kind === 'web_search') {
      const result = await client.webSearch(call.query, webSettings);
      expandedReads.push(`web_search "${call.query}"`);
      if (!result.hits.length) return `### Tìm kiếm web "${call.query}"\nKhông có kết quả${result.note ? `: ${result.note}` : ''}. Hãy dùng từ khóa ngắn hơn, thêm tên tác phẩm, hoặc chuyển sang encyclopedia_search.`;
      const lines = result.hits.map((hit, index) => `${index + 1}. "${hit.title || '(không có tiêu đề)'}"${hit.url ? `｜${hit.url}` : ''}${hit.snippet ? `\n   ${hit.snippet.slice(0, 200)}` : ''}${hit.url ? `\n   Tải: gọi web_read, url=${hit.url}` : ''}`);
      return `### Tìm kiếm web "${call.query}" (nhà cung cấp: ${webSettings.searchProvider})\n${lines.join('\n')}`;
    }
    const exhausted = pagesExhausted();
    if (exhausted) return `### Tải trang web ${call.url}\n${exhausted}`;
    const page = await client.webRead(call.url, webSettings, this.dependencies.hostOrigin?.());
    const reused = cache.byUrl.has(page.url);
    const handle = registerPage(page, call.url);
    expandedReads.push(`web_read ${call.url}`);
    return renderPage(handle, page, reused);
  }
}
