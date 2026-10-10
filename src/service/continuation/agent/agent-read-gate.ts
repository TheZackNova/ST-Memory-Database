/**
 * service/continuation/agent/agent-read-gate.ts — read/search 结果注入前的 Token 门禁
 *
 * 单批次 read/search 注入门禁。每个工具批次独立判定，避免一份过大的读取撑爆上下文；
 * 总次数由主循环 / 子代理运行预算控制，超过上下文阈值交给既有总结机制处理。
 *
 * 四个量：
 * - S：agentHistoryTokenBudget（会话压缩阈值，同时用于百分比折算）
 * - M：agentReadTokenBudget 解析后的**单批次** read/search 上限（固定值或 S 的百分比）
 * - F：min(agentReadFallbackTokens, M)，临近 S 时仍放行的精读兜底额度
 * - B：本批次全部材料的实测 token
 *
 * 状态机：
 * - B > M 直接整批打回；
 * - 否则 H + B > S 且 B > F 时打回，持续要求缩小到 F 以下；
 * - B <= F 时放行，由既有总结机制处理超长上下文。
 *
 * 打回报告不含正文，只含各目标实测 token 数、四量与剩余额度，尾附修正协议。
 * 门禁统一作用于三条注入路径：主 Agent 工具批次、子代理工具轮次、派工种子材料。
 */

import { AGENT_HISTORY_TOKEN_BUDGET_DEFAULT_ACU } from './agent-model';
import { countAgentTokens_ACU, type TokenCounter_ACU } from './agent-token-budget';

/** 一条待注入的材料（read 的一个地址的解析结果，或一次 search 的结果文本）。 */
export interface AgentGateItem_ACU {
  /** 材料标识，如读取地址 token 或「search "关键词"」。进入打回报告。 */
  label: string;
  text: string;
}

/** 保留状态对象以兼容调用侧的工具遥测；单批次门禁不再累计扣减。 */
export interface AgentReadGateState_ACU {
  grantedTokens: number;
}

export function createAgentReadGateState_ACU(): AgentReadGateState_ACU {
  return { grantedTokens: 0 };
}

export interface AgentReadGateConfig_ACU {
  /** S：会话压缩阈值（agentHistoryTokenBudget）；<=0 视为不限。 */
  historyTokenBudget: number;
  /** M 原始配置（agentReadTokenBudget）：正整数或 "20%" 百分比串。 */
  readTokenBudget: number | string;
  /** F 原始配置（agentReadFallbackTokens）。 */
  fallbackTokens: number;
}

export interface AgentReadBudgetResolution_ACU {
  /** M：有效单批次读取上限。 */
  effectiveMaxReadTokens: number;
  /** F：有效精读兜底额度 = min(配置值, M)。 */
  effectiveFallbackTokens: number;
  basis: 'fixed' | 'history-budget-percent';
}

/**
 * 解析 read/search 单批次上限。
 * 百分比按 S 折算；S 不限（<=0）时按默认历史预算折算，保证百分比配置永远可解析。
 * @param config 三项预算设置
 * @returns 有效 M / F 与解析依据
 */
export function resolveAgentReadBudget_ACU(config: AgentReadGateConfig_ACU): AgentReadBudgetResolution_ACU {
  const percentBase = config.historyTokenBudget > 0 ? config.historyTokenBudget : AGENT_HISTORY_TOKEN_BUDGET_DEFAULT_ACU;
  let effectiveMaxReadTokens = 0;
  let basis: AgentReadBudgetResolution_ACU['basis'] = 'history-budget-percent';
  const raw = config.readTokenBudget;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    effectiveMaxReadTokens = Math.floor(raw);
    basis = 'fixed';
  } else if (typeof raw === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)%$/.test(raw.trim())) {
    const percent = Number(raw.trim().slice(0, -1));
    if (Number.isFinite(percent) && percent >= 1 && percent <= 100) {
      effectiveMaxReadTokens = Math.floor(percentBase * (percent / 100));
    }
  }
  if (!Number.isFinite(effectiveMaxReadTokens) || effectiveMaxReadTokens < 1) {
    // 损坏配置回退默认 20%，与设置校验层的默认一致。
    effectiveMaxReadTokens = Math.floor(percentBase * 0.2);
    basis = 'history-budget-percent';
  }
  const configuredFallback = Number.isFinite(config.fallbackTokens) && config.fallbackTokens >= 1 ? Math.floor(config.fallbackTokens) : 6000;
  return { effectiveMaxReadTokens, effectiveFallbackTokens: Math.min(configuredFallback, effectiveMaxReadTokens), basis };
}

export type AgentReadGateRejectReason_ACU = 'read-batch-too-large' | 'near-compaction-overflow';

export interface AgentReadGateDecision_ACU {
  allowed: boolean;
  reason?: AgentReadGateRejectReason_ACU;
  /** B：本批次全部材料实测 token。 */
  batchTokens: number;
  /** 每条材料的实测 token（与 items 一一对应），打回报告的数据来源。 */
  itemTokens: number[];
  /** 打回报告文本（allowed 时为空串）。回灌给 AI 的正是这段，不含任何材料正文。 */
  report: string;
}

