import type { WorldSimulationLedgerModule_ACU } from '../model';
import type { AgentNativeToolName_ACU } from '../../ai/native-tool';
import { WORLD_RELATED_READONLY_MODULES_ACU } from '../world-catalog';

export const WORLD_SIMULATION_AGENT_NAMES_ACU = [
  'world-director',
  'undercurrent-analyst',
  'dramatis-keeper',
  'causality-reviewer',
  'guidance-composer',
  'lore-researcher',
] as const;

/** 退役角色只供旧运行恢复及历史提示词谱系使用，不在公开目录展示。 */
export type WorldSimulationAgentName_ACU = typeof WORLD_SIMULATION_AGENT_NAMES_ACU[number] | 'timekeeper' | 'chronicler' | 'world-stage-planner';
export const WORLD_SIMULATION_RETIRED_AGENT_NAMES_ACU = [
  'world-stage-planner',
  'world-analyst',
  'macro-dynamics-analyst',
  'seed-lifecycle-analyst',
  'actor-information-analyst',
  'causality-planner',
  'guidance-reviewer',
  'timekeeper',
  'chronicler',
] as const;
export type WorldSimulationRetiredAgentName_ACU = typeof WORLD_SIMULATION_RETIRED_AGENT_NAMES_ACU[number];
export type WorldSimulationAgentKind_ACU = 'director' | 'planner' | 'specialist' | 'reviewer' | 'researcher';
export type { WorldSimulationLedgerModule_ACU };

export interface WorldSimulationAgentAccessProfile_ACU {
  snapshotTokens: readonly string[];
  tools: readonly WorldSimulationAgentNativeToolName_ACU[];
  allowSearch: boolean;
  readModules: readonly string[];
}

export interface WorldSimulationAgentDefinition_ACU {
  name: WorldSimulationAgentName_ACU;
  kind: WorldSimulationAgentKind_ACU;
  description: string;
  triggers: readonly string[];
  promptKey: WorldSimulationAgentName_ACU;
  apiRole: WorldSimulationAgentName_ACU;
  writableModules: readonly WorldSimulationLedgerModule_ACU[];
}

export const WORLD_SIMULATION_AGENT_CATALOG_ACU: readonly WorldSimulationAgentDefinition_ACU[] = [
  { name: 'world-director', kind: 'director', description: 'Giao diện trao đổi với người dùng: khi người dùng gửi tin trong hội thoại mô phỏng thì quyết định tiêu điểm mở màn hoặc bảo trì có định hướng; mô phỏng tự động không qua đạo diễn', triggers: ['Tin nhắn người dùng'], promptKey: 'world-director', apiRole: 'world-director', writableModules: [] },
  { name: 'undercurrent-analyst', kind: 'specialist', description: 'Mô phỏng diễn biến hậu trường của đồng hồ thế giới, áp lực chiều và vòng đời hạt giống dòng ngầm', triggers: ['Lô một của mỗi lượt mô phỏng'], promptKey: 'undercurrent-analyst', apiRole: 'undercurrent-analyst', writableModules: ['clock', 'dimensions', 'seeds'] },
  { name: 'dramatis-keeper', kind: 'specialist', description: 'Mô phỏng ranh giới thông tin của actor, vị trí và liên lạc của người chơi, và tin đồn đi kèm cái chết của nhân vật', triggers: ['Lô một của mỗi lượt mô phỏng'], promptKey: 'dramatis-keeper', apiRole: 'dramatis-keeper', writableModules: ['actors', 'player', 'rumors'] },
  { name: 'causality-reviewer', kind: 'reviewer', description: 'Rà soát thời gian, không gian, nhân quả, revision, quyền hạn và bằng chứng của diễn biến hậu trường, không ghi vào guidance', triggers: ['Chung thẩm ứng viên đường dẫn người dùng'], promptKey: 'causality-reviewer', apiRole: 'causality-reviewer', writableModules: [] },
  { name: 'guidance-composer', kind: 'specialist', description: 'Tổng hợp thay đổi của lượt này: ghi niên biểu hậu trường, bảo trì tin đồn thế giới và quyết định phép chiếu lên mặt tiền', triggers: ['Lô hai của mỗi lượt mô phỏng'], promptKey: 'guidance-composer', apiRole: 'guidance-composer', writableModules: ['chronicle', 'rumors', 'guidance'] },
  { name: 'lore-researcher', kind: 'researcher', description: 'Bổ sung tài liệu thiết lập công khai bên ngoài để hỗ trợ mô phỏng hậu trường, không ghi vào sổ cái thế giới', triggers: ['Bằng chứng cục bộ không đủ và cho phép nghiên cứu bên ngoài'], promptKey: 'lore-researcher', apiRole: 'lore-researcher', writableModules: [] },
];

