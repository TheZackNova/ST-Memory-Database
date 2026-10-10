import {
  WORLD_SIMULATION_SCHEMA_VERSION_ACU,
  type WorldCollisionReport_ACU,
  type WorldSimulationEnvelope_ACU,
  type WorldSimulationLedgerModule_ACU,
  type WorldSimulationStagePlan_ACU,
  type WorldSimulationStageRevision_ACU,
  type WorldSimulationSettings_ACU,
} from './model';

const DIRECTOR_OWNED_SPECIALISTS_ACU = ['timekeeper', 'undercurrent-analyst', 'dramatis-keeper'] as const;
const DIRECTOR_OWNED_LEDGER_CHANGES_ACU: WorldSimulationLedgerModule_ACU[] = ['clock', 'dimensions', 'seeds', 'actors', 'rumors', 'player'];

/**
 * 新建 run 不再单独调用 planner LLM。阶段计划由确定性模板填入，
 * director 首轮把「锁定焦点」与取证/派工写进同一次决策。
 * chronicler 不进入常规 plannedSpecialists。
 */
export function buildDirectorOwnedStageRevision_ACU(input: {
  instruction: string;
  collisions: WorldCollisionReport_ACU;
  now?: number;
}): WorldSimulationStageRevision_ACU {
  const factsToVerify = [
    ...(input.collisions.collidedSeeds.length ? [`Dòng ngầm va chạm: ${input.collisions.collidedSeeds.join(', ')}`] : []),
    ...(input.collisions.ripeRumors.length ? [`Tin đồn chín muồi: ${input.collisions.ripeRumors.join(', ')}`] : []),
    'Khoảng thời gian của chính văn',
    'Áp lực chiều và vòng đời dòng ngầm',
    'Ranh giới thông tin của actor',
  ];
  const objective = input.instruction.trim() || 'Mô phỏng động thái thế giới hậu trường dựa trên cốt truyện mới nhất';
  return {
    revision: 1,
    createdAt: input.now ?? Date.now(),
    reason: 'initial',
    replanInstruction: '',
    frozen: false,
    plan: {
      schemaVersion: WORLD_SIMULATION_SCHEMA_VERSION_ACU,
      title: 'Mô phỏng hậu trường lượt này',
      objective,
      impactScope: ['Trạng thái thế giới hiện tại'],
      factsToVerify,
      plannedTools: ['read'],
      plannedSpecialists: [...DIRECTOR_OWNED_SPECIALISTS_ACU],
      expectedLedgerChanges: [...DIRECTOR_OWNED_LEDGER_CHANGES_ACU],
      convergenceConditions: ['Bằng chứng và ứng viên đã khép kín'],
      blockingConditions: ['Thiếu neo hoặc bằng chứng then chốt'],
      completedSteps: [],
      nextStep: 'Giao việc cùng lô sau khi thu thập bằng chứng',
    },
  };
}


export function confirmWorldSimulationStageRevision_ACU(revision: WorldSimulationStageRevision_ACU): WorldSimulationStageRevision_ACU {
  if (revision.frozen) return { ...revision, plan: { ...revision.plan } };
  return { ...revision, frozen: true, plan: { ...revision.plan } };
}

export function replaceWorldSimulationStagePlan_ACU(revision: WorldSimulationStageRevision_ACU, plan: WorldSimulationStagePlan_ACU): WorldSimulationStageRevision_ACU {
  if (revision.frozen) throw new Error('WORLD_SIMULATION_STAGE_REVISION_FROZEN');
  if (plan.schemaVersion !== WORLD_SIMULATION_SCHEMA_VERSION_ACU) throw new Error('WORLD_SIMULATION_STAGE_PLAN_SCHEMA_INVALID');
  return { ...revision, plan: { ...plan } };
}

export function activeWorldSimulationStageRevision_ACU(envelope: WorldSimulationEnvelope_ACU): WorldSimulationStageRevision_ACU | null {
  const stage = envelope.stages.find(item => item.stageId === envelope.activeStageId);
  return stage?.revisions.find(item => item.revision === stage.activeRevision) ?? null;
}
