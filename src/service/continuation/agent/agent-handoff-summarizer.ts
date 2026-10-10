import type { AgentConversationMessage_ACU, AgentHandoffSummaryStateV2_ACU } from './agent-model';
import type { TokenCounter_ACU } from './agent-token-budget';

type AgentHandoffSemanticCall_ACU = (messages: Array<{ role: string; content: string }>) => Promise<string | null>;

export interface AgentHandoffSemanticSummaryAdapter_ACU {
  summarize(input: { previous: AgentHandoffSummaryStateV2_ACU | null; messages: readonly AgentConversationMessage_ACU[]; allowedReadKeys: readonly string[] }): Promise<Partial<AgentHandoffSummaryStateV2_ACU>>;
}

export interface AgentHandoffSummaryResult_ACU {
  state: AgentHandoffSummaryStateV2_ACU;
  report: string;
  reportTokens: number;
  degraded: boolean;
  degradationReason?: string;
}

const fields_ACU: Array<keyof AgentHandoffSummaryStateV2_ACU> = ['effectiveConstraints', 'decisions', 'completedItems', 'pendingItems', 'blockers', 'continuityFacts', 'readKeys', 'recentTurns'];

function cleanText_ACU(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanList_ACU(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(cleanText_ACU).filter(Boolean))] : [];
}

function isSummaryState_ACU(value: unknown): value is AgentHandoffSummaryStateV2_ACU {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const keys = ['currentGoal', 'effectiveConstraints', 'decisions', 'completedItems', 'pendingItems', 'blockers', 'continuityFacts', 'readKeys', 'recentTurns'];
  return keys.every(key => Object.prototype.hasOwnProperty.call(raw, key))
    && Object.keys(raw).every(key => keys.includes(key))
    && typeof raw.currentGoal === 'string'
    && keys.slice(1).every(key => Array.isArray(raw[key]) && raw[key].every(item => typeof item === 'string'));
}