const LEGACY_ROLE_DEFINITIONS_ACU: readonly WorldSimulationAgentDefinition_ACU[] = [
  { name: 'timekeeper', kind: 'specialist', description: 'Đẩy tiến hậu trường của đồng hồ thế giới, tạo ứng viên clockAdvance', triggers: ['Khôi phục lần chạy cũ'], promptKey: 'timekeeper', apiRole: 'timekeeper', writableModules: ['clock'] },
  { name: 'chronicler', kind: 'specialist', description: 'Tổng hợp việc kết thúc dòng ngầm, kết cục nhân vật và dọn dẹp những điều bị bỏ lỡ, ghi lại sự kiện lớn dưới mặt tiền và bảo trì các tin đồn đang lan truyền trong thế giới', triggers: ['Khôi phục lần chạy cũ'], promptKey: 'chronicler', apiRole: 'chronicler', writableModules: ['chronicle', 'rumors'] },
];

export type WorldSimulationAgentNativeToolName_ACU = Extract<AgentNativeToolName_ACU, 'read' | 'search' | 'write_sql'>;

/**
 * 推演角色的单一访问契约。快照裁剪、provider tools 与基础读取域均从这里派生；
 * writableModules 仍由目录定义，用于提交权限和其关联只读模块扩展。
 */
export const WORLD_SIMULATION_AGENT_ACCESS_PROFILES_ACU: Record<WorldSimulationAgentName_ACU, WorldSimulationAgentAccessProfile_ACU> = {
  'world-director': { snapshotTokens: [], tools: ['read', 'search'], allowSearch: true, readModules: [] },
  'world-stage-planner': { snapshotTokens: ['$WORLD_COLLISIONS', '$WORLD_STAGE_PLAN'], tools: ['read'], allowSearch: false, readModules: ['clock', 'dimensions', 'seeds', 'actors', 'player', 'rumors', 'chronicle', 'guidance'] },
  timekeeper: { snapshotTokens: ['$WORLD_STATE'], tools: ['read', 'write_sql'], allowSearch: false, readModules: ['clock'] },
  'undercurrent-analyst': { snapshotTokens: ['$WORLD_STATE', '$WORLD_COLLISIONS'], tools: ['read', 'write_sql'], allowSearch: false, readModules: ['clock', 'dimensions', 'seeds', 'actors', 'rumors'] },
  'dramatis-keeper': { snapshotTokens: ['$WORLD_STATE', '$WORLD_COLLISIONS', '$ANCHOR_IDENTITY'], tools: ['read', 'write_sql'], allowSearch: false, readModules: ['clock', 'actors', 'player', 'rumors', 'seeds', 'dimensions'] },
  chronicler: { snapshotTokens: ['$WORLD_STATE', '$WORLD_CHRONICLE'], tools: ['read', 'write_sql'], allowSearch: false, readModules: ['chronicle', 'rumors', 'clock', 'actors', 'seeds'] },
  'causality-reviewer': { snapshotTokens: ['$WORLD_STATE', '$WORLD_CANDIDATES', '$CURRENT_EVIDENCE_REGISTRY', '$WORLD_COLLISIONS'], tools: ['read'], allowSearch: false, readModules: ['clock', 'dimensions', 'seeds', 'actors', 'player', 'rumors', 'chronicle', 'guidance'] },
  'guidance-composer': { snapshotTokens: ['$WORLD_STATE', '$WORLD_CHRONICLE', '$WORLD_COLLISIONS'], tools: ['read', 'write_sql'], allowSearch: false, readModules: ['clock', 'dimensions', 'seeds', 'actors', 'player', 'rumors', 'chronicle', 'guidance'] },
  'lore-researcher': { snapshotTokens: ['$WORLD_TOOL_CATALOG'], tools: ['read', 'search'], allowSearch: true, readModules: [] },
};

