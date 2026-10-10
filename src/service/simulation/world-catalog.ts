import { WORLD_CHRONICLE_HOT_WINDOW_ACU, type WorldChronicleOverviewRow_ACU, type WorldLocationRef_ACU, type WorldSimulationLedger_ACU } from './model';
import { buildArchiveHints_ACU, type WorldArchiveHint_ACU } from './archive-hints';
import { recentWorldActorExperiences_ACU } from './actor-timeline';

export interface WorldCatalogRow_ACU {
  id: string;
  name: string;
  summary: string;
  readAddress: string;
}

export interface WorldInUseCatalog_ACU {
  clock: WorldSimulationLedger_ACU['clock'];
  player: WorldSimulationLedger_ACU['player'];
  dimensions: WorldCatalogRow_ACU[];
  seeds: WorldCatalogRow_ACU[];
  actors: WorldCatalogRow_ACU[];
  rumors: WorldCatalogRow_ACU[];
  chronicleHot: WorldCatalogRow_ACU[];
  readHint: string;
}

export const WORLD_CATALOG_READ_HINT_ACU = 'Mọi mục trong danh mục đều có thể xem chi tiết bằng công cụ read theo địa chỉ (mục đang dùng như seeds:{id}; trạng thái theo từng cột phải dùng field:seeds:{id} hoặc field:seeds:{id}:title; tóm tắt lưu trữ qua chronicle-archive:{archiveRef}). Không được bỏ ID mục trong địa chỉ field.';
export const WORLD_SUBAGENT_DEDUP_HINT_ACU = 'Danh mục dưới đây gồm tài liệu đang có hiệu lực và những việc đã xảy ra (kèm chỉ mục tóm tắt đã lưu trữ); nếu sự kiện bạn sắp mô phỏng về bản chất giống một mục trong danh mục đã xảy ra thì đừng mô phỏng lặp lại.';

function clip_ACU(value: string, max = 80): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function row_ACU(id: string, name: string, summary: string, module: string, max = 80): WorldCatalogRow_ACU {
  return { id, name, summary: clip_ACU(summary, max), readAddress: `${module}:${id}` };
}

function locationText_ACU(ref: WorldLocationRef_ACU | null | undefined, fallback = ''): string {
  return ref ? [ref.region, ref.place].filter(Boolean).join('·') : fallback;
}

/** 目录摘要是条目整体的浓缩：状态、位置、驱动因素与关联，一眼可判断是否需要精读。 */
function joinParts_ACU(parts: ReadonlyArray<string | false | 0 | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join('; ');
}

/** 已结束条目的显式标注，避免其他 AI 把已收场的事当成仍在进行。 */
export function worldLedgerEndedLabel_ACU(module: 'seeds' | 'rumors' | 'actors', row: Record<string, unknown>): string | null {
  if (module === 'seeds') {
    if (row.status === 'resolved') return 'Đã kết thúc: đã khép lại';
    if (row.status === 'retired') return `Đã kết thúc: đã nghỉ hưu${row.retiredReason ? ` (${String(row.retiredReason)})` : ''}`;
  }
  if (module === 'rumors') {
    if (row.status === 'revealed') return 'Đã kết thúc: nhân vật chính đã biết';
    if (row.status === 'dead') return 'Đã kết thúc: đã mất hiệu lực';
  }
  if (module === 'actors' && row.life === 'dead') return 'Đã kết thúc: đã chết';
  return null;
}

/**
 * 注入子代理的完整行视图：已结束条目追加 ended 标注；人物经历只带最近若干条。
 * 只读视图，不写回账本；ended 不是可写列。
 */
export function worldLedgerRowsForAgent_ACU<T extends object>(module: 'seeds' | 'rumors' | 'actors', rows: readonly T[]): Array<T & { ended?: string }> {
  return rows.map(row => {
    const view = { ...row } as unknown as Record<string, unknown>;
    if (module === 'actors' && Array.isArray(view.experiences)) {
      view.experiences = recentWorldActorExperiences_ACU(view as { experiences: never[] });
    }
    const ended = worldLedgerEndedLabel_ACU(module, view);
    if (ended) view.ended = ended;
    return view as T & { ended?: string };
  });
}

