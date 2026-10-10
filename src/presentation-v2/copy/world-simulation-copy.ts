import { WORLD_SIMULATION_AGENT_NAMES_ACU, type WorldSimulationAgentName_ACU } from '../../service/simulation/agent/agent-catalog';

/** 页面（.vue）不能直接引用 service 值；无真实调用入口的研究员仅保留旧配置迁移，不再暴露为可编辑 Agent。 */
export const WORLD_SIMULATION_AGENT_ORDER_ACU: readonly WorldSimulationAgentName_ACU[] = WORLD_SIMULATION_AGENT_NAMES_ACU
  .filter(agentName => agentName !== 'lore-researcher');

/**
 * 格林推演各 Agent 的中文展示名。会话流、渠道下拉与提示词分组共用同一张表，
 * 内部 agentName 不直接暴露给用户（与智能续写「各 Agent 渠道」的做法一致）。
 * 退役角色保留展示名，避免旧会话卡片回退成英文内部名。
 */
export const WORLD_SIMULATION_AGENT_DISPLAY_LABELS_ACU: Record<string, string> = {
  'world-director': 'Agent chính',
  'world-stage-planner': 'Lập kế hoạch giai đoạn',
  'timekeeper': 'Vai trò cũ: Đồng hồ',
  'undercurrent-analyst': 'Trình tự thời gian và mạch ngầm',
  'dramatis-keeper': 'Danh bạ nhân vật',
  'chronicler': 'Vai trò cũ: Kỷ yếu',
  'causality-reviewer': 'Thẩm định nhân quả',
  'guidance-composer': 'Kỷ yếu, tin đồn và tín hiệu ngoài cảnh',
  'lore-researcher': 'Nghiên cứu thiết lập',
  'requirements-maintainer': 'Bảo trì yêu cầu người dùng',
  'world-analyst': 'Mô phỏng thế giới',
};

export function worldSimulationAgentLabel_ACU(agentName: string): string {
  return WORLD_SIMULATION_AGENT_DISPLAY_LABELS_ACU[agentName] ?? agentName;
}