function parseSemanticSummary_ACU(raw: string | null): AgentHandoffSummaryStateV2_ACU | null {
  try {
    const parsed = JSON.parse(String(raw ?? '').trim());
    return isSummaryState_ACU(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 构造只产出结构化交接状态的语义 adapter；调用方负责提供已隔离的内部 AI 通道。 */
export function createAgentHandoffSemanticSummaryAdapter_ACU(call: AgentHandoffSemanticCall_ACU): AgentHandoffSemanticSummaryAdapter_ACU {
  return {
    async summarize(input) {
      const source = JSON.stringify({ previous: input.previous, messages: input.messages });
      const request = (repair: boolean): Array<{ role: string; content: string }> => [
        {
          role: 'system',
          content: 'Bạn chỉ chịu trách nhiệm nén các sự thật của hội thoại đầu vào thành JSON. Không được gọi công cụ, không được lập kế hoạch, không được viết tiểu thuyết. Đầu ra phải là một đối tượng JSON duy nhất, các trường chính xác là currentGoal, effectiveConstraints, decisions, completedItems, pendingItems, blockers, continuityFacts, readKeys, recentTurns; currentGoal là chuỗi, các trường còn lại đều là mảng chuỗi. Không được bịa địa chỉ đọc hay dấu vân tay lượt.',
        },
        { role: 'user', content: repair ? `Đầu ra lần trước không đúng hợp đồng JSON. Chỉ xuất JSON đúng hợp đồng, không giải thích.\nNguồn: ${source}` : `Nguồn: ${source}` },
      ];
      const first = parseSemanticSummary_ACU(await call(request(false)));
      if (first) return first;
      const repaired = parseSemanticSummary_ACU(await call(request(true)));
      if (repaired) return repaired;
      throw new Error('HANDOFF_SEMANTIC_SUMMARY_INVALID');
    },
  };
}

function buildDeterministicState_ACU(previous: AgentHandoffSummaryStateV2_ACU | null, messages: readonly AgentConversationMessage_ACU[]): AgentHandoffSummaryStateV2_ACU {
  const state: AgentHandoffSummaryStateV2_ACU = previous ? {
    currentGoal: previous.currentGoal,
    effectiveConstraints: [...previous.effectiveConstraints], decisions: [...previous.decisions], completedItems: [...previous.completedItems],
    pendingItems: [...previous.pendingItems], blockers: [...previous.blockers], continuityFacts: [...previous.continuityFacts],
    readKeys: [...previous.readKeys], recentTurns: [...previous.recentTurns],
  } : { currentGoal: '', effectiveConstraints: [], decisions: [], completedItems: [], pendingItems: [], blockers: [], continuityFacts: [], readKeys: [], recentTurns: [] };
  for (const message of messages) {
    if (message.kind === 'user') state.effectiveConstraints.push(message.text);
    else if (message.kind === 'agent') state.decisions.push(message.digest || message.text);
    else if (message.kind === 'tool' || message.kind === 'runtime') state.continuityFacts.push(message.digest || message.text);
    else if (message.kind === 'turn') { state.currentGoal = message.digest || message.text; state.recentTurns.push(message.turnKey || message.digest || message.text); }
    if (message.readKey) state.readKeys.push(message.readKey);
  }
  for (const field of fields_ACU) state[field] = (field === 'effectiveConstraints' || field === 'readKeys' ? cleanList_ACU(state[field]) : cleanList_ACU(state[field]).slice(-8)) as never;
  state.currentGoal = cleanText_ACU(state.currentGoal);
  return state;
}

export function renderAgentHandoffReport_ACU(state: AgentHandoffSummaryStateV2_ACU, degradationReason?: string): string {
  const sections: Array<[string, string[]]> = [['Mục tiêu hiện tại', state.currentGoal ? [state.currentGoal] : []], ['Ràng buộc hiệu lực', state.effectiveConstraints], ['Quyết định đã thực hiện', state.decisions], ['Đã hoàn thành', state.completedItems], ['Việc cần làm', state.pendingItems], ['Bị chặn', state.blockers], ['Sự thật liên tục', state.continuityFacts], ['Địa chỉ tư liệu', state.readKeys], ['Lượt gần đây', state.recentTurns]];
  const body = sections.filter(([, items]) => items.length).map(([title, items]) => `【${title}】\n${items.map(item => `- ${item}`).join('\n')}`).join('\n');
  return `${degradationReason ? `【Hạ cấp tóm tắt】${degradationReason}\n` : ''}【Bàn giao hội thoại sớm】\n${body || 'Không có việc sớm nào cần giữ lại.'}`;
}

export async function summarizeAgentHandoff_ACU(input: { previous: AgentHandoffSummaryStateV2_ACU | null; messages: readonly AgentConversationMessage_ACU[]; maxTokens: number; countTokens: TokenCounter_ACU; semanticAdapter?: AgentHandoffSemanticSummaryAdapter_ACU }): Promise<AgentHandoffSummaryResult_ACU> {
  let state = buildDeterministicState_ACU(input.previous, input.messages);
  let degraded = !input.semanticAdapter;
  let degradationReason = degraded ? 'deterministic_adapter' : undefined;
  if (input.semanticAdapter) {
    try {
      const allowedReadKeys = state.readKeys;
      const proposed = await input.semanticAdapter.summarize({ previous: input.previous, messages: input.messages, allowedReadKeys });
      state = { ...state, currentGoal: cleanText_ACU(proposed.currentGoal) || state.currentGoal, ...Object.fromEntries(fields_ACU.map(field => [field, field === 'readKeys' || field === 'recentTurns' || field === 'effectiveConstraints' ? state[field] : cleanList_ACU(proposed[field]).length ? cleanList_ACU(proposed[field]) : state[field]])) } as AgentHandoffSummaryStateV2_ACU;
    } catch {
      degraded = true;
      degradationReason = 'semantic_summary_failed';
    }
  }
  let report = renderAgentHandoffReport_ACU(state, degradationReason);
  for (const field of [...fields_ACU].reverse().filter(item => item !== 'effectiveConstraints' && item !== 'readKeys')) {
    while ((await input.countTokens(report)) > input.maxTokens && state[field].length) { state = { ...state, [field]: state[field].slice(1) }; report = renderAgentHandoffReport_ACU(state, degradationReason); }
  }
  const reportTokens = await input.countTokens(report);
  if (reportTokens > input.maxTokens) throw new Error('HANDOFF_SUMMARY_BUDGET_EXCEEDED');
  return { state, report, reportTokens, degraded, ...(degradationReason ? { degradationReason } : {}) };
}