function actorActionText_ACU(action: { text: string; expectedDuration: string } | null | undefined): string {
  return action ? `${action.text} (dự kiến ${action.expectedDuration})` : '';
}

function actorLatestExperience_ACU(item: WorldSimulationLedger_ACU['actors'][number]): string {
  const latest = recentWorldActorExperiences_ACU(item, 1)[0];
  return latest ? `Trải nghiệm gần đây: ${latest.text} (ngày ${latest.endedAtDay} ${latest.status === 'done' ? 'hoàn tất' : 'bị dừng'})` : '';
}

export function buildInUseWorldCatalog_ACU(ledger: WorldSimulationLedger_ACU): WorldInUseCatalog_ACU {
  const activeSeeds = ledger.seeds.filter(seed => seed.status !== 'resolved' && seed.status !== 'retired');
  const activeRumors = ledger.rumors.filter(rumor => rumor.status === 'latent' || rumor.status === 'ripe');
  const hot = ledger.chronicle.slice(-WORLD_CHRONICLE_HOT_WINDOW_ACU);
  return {
    clock: ledger.clock,
    player: ledger.player,
    dimensions: ledger.dimensions.map(item => row_ACU(item.id, item.name, `${item.kind} ${item.value} ${item.trend} ${item.rationale}`, 'dimensions')),
    seeds: activeSeeds.map(item => row_ACU(item.id, item.title, joinParts_ACU([
      `${item.status} lv${item.level} ${item.visibility}`,
      locationText_ACU(item.location) && `@${locationText_ACU(item.location)}`,
      item.catalyst && `Xúc tác: ${item.catalyst}`,
      item.expiresAtDay !== null && `Hạn chót ngày ${item.expiresAtDay}`,
      item.actorIds.length > 0 && `Nhân vật: ${item.actorIds.join(',')}`,
    ]), 'seeds', 140)),
    actors: ledger.actors.map(item => row_ACU(item.id, item.name, joinParts_ACU([
      item.life === 'dead' ? `Đã kết thúc: đã chết ${item.visibility}` : `${item.life} ${item.visibility}`,
      `@${locationText_ACU(item.locationRef, item.location) || 'Không rõ'}`,
      item.life === 'dead' && item.deathSummary && `Nguyên nhân chết: ${item.deathSummary}`,
      item.life !== 'dead' && item.currentAction && `Đang làm: ${actorActionText_ACU(item.currentAction)}`,
      item.life !== 'dead' && item.longTermAction && `Dài hạn: ${actorActionText_ACU(item.longTermAction)}`,
      item.goals.length > 0 && `Mục tiêu: ${item.goals.slice(0, 2).join(', ')}`,
      item.interests.length > 0 && `Quan tâm: ${item.interests.slice(0, 2).join(', ')}`,
      actorLatestExperience_ACU(item),
    ]), 'actors', 220)),
    rumors: activeRumors.map(item => row_ACU(item.id, item.fact, `${item.status} ${item.channels.join(',')}`, 'rumors')),
    chronicleHot: hot.map(item => ({
      id: item.id,
      name: item.at,
      summary: clip_ACU(item.summary),
      readAddress: `chronicle:${item.id}`,
    })),
    readHint: WORLD_CATALOG_READ_HINT_ACU,
  };
}

export const WORLD_RELATED_READONLY_MODULES_ACU: Record<string, readonly string[]> = {
  dimensions: ['actors'],
  seeds: ['actors', 'rumors'],
  actors: ['seeds', 'dimensions'],
  rumors: ['seeds'],
  chronicle: ['seeds', 'actors', 'rumors'],
};
export const WORLD_RELATED_READONLY_HINT_ACU = 'Danh mục chỉ đọc của module liên quan: chỉ dùng để căn chỉnh tham chiếu và đối chiếu tính nhất quán, cấm ghi; dòng danh mục có readAddress, có thể dùng công cụ read để xem chi tiết.';