export function getWorldSimulationAgentAccessProfile_ACU(name: WorldSimulationAgentName_ACU): WorldSimulationAgentAccessProfile_ACU {
  const profile = WORLD_SIMULATION_AGENT_ACCESS_PROFILES_ACU[name];
  if (!profile) throw new Error('WORLD_SIMULATION_AGENT_PROFILE_INVALID');
  return profile;
}

/**
 * 角色的 provider 工具白名单。这里是最终 body.tools 的唯一策略来源；
 * 普通角色不因共享 schema 获得 search，能写入账本的角色才获得 write_sql。
 */
export function worldSimulationAgentNativeTools_ACU(
  name: WorldSimulationAgentName_ACU,
): readonly WorldSimulationAgentNativeToolName_ACU[] {
  return getWorldSimulationAgentAccessProfile_ACU(name).tools;
}

/** 只接受完整的条目地址；目录提示与派工 reads 均不能提升角色权限。 */
export function worldSimulationCanReadAddress_ACU(name: WorldSimulationAgentName_ACU, address: string): boolean {
  const definition = findWorldSimulationAgentDefinition_ACU(name);
  if (!definition) return false;
  const profile = getWorldSimulationAgentAccessProfile_ACU(name);
  if (profile.allowSearch && (definition.kind === 'director' || definition.kind === 'researcher')) return true;
  if (address === 'anchor:message') return true;
  if (name === 'causality-reviewer') {
    return address === 'ledger:current' || address === 'candidates:current'
      || address === 'stage-plan:current' || address === 'chronicle:current'
      || /^(?:dimensions|seeds|actors|rumors|chronicle):[^:]+$/.test(address)
      || /^field:(?:clock|dimensions|seeds|actors|player|rumors|chronicle|guidance):[^:]+(?::[^:]+)?$/.test(address);
  }
  if (definition.kind !== 'specialist' && definition.kind !== 'planner') return false;
  if (name === 'guidance-composer') {
    if (address === 'ledger:current' || address === 'player:current' || address === 'projection:preview') return true;
  }
  // 旧运行恢复仍允许编年官读取归档；新流程由统合角色接管。
  if ((name === 'guidance-composer' || name === 'chronicler') && /^chronicle-archive:[^:]+$/.test(address)) return true;
  const modules = new Set<string>([...profile.readModules, ...definition.writableModules]);
  for (const module of definition.writableModules) {
    for (const related of WORLD_RELATED_READONLY_MODULES_ACU[module] ?? []) modules.add(related);
  }
  if (name === 'guidance-composer') {
    for (const module of ['clock', 'dimensions', 'seeds', 'actors', 'player', 'rumors', 'chronicle']) modules.add(module);
  }
  const item = /^(clock|dimensions|seeds|actors|player|rumors|chronicle|guidance):([^:]+)$/.exec(address);
  if (item) return modules.has(item[1]);
  const field = /^field:([a-z]+):([^:]+)(?::([^:]+))?$/.exec(address);
  return !!field && modules.has(field[1]);
}

export function findWorldSimulationAgentDefinition_ACU(name: string): WorldSimulationAgentDefinition_ACU | null {
  return WORLD_SIMULATION_AGENT_CATALOG_ACU.find(item => item.name === name) ?? LEGACY_ROLE_DEFINITIONS_ACU.find(item => item.name === name) ?? null;
}

/** 主 Agent 可见目录：仅列出有调用入口的角色；旧配置所需角色仍留在正式目录。 */
export function worldSimulationDirectorVisibleCatalog_ACU(): readonly WorldSimulationAgentDefinition_ACU[] {
  return WORLD_SIMULATION_AGENT_CATALOG_ACU.filter(item => item.name !== 'lore-researcher');
}