function buildRejectionReport_ACU(
  reason: AgentReadGateRejectReason_ACU,
  items: readonly AgentGateItem_ACU[],
  itemTokens: readonly number[],
  batchTokens: number,
  state: AgentReadGateState_ACU,
  budget: AgentReadBudgetResolution_ACU,
  historyTokenBudget: number,
  contextTokens: number,
): string {
  const itemLines = items.map((item, index) => `- ${item.label}: đo thực tế ${itemTokens[index]} tokens`);
  const lines: string[] = ['【Lô đọc bị cổng chặn trả về: nội dung chưa được tiêm, đừng thử lại nguyên như cũ】'];
  if (reason === 'read-batch-too-large') {
    lines.push(`Nguyên nhân: lô công cụ read/search lần này cần ${batchTokens} tokens, vượt giới hạn mỗi lô ${budget.effectiveMaxReadTokens} tokens. Giới hạn này không cộng dồn giữa các lô; thu nhỏ nội dung lô này rồi có thể đọc tiếp ở lượt sau.`);
  } else {
    const headroom = Math.max(0, historyTokenBudget - contextTokens);
    lines.push(`Nguyên nhân: ngữ cảnh gần ngưỡng tóm tắt. Ngữ cảnh hiện tại đo thực tế ${contextTokens} tokens, ngưỡng tóm tắt ${historyTokenBudget} tokens (còn dư ${headroom} tokens trước ngưỡng); lô này ${batchTokens} tokens lớn hơn hạn mức đọc kỹ dự phòng ${budget.effectiveFallbackTokens} tokens. Hãy tiếp tục thu hẹp phạm vi đọc cho đến khi mỗi lô không quá ${budget.effectiveFallbackTokens} tokens; khi đó sẽ được cho qua và cơ chế tóm tắt sẽ xử lý ngữ cảnh quá dài.`);
  }
  lines.push('Kích thước đo thực tế của từng mục tiêu trong lô này:', ...itemLines);
  const nextLimit = reason === 'near-compaction-overflow' ? budget.effectiveFallbackTokens : budget.effectiveMaxReadTokens;
  lines.push(`Quy ước sửa: trước hết dùng search để định vị cốt truyện liên quan, rồi thử lại với mục tiêu nhỏ hơn — chính văn dùng khoảng $STORY_RANGE hẹp hơn, bảng đọc theo từng đoạn $TABLE:tên bảng:hàng_đầu-hàng_cuối, mô-đun đọc kỹ theo ID (như $HOOKS_LEDGER:H001), để yêu cầu lần sau nằm trong ${nextLimit} tokens.`);
  return lines.join('\n');
}

/**
 * 对一批待注入材料执行门禁判定。
 *
 * 判定是批次原子的：整批放行或整批打回，禁止同批部分注入（拆分绕过预算）。
 * 放行时调用方须把 batchTokens 记账进 state（本函数不自动记账，
 * 因为去重命中的材料由调用方决定是否计费）。
 * @param items 待注入材料
 * @param state 运行内累计状态（P）
 * @param config 预算设置
 * @param contextTokens H：本批次注入前的完整上下文实测；临近总结阈值时只放行 F 以内的精读
 * @param count token 统计函数，缺省 countAgentTokens_ACU
 * @returns 判定结果；拒绝时 report 为可直接回灌的打回报告
 */
export async function gateAgentReadBatch_ACU(
  items: readonly AgentGateItem_ACU[],
  state: AgentReadGateState_ACU,
  config: AgentReadGateConfig_ACU,
  contextTokens: number,
  count: TokenCounter_ACU = countAgentTokens_ACU,
): Promise<AgentReadGateDecision_ACU> {
  const itemTokens = await Promise.all(items.map(item => count(item.text)));
  const batchTokens = itemTokens.reduce((sum, tokens) => sum + tokens, 0);
  if (!items.length) return { allowed: true, batchTokens: 0, itemTokens: [], report: '' };

  const budget = resolveAgentReadBudget_ACU(config);
  const decide = (reason: AgentReadGateRejectReason_ACU): AgentReadGateDecision_ACU => ({
    allowed: false,
    reason,
    batchTokens,
    itemTokens,
    report: buildRejectionReport_ACU(reason, items, itemTokens, batchTokens, state, budget, config.historyTokenBudget, contextTokens),
  });

  // 每个工具批次独立判定：不存在跨批次累计额度。
  if (batchTokens > budget.effectiveMaxReadTokens) return decide('read-batch-too-large');
  if (config.historyTokenBudget > 0 && contextTokens > 0 && contextTokens + batchTokens > config.historyTokenBudget
    && batchTokens > budget.effectiveFallbackTokens) {
    return decide('near-compaction-overflow');
  }
  void state;
  return { allowed: true, batchTokens, itemTokens, report: '' };
}