export function sliceModuleCatalog_ACU(
  catalog: WorldInUseCatalog_ACU,
  overview: readonly WorldChronicleOverviewRow_ACU[],
  writableModules: readonly string[],
): Record<string, unknown> {
  const writable = new Set(writableModules);
  // 普通角色的目录不能沿用导演的“任一条目可读”提示，也不能无条件附带玩家状态。
  const slice: Record<string, unknown> = {
    readHint: 'Chỉ gọi read theo địa chỉ danh mục mà vai trò hiện tại được ủy quyền; tài liệu không có trong danh mục không có nghĩa là đọc được. Địa chỉ trường phải chứa ID mục.',
  };
  if (writableModules.some(module => ['clock', 'dimensions', 'seeds', 'actors', 'chronicle', 'rumors'].includes(module))) {
    slice.clock = catalog.clock;
  }
  if (writable.has('actors')) slice.player = catalog.player;
  if (writable.has('dimensions')) slice.dimensions = catalog.dimensions;
  if (writable.has('seeds')) slice.seeds = catalog.seeds;
  if (writable.has('actors')) slice.actors = catalog.actors;
  if (writable.has('rumors')) slice.rumors = catalog.rumors;
  if (writable.has('chronicle')) {
    slice.chronicleHot = catalog.chronicleHot;
    slice.chronicleOverview = overview.map(row => ({
      day: row.day,
      oneLine: row.oneLine,
      archiveRef: row.archiveRef,
      readAddress: `chronicle-archive:${row.archiveRef}`,
    }));
    slice.dedupHint = WORLD_SUBAGENT_DEDUP_HINT_ACU;
  }
  const readonlyModules: Record<string, unknown> = {};
  for (const module of writableModules) {
    for (const related of WORLD_RELATED_READONLY_MODULES_ACU[module] ?? []) {
      if (writable.has(related) || readonlyModules[related]) continue;
      readonlyModules[related] = (catalog as unknown as Record<string, unknown>)[related];
    }
  }
  if (Object.keys(readonlyModules).length) {
    slice.relatedReadonly = readonlyModules;
    slice.relatedHint = WORLD_RELATED_READONLY_HINT_ACU;
  }
  return slice;
}

export function summarizeCandidatePatches_ACU(candidates: readonly { candidateId: string; agentName: string; patch: Record<string, unknown>; summary: string }[]): Array<Record<string, unknown>> {
  return candidates.map(candidate => {
    const diff: Record<string, string> = {};
    for (const [module, patch] of Object.entries(candidate.patch)) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        diff[module] = 'updated';
        continue;
      }
      const record = patch as Record<string, unknown>;
      if (Array.isArray(record.upsert)) diff[module] = `upsert+${record.upsert.length}`;
      else if (Array.isArray(record.append)) diff[module] = `append+${record.append.length}`;
      else if (module === 'chronicleArchive' && Array.isArray(record.overviewRows)) diff[module] = `archive+${record.overviewRows.length}`;
      else diff[module] = `keys:${Object.keys(record).join(',')}`;
    }
    return { candidateId: candidate.candidateId, agentName: candidate.agentName, summary: candidate.summary, diff };
  });
}

export function catalogArchiveHints_ACU(
  candidates: readonly { patch: Record<string, unknown> }[],
  overview: readonly WorldChronicleOverviewRow_ACU[],
): WorldArchiveHint_ACU[] {
  const entries = candidates.flatMap(candidate => {
    const chronicle = candidate.patch.chronicle;
    if (!chronicle || typeof chronicle !== 'object' || Array.isArray(chronicle)) return [];
    const append = (chronicle as { append?: unknown }).append;
    return Array.isArray(append) ? append as Array<{ summary?: string; at?: string; relatedIds?: string[] }> : [];
  }).flatMap(item => typeof item?.summary === 'string' && typeof item.at === 'string'
    ? [{ summary: item.summary, at: item.at, relatedIds: Array.isArray(item.relatedIds) ? item.relatedIds.filter((id): id is string => typeof id === 'string') : [] }]
    : []);
  return buildArchiveHints_ACU(entries, overview);
}
