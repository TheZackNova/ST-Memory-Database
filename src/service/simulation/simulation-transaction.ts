import type { WorldSimulationCandidate_ACU } from './agent/agent-model';
import type { WorldChronicleArchiveDetail_ACU, WorldChronicleArchiveSnapshot_ACU } from './agent/agent-model';
import { findWorldSimulationAgentDefinition_ACU } from './agent/agent-catalog';
import { buildDefaultWorldSimulationSettings_ACU } from './defaults';
import { WorldSimulationValidationError_ACU, createWorldSimulationError_ACU, WORLD_CHRONICLE_OVERVIEW_CAP_ACU, type WorldChronicleOverviewRow_ACU, type WorldGuidanceSignal_ACU, type WorldSimulationLedger_ACU, type WorldSimulationLedgerModule_ACU, type WorldSimulationPendingFix_ACU, type WorldSimulationSettings_ACU } from './model';
import {
  coerceWorldSimulationContact_ACU,
  coerceWorldSimulationGuidanceVoice_ACU,
  coerceWorldSimulationInteger_ACU,
  coerceWorldSimulationStringArray_ACU,
  allocateWorldSimulationPrefixedId_ACU,
  WORLD_SIMULATION_UPSERT_ID_PREFIX_ACU,
  normalizeWorldSimulationUpsertItem_ACU,
  type WorldSimulationPatchFixSeverity_ACU,
  type WorldSimulationUpsertModule_ACU,
} from './simulation-patch-normalize';
import { eventFingerprint_ACU } from './event-similarity';
import { collectWorldSimulationLedgerViolations_ACU, validateWorldSimulationLedger_ACU } from './simulation-store';
import { validateWorldSimulationGuidanceComposerSignals_ACU } from './agent/agent-protocol';
import { WorldSimulationSqlViewError_ACU, materializeWorldSimulationLedgerSqlView_ACU, type WorldSimulationSqlArrayModule_ACU, type WorldSimulationSqlSingleton_ACU } from './simulation-ledger-sql-view';
import { stampWorldActorTimelines_ACU } from './actor-timeline';

const MODULES_ACU = ['clock', 'dimensions', 'seeds', 'actors', 'chronicle', 'guidance', 'rumors', 'player'] as const;
type Module_ACU = typeof MODULES_ACU[number];
type Record_ACU = Record<string, unknown>;

function isRecord_ACU(value: unknown): value is Record_ACU { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fail_ACU(message: string, details?: Record_ACU): never {
  throw new WorldSimulationValidationError_ACU(createWorldSimulationError_ACU('WORLD_SIMULATION_AGENT_PROTOCOL_INVALID', 'agent_persist', message, false, details));
}
function revisionFail_ACU(message: string, details?: Record_ACU): never {
  throw new WorldSimulationValidationError_ACU(createWorldSimulationError_ACU('WORLD_SIMULATION_REVISION_CONFLICT', 'agent_persist', message, false, details));
}
function exactKeys_ACU(raw: Record_ACU, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail_ACU(`${path} có trường không xác định`, { path: `${path}.${key}` });
}
function clone_ACU<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function refs_ACU(value: unknown, path: string): string[] {
  const coerced = coerceWorldSimulationStringArray_ACU(value);
  if (!coerced.ok) fail_ACU(`${path} phải là mảng chuỗi và phần tử không được rỗng`);
  return coerced.value;
}

function resolveDynamics_ACU(settings?: WorldSimulationSettings_ACU): WorldSimulationSettings_ACU['dynamics'] {
  return settings?.dynamics ?? buildDefaultWorldSimulationSettings_ACU().dynamics;
}

function singletonPatch_ACU(raw: unknown, revision: number, module: string): unknown {
  if (!isRecord_ACU(raw) || !Object.prototype.hasOwnProperty.call(raw, 'expectedRevision')) return raw;
  const expected = raw.expectedRevision;
  if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) {
    fail_ACU(`patch.${module}.expectedRevision phải là số nguyên không âm`, { path: `patch.${module}.expectedRevision` });
  }
  if (expected !== revision) revisionFail_ACU(`patch.${module} xung đột revision sổ cái`, { expectedRevision: expected, actualRevision: revision, revisionConflict: true });
  const { expectedRevision: _expectedRevision, ...patch } = raw;
  return patch;
}

function applyUpserts_ACU<T extends { id: string; revision: number }>(
  current: readonly T[],
  raw: unknown,
  path: string,
  module: WorldSimulationUpsertModule_ACU,
  clockDay: number,
  onViolation?: (message: string, details?: Record_ACU) => void,
): T[] {
  const reject = (message: string, details?: Record_ACU): boolean => {
    if (onViolation) {
      onViolation(message, details);
      return true;
    }
    if (details?.revisionConflict) revisionFail_ACU(message, details);
    fail_ACU(message, details);
  };
  if (!isRecord_ACU(raw)) {
    reject(`${path} phải là đối tượng`);
    return current.map(item => clone_ACU(item));
  }
  if (onViolation) {
    for (const key of Object.keys(raw)) if (key !== 'upsert' && key !== 'remove') reject(`${path} có trường không xác định`, { path: `${path}.${key}`, severity: 'blocking' });
  } else {
    exactKeys_ACU(raw, ['upsert', 'remove'], path);
  }
  const upserts = raw.upsert === undefined ? [] : raw.upsert;
  const removals = raw.remove === undefined ? [] : raw.remove;
  if (!Array.isArray(upserts) || !Array.isArray(removals) || (!upserts.length && !removals.length)) {
    reject(`${path} phải chứa mảng upsert hoặc remove không rỗng`);
    return current.map(item => clone_ACU(item));
  }
  const result = current.map(item => clone_ACU(item));
  const seen = new Set<string>();
  for (const [index, removal] of removals.entries()) {
    const itemPath = `${path}.remove[${index}]`;
    if (!isRecord_ACU(removal)) {
      reject(`${itemPath} phải là đối tượng`, { path: itemPath, severity: 'blocking' });
      continue;
    }
    const id = typeof removal.id === 'string' ? removal.id.trim() : '';
    const reason = typeof removal.reason === 'string' ? removal.reason.trim() : '';
    const expected = coerceWorldSimulationInteger_ACU(removal.expectedRevision);
    const existingIndex = id ? result.findIndex(entry => entry.id === id) : -1;
    if (!id || !reason || !expected.ok || expected.value < 0) {
      reject(`${itemPath} phải chứa id/reason không rỗng và expectedRevision là số nguyên không âm`, { path: itemPath, severity: 'blocking' });
      continue;
    }
    if (seen.has(id)) {
      reject(`${path} ghi lặp cho cùng một ID`, { id, path: itemPath, severity: 'blocking' });
      continue;
    }
    if (existingIndex < 0) {
      reject(`${itemPath}.id không tồn tại`, { id, path: `${itemPath}.id`, severity: 'blocking' });
      continue;
    }
    if (result[existingIndex].revision !== expected.value) {
      reject(`${itemPath} xung đột revision của mục`, { id, expectedRevision: expected.value, actualRevision: result[existingIndex].revision, revisionConflict: true, path: itemPath, severity: 'blocking' });
      continue;
    }
    seen.add(id);
    result.splice(existingIndex, 1);
  }
  for (const [index, item] of upserts.entries()) {
    const itemPath = `${path}.upsert[${index}]`;
    const existingIndex = isRecord_ACU(item) && typeof item.id === 'string' && item.id.trim() ? result.findIndex(entry => entry.id === item.id) : -1;
    const existing = existingIndex < 0 ? null : result[existingIndex] as unknown as Record_ACU;
    const allocateNewId = existing ? undefined : () => {
      const taken = [...result.map(entry => entry.id), ...seen];
      return allocateWorldSimulationPrefixedId_ACU(WORLD_SIMULATION_UPSERT_ID_PREFIX_ACU[module], taken);
    };
    const normalized = normalizeWorldSimulationUpsertItem_ACU({ module, item, existing, path: itemPath, clockDay, allocateNewId });
    let blocked = false;
    for (const note of normalized.notes) {
      if (onViolation) {
        onViolation(note.message, { path: note.path, severity: note.severity, ...note.details });
        if (note.severity === 'blocking') blocked = true;
        continue;
      }
      if (note.severity === 'blocking') {
        reject(note.message, { path: note.path, ...note.details });
      }
    }
    if (blocked || !normalized.item) continue;
    const id = String(normalized.item.id);
    if (seen.has(id)) {
      if (reject(`${path} ghi lặp cho cùng một ID`, { id, path: itemPath, severity: 'blocking' })) continue;
    }
    seen.add(id);
    if (existingIndex < 0) result.push(normalized.item as T);
    else result[existingIndex] = normalized.item as T;
  }
  return result;
}

function collectEvidenceRefs_ACU(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) { for (const item of value) collectEvidenceRefs_ACU(item, output); return output; }
  if (!isRecord_ACU(value)) return output;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'evidenceRefs') output.push(...refs_ACU(item, 'patch.evidenceRefs'));
    else collectEvidenceRefs_ACU(item, output);
  }
  return output;
}

function applyClock_ACU(current: WorldSimulationLedger_ACU['clock'], raw: unknown, dynamics: WorldSimulationSettings_ACU['dynamics']): WorldSimulationLedger_ACU['clock'] {
  if (!isRecord_ACU(raw)) fail_ACU('patch.clock phải là đối tượng');
  exactKeys_ACU(raw, ['days', 'storyTime', 'slot', 'evidenceRefs'], 'patch.clock');
  if (!Object.keys(raw).length) fail_ACU('patch.clock không được để trống');
  let days = 0;
  if (raw.days !== undefined) {
    const coerced = coerceWorldSimulationInteger_ACU(raw.days);
    if (!coerced.ok || coerced.value < 0) fail_ACU('patch.clock.days phải là số nguyên không âm (clockAdvance chỉ cho phép đẩy tiến đơn điệu về phía trước, cấm ghi trực tiếp day)');
    days = coerced.value;
  }
  if (days > dynamics.maxClockAdvanceDays) {
    const advanceRefs = raw.evidenceRefs;
    if (!Array.isArray(advanceRefs) || !advanceRefs.length || advanceRefs.some(item => typeof item !== 'string' || !item.trim())) {
      fail_ACU(`patch.clock.days vượt quá maxClockAdvanceDays=${dynamics.maxClockAdvanceDays}, phải cung cấp evidenceRefs không rỗng`);
    }
  }
  return {
    day: current.day + days,
    slot: raw.slot === undefined ? current.slot
      : typeof raw.slot === 'string' ? raw.slot : fail_ACU('patch.clock.slot phải là chuỗi'),
    storyTime: raw.storyTime === undefined ? current.storyTime
      : typeof raw.storyTime === 'string' ? raw.storyTime : fail_ACU('patch.clock.storyTime phải là chuỗi'),
    precision: current.precision,
    evidenceRefs: raw.evidenceRefs === undefined ? [...current.evidenceRefs] : refs_ACU(raw.evidenceRefs, 'patch.clock.evidenceRefs'),
  };
}

function guidanceSignals_ACU(value: unknown, path: string): WorldGuidanceSignal_ACU[] {
  if (!Array.isArray(value)) fail_ACU(`${path} phải là mảng`);
  return value.map((item, index) => {
    if (!isRecord_ACU(item)) fail_ACU(`${path}[${index}] phải là đối tượng`);
    exactKeys_ACU(item, ['text', 'voice', 'sourceId'], `${path}[${index}]`);
    if (typeof item.text !== 'string' || !item.text.trim()) fail_ACU(`${path}[${index}].text phải là chuỗi không rỗng`);
    const voice = coerceWorldSimulationGuidanceVoice_ACU(item.voice);
    if (!voice.ok) fail_ACU(`${path}[${index}].voice không hợp lệ`, { actual: item.voice });
    if (typeof item.sourceId !== 'string' || !item.sourceId.trim()) fail_ACU(`${path}[${index}].sourceId phải là chuỗi không rỗng`);
    const signal: WorldGuidanceSignal_ACU = { text: item.text, voice: voice.value, sourceId: item.sourceId.trim() };
    return signal;
  });
}

function applyGuidance_ACU(current: WorldSimulationLedger_ACU['guidance'], raw: unknown, ledger: WorldSimulationLedger_ACU, anchorMessage = ''): WorldSimulationLedger_ACU['guidance'] {
  if (!isRecord_ACU(raw)) fail_ACU('patch.guidance phải là đối tượng');
  exactKeys_ACU(raw, ['signals', 'excludedFacts', 'evidenceRefs'], 'patch.guidance');
  if (!Object.keys(raw).length) fail_ACU('patch.guidance không được để trống');
  const signals = raw.signals === undefined ? [...current.signals] : guidanceSignals_ACU(raw.signals, 'patch.guidance.signals');
  if (raw.signals !== undefined) validateWorldSimulationGuidanceComposerSignals_ACU(signals, ledger, anchorMessage);
  return {
    signals,
    excludedFacts: raw.excludedFacts === undefined ? [...current.excludedFacts] : refs_ACU(raw.excludedFacts, 'patch.guidance.excludedFacts'),
    evidenceRefs: raw.evidenceRefs === undefined ? [...current.evidenceRefs] : refs_ACU(raw.evidenceRefs, 'patch.guidance.evidenceRefs'),
  };
}

function applyPlayer_ACU(current: WorldSimulationLedger_ACU['player'], raw: unknown): WorldSimulationLedger_ACU['player'] {
  if (!isRecord_ACU(raw)) fail_ACU('patch.player phải là đối tượng');
  exactKeys_ACU(raw, ['location', 'contact', 'evidenceRefs'], 'patch.player');
  if (!Object.keys(raw).length) fail_ACU('patch.player không được để trống');
  let location: WorldSimulationLedger_ACU['player']['location'] = current.location ? { ...current.location } : null;
  if (raw.location !== undefined) {
    if (raw.location === null) {
      location = null;
    } else {
      if (!isRecord_ACU(raw.location)) fail_ACU('patch.player.location phải là đối tượng hoặc null');
      exactKeys_ACU(raw.location, ['region', 'place'], 'patch.player.location');
      if (typeof raw.location.region !== 'string' || !raw.location.region.trim()) fail_ACU('patch.player.location.region phải là chuỗi không rỗng');
      const nextLocation: NonNullable<WorldSimulationLedger_ACU['player']['location']> = { region: raw.location.region };
      if (raw.location.place !== undefined) {
        if (typeof raw.location.place !== 'string') fail_ACU('patch.player.location.place phải là chuỗi');
        nextLocation.place = raw.location.place;
      }
      location = nextLocation;
    }
  }
  return {
    location,
    locationUpdatedAtDay: current.locationUpdatedAtDay,
    regionVisits: clone_ACU(current.regionVisits),
    contact: raw.contact === undefined ? current.contact
      : (() => {
        const contact = coerceWorldSimulationContact_ACU(raw.contact);
        return contact.ok ? contact.value : fail_ACU('patch.player.contact không hợp lệ');
      })(),
    evidenceRefs: raw.evidenceRefs === undefined ? [...current.evidenceRefs] : refs_ACU(raw.evidenceRefs, 'patch.player.evidenceRefs'),
  };
}

function checkCrossField_ACU(next: WorldSimulationLedger_ACU, onViolation?: (message: string, details?: Record_ACU) => void): void {
  const reject = (message: string, details?: Record_ACU): void => {
    if (onViolation) onViolation(message, details);
    else fail_ACU(message, details);
  };
  for (const rumor of next.rumors) {
    if (rumor.earliestRevealDay < rumor.originDay) reject('Mục rumors có earliestRevealDay phải >= originDay', { id: rumor.id, originDay: rumor.originDay, earliestRevealDay: rumor.earliestRevealDay });
    if (rumor.status === 'revealed' && !Number.isInteger(rumor.revealedAtDay)) reject('Mục rumors có status=revealed phải mang revealedAtDay là số nguyên', { id: rumor.id });
  }
  for (const actor of next.actors) {
    if (actor.life !== 'dead') continue;
    const companion = next.rumors.find(rumor => rumor.relatedActorIds.includes(actor.id) && rumor.channels.length > 0 && (actor.diedAtDay === null || rumor.earliestRevealDay >= actor.diedAtDay));
    if (!companion) reject('Mục actors có life=dead thiếu rumor đi kèm (relatedActorIds chứa actor đó, channels không rỗng, earliestRevealDay >= diedAtDay)', { id: actor.id, diedAtDay: actor.diedAtDay });
  }
}

function applyChronicle_ACU(
  current: WorldSimulationLedger_ACU['chronicle'],
  raw: unknown,
  clock: WorldSimulationLedger_ACU['clock'],
): WorldSimulationLedger_ACU['chronicle'] {
  if (!isRecord_ACU(raw)) fail_ACU('patch.chronicle phải là đối tượng');
  exactKeys_ACU(raw, ['append', 'remove'], 'patch.chronicle');
  const append = raw.append === undefined ? [] : raw.append;
  const remove = raw.remove === undefined ? [] : raw.remove;
  if (!Array.isArray(append) || !Array.isArray(remove) || (!append.length && !remove.length)) fail_ACU('patch.chronicle phải chứa mảng append hoặc remove không rỗng');
  const removedIds = new Set<string>();
  for (const [index, item] of remove.entries()) {
    const path = `patch.chronicle.remove[${index}]`;
    if (!isRecord_ACU(item)) fail_ACU(`${path} phải là đối tượng`);
    exactKeys_ACU(item, ['id', 'reason'], path);
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!id || !reason) fail_ACU(`${path} phải chứa id và reason không rỗng`);
    if (removedIds.has(id)) fail_ACU(`${path}.id bị trùng`, { id });
    if (!current.some(entry => entry.id === id)) fail_ACU(`${path}.id không tồn tại`, { id });
    removedIds.add(id);
  }
  const retained = current.filter(item => !removedIds.has(item.id));
  const taken = new Set(retained.map(item => item.id));
  const appended = append.map((item, index) => {
    const path = `patch.chronicle.append[${index}]`;
    if (!isRecord_ACU(item)) fail_ACU(`${path} phải là đối tượng`);
    const summary = typeof item.summary === 'string' ? item.summary.trim() : '';
    if (!summary) fail_ACU(`${path}.summary phải là chuỗi không rỗng`);
    let id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      id = allocateWorldSimulationPrefixedId_ACU(`chr-${clock.day}`, taken);
    }
    if (taken.has(id)) fail_ACU(`${path}.id xung đột với niên biểu hiện có hoặc cùng lô`, { id });
    taken.add(id);
    const at = typeof item.at === 'string' && item.at.trim()
      ? item.at.trim()
      : (clock.storyTime.trim() || `Ngày ${clock.day}`);
    const related = coerceWorldSimulationStringArray_ACU(item.relatedIds === undefined ? [] : item.relatedIds);
    if (!related.ok) fail_ACU(`${path}.relatedIds phải là mảng chuỗi`);
    const evidence = coerceWorldSimulationStringArray_ACU(item.evidenceRefs === undefined ? [] : item.evidenceRefs);
    if (!evidence.ok) fail_ACU(`${path}.evidenceRefs phải là mảng chuỗi`);
    // 主角错过标记由维护 AI 判定；空串视为普通纪要。
    const missedNote = typeof item.missedNote === 'string' && item.missedNote.trim() ? item.missedNote.trim() : null;
    return { id, at, summary, relatedIds: related.value, evidenceRefs: evidence.value, missedNote };
  });
  return [...clone_ACU(retained), ...appended];
}

const ARCHIVE_REF_RE_ACU = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function archiveRef_ACU(value: unknown, path: string): string {
  if (typeof value !== 'string' || !ARCHIVE_REF_RE_ACU.test(value)) fail_ACU(`${path} không phải archiveRef hợp lệ`);
  return value;
}

function overviewRow_ACU(raw: unknown, path: string): WorldChronicleOverviewRow_ACU {
  if (!isRecord_ACU(raw)) fail_ACU(`${path} phải là đối tượng`);
  exactKeys_ACU(raw, ['fingerprint', 'day', 'oneLine', 'archiveRef'], path);
  if (typeof raw.fingerprint !== 'string' || !raw.fingerprint.trim()) fail_ACU(`${path}.fingerprint phải là chuỗi không rỗng`);
  if (typeof raw.oneLine !== 'string' || !raw.oneLine.trim()) fail_ACU(`${path}.oneLine phải là chuỗi không rỗng`);
  const day = typeof raw.day === 'number' && Number.isInteger(raw.day) ? raw.day : NaN;
  if (!Number.isInteger(day) || day < 1) fail_ACU(`${path}.day phải là số nguyên >= 1`);
  return { fingerprint: raw.fingerprint, day, oneLine: raw.oneLine, archiveRef: archiveRef_ACU(raw.archiveRef, `${path}.archiveRef`) };
}

function archiveDetail_ACU(raw: unknown, path: string): WorldChronicleArchiveDetail_ACU {
  if (!isRecord_ACU(raw)) fail_ACU(`${path} phải là đối tượng`);
  exactKeys_ACU(raw, ['archiveRef', 'day', 'summary', 'fingerprints', 'relatedIds', 'sourceChronicleIds'], path);
  const stringList = (value: unknown, field: string): string[] => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) fail_ACU(`${path}.${field} phải là mảng chuỗi`);
    return value as string[];
  };
  const day = typeof raw.day === 'number' && Number.isInteger(raw.day) ? raw.day : NaN;
  if (!Number.isInteger(day) || day < 1) fail_ACU(`${path}.day phải là số nguyên >= 1`);
  if (typeof raw.summary !== 'string' || !raw.summary.trim()) fail_ACU(`${path}.summary phải là chuỗi không rỗng`);
  return {
    archiveRef: archiveRef_ACU(raw.archiveRef, `${path}.archiveRef`),
    day,
    summary: raw.summary,
    fingerprints: stringList(raw.fingerprints, 'fingerprints'),
    relatedIds: stringList(raw.relatedIds, 'relatedIds'),
    sourceChronicleIds: stringList(raw.sourceChronicleIds, 'sourceChronicleIds'),
  };
}

export interface WorldSimulationChronicleArchiveApply_ACU {
  overview: WorldChronicleOverviewRow_ACU[];
  writes: WorldChronicleArchiveDetail_ACU[];
}

export function applyChronicleArchive_ACU(
  current: readonly WorldChronicleOverviewRow_ACU[],
  raw: unknown,
  clockDay: number,
): WorldSimulationChronicleArchiveApply_ACU {
  if (!isRecord_ACU(raw)) fail_ACU('patch.chronicleArchive phải là đối tượng');
  exactKeys_ACU(raw, ['archiveEntries', 'overviewRows', 'collapseRefs'], 'patch.chronicleArchive');
  if (!Array.isArray(raw.archiveEntries) || raw.archiveEntries.length === 0) fail_ACU('patch.chronicleArchive.archiveEntries phải là mảng không rỗng');
  if (!Array.isArray(raw.overviewRows) || raw.overviewRows.length === 0) fail_ACU('patch.chronicleArchive.overviewRows phải là mảng không rỗng');
  const collapseRefs = raw.collapseRefs === undefined
    ? []
    : Array.isArray(raw.collapseRefs) && raw.collapseRefs.every(item => typeof item === 'string')
      ? raw.collapseRefs as string[]
      : fail_ACU('patch.chronicleArchive.collapseRefs phải là mảng chuỗi');
  const takenRefs = new Set(current.map(row => row.archiveRef));
  const filledEntries = raw.archiveEntries.map((item, index) => {
    const path = `patch.chronicleArchive.archiveEntries[${index}]`;
    if (!isRecord_ACU(item)) fail_ACU(`${path} phải là đối tượng`);
    const next = { ...item };
    const suppliedRef = typeof next.archiveRef === 'string' ? next.archiveRef.trim() : '';
    if (!suppliedRef) {
      const allocated = allocateWorldSimulationPrefixedId_ACU(`archive-${clockDay}`, takenRefs);
      next.archiveRef = allocated;
    }
    takenRefs.add(String(next.archiveRef));
    const relatedIds = Array.isArray(next.relatedIds) && next.relatedIds.every(value => typeof value === 'string')
      ? next.relatedIds as string[]
      : [];
    const fingerprints = Array.isArray(next.fingerprints) && next.fingerprints.every(value => typeof value === 'string')
      ? (next.fingerprints as string[]).map(value => value.trim()).filter(Boolean)
      : [];
    const day = typeof next.day === 'number' && Number.isInteger(next.day) ? next.day : clockDay;
    const summary = typeof next.summary === 'string' ? next.summary : '';
    if (!fingerprints.length) {
      next.fingerprints = [eventFingerprint_ACU(summary, String(day), relatedIds)];
    } else {
      next.fingerprints = fingerprints;
    }
    if (next.relatedIds === undefined) next.relatedIds = relatedIds;
    if (next.sourceChronicleIds === undefined) next.sourceChronicleIds = [];
    if (next.day === undefined) next.day = day;
    return next;
  });
  const writes = filledEntries.map((item, index) => archiveDetail_ACU(item, `patch.chronicleArchive.archiveEntries[${index}]`));
  const filledRows = raw.overviewRows.map((item, index) => {
    const path = `patch.chronicleArchive.overviewRows[${index}]`;
    if (!isRecord_ACU(item)) fail_ACU(`${path} phải là đối tượng`);
    const next = { ...item };
    const paired = writes[index];
    const suppliedRef = typeof next.archiveRef === 'string' ? next.archiveRef.trim() : '';
    if (!suppliedRef) {
      next.archiveRef = paired ? paired.archiveRef : allocateWorldSimulationPrefixedId_ACU(`archive-${clockDay}`, takenRefs);
      takenRefs.add(String(next.archiveRef));
    }
    const day = typeof next.day === 'number' && Number.isInteger(next.day) ? next.day : (paired?.day ?? clockDay);
    if (next.day === undefined) next.day = day;
    const oneLine = typeof next.oneLine === 'string' ? next.oneLine : '';
    const fingerprint = typeof next.fingerprint === 'string' ? next.fingerprint.trim() : '';
    if (!fingerprint) {
      next.fingerprint = paired?.fingerprints[0] || eventFingerprint_ACU(oneLine, String(day), paired?.relatedIds ?? []);
    }
    return next;
  });
  const overviewRows = filledRows.map((item, index) => overviewRow_ACU(item, `patch.chronicleArchive.overviewRows[${index}]`));
  const writeRefs = new Set(writes.map(item => item.archiveRef));
  if (writeRefs.size !== writes.length) fail_ACU('patch.chronicleArchive.archiveEntries archiveRef phải là duy nhất');
  const overviewRefs = new Set(overviewRows.map(item => item.archiveRef));
  if (overviewRefs.size !== overviewRows.length) fail_ACU('patch.chronicleArchive.overviewRows archiveRef phải là duy nhất');
  for (const row of overviewRows) {
    if (!writeRefs.has(row.archiveRef)) fail_ACU('overviewRows.archiveRef phải tương ứng với archiveEntries', { archiveRef: row.archiveRef });
  }
  const collapse = new Set(collapseRefs);
  const retained = current.filter(row => !collapse.has(row.archiveRef));
  const remainingRefs = new Set(retained.map(row => row.archiveRef));
  for (const row of overviewRows) {
    if (remainingRefs.has(row.archiveRef)) fail_ACU('archiveRef xung đột với danh mục tổng quan hiện có', { archiveRef: row.archiveRef });
    remainingRefs.add(row.archiveRef);
  }
  const overview = [...retained, ...overviewRows];
  if (overview.length > WORLD_CHRONICLE_OVERVIEW_CAP_ACU) {
    fail_ACU(`chronicleOverview sau khi thêm vượt quá ${WORLD_CHRONICLE_OVERVIEW_CAP_ACU} hàng, phải tự kèm collapseRefs để gộp hàng cũ`, {
      nextCount: overview.length,
      cap: WORLD_CHRONICLE_OVERVIEW_CAP_ACU,
    });
  }
  return { overview, writes };
}

function canWritePatchModule_ACU(module: string, writable: ReadonlySet<string>): boolean {
  if (module === 'chronicleArchive') return writable.has('chronicle');
  return (MODULES_ACU as readonly string[]).includes(module) && writable.has(module);
}

function orderedPatchEntries_ACU(patch: Record<string, unknown>): Array<[string, unknown]> {
  const entries = Object.entries(patch);
  const rank = (key: string): number => ({
    clock: 0, rumors: 1, dimensions: 2, seeds: 3, actors: 4, player: 5, chronicle: 6, chronicleArchive: 7, guidance: 8,
  }[key] ?? 99);
  entries.sort((left, right) => rank(left[0]) - rank(right[0]));
  return entries;
}

function pendingModuleOf_ACU(module: string): WorldSimulationLedgerModule_ACU {
  return module === 'chronicleArchive' ? 'chronicle' : module as WorldSimulationLedgerModule_ACU;
}

function recordPendingFix_ACU(
  pending: WorldSimulationPendingFix_ACU[],
  module: WorldSimulationLedgerModule_ACU,
  candidateId: string,
  agentName: string,
  violations: Array<{ path: string; message: string }>,
  day: number,
): void {
  const now = Date.now();
  const lastError = violations.map(item => item.message).join('; ') || 'Nhập kho module thất bại';
  const index = pending.findIndex(item => item.module === module);
  if (index >= 0) {
    const previous = pending[index];
    pending[index] = {
      module,
      candidateId: candidateId || previous.candidateId,
      agentName: agentName || previous.agentName,
      violations: violations.length ? violations : previous.violations,
      attempts: previous.attempts + 1,
      firstFailedAtDay: previous.firstFailedAtDay,
      lastError,
      source: 'transaction_rejected',
      completion: previous.acceptedKeys.length ? 'partial' : 'failed',
      acceptedKeys: previous.acceptedKeys,
      anchor: previous.anchor,
      createdAt: previous.createdAt,
      updatedAt: now,
    };
    return;
  }
  pending.push({
    module,
    candidateId,
    agentName,
    violations,
    attempts: 1,
    firstFailedAtDay: day,
    lastError,
    source: 'transaction_rejected',
    completion: 'failed',
    acceptedKeys: [],
    anchor: null,
    createdAt: now,
    updatedAt: now,
  });
}

function violationModule_ACU(message: string): WorldSimulationLedgerModule_ACU | null {
  if (message.includes('thiếu rumor đi kèm') || message.includes('ledger.actors')) return 'actors';
  if (message.includes('ledger.rumors') || message.includes('earliestRevealDay')) return 'rumors';
  if (message.includes('ledger.seeds')) return 'seeds';
  if (message.includes('ledger.dimensions')) return 'dimensions';
  if (message.includes('ledger.player')) return 'player';
  if (message.includes('ledger.clock')) return 'clock';
  if (message.includes('ledger.guidance')) return 'guidance';
  if (message.includes('ledger.chronicle')) return 'chronicle';
  return null;
}

function restoreLedgerModule_ACU(next: WorldSimulationLedger_ACU, base: WorldSimulationLedger_ACU, module: WorldSimulationLedgerModule_ACU): void {
  switch (module) {
    case 'clock': next.clock = clone_ACU(base.clock); break;
    case 'dimensions': next.dimensions = clone_ACU(base.dimensions); break;
    case 'seeds': next.seeds = clone_ACU(base.seeds); break;
    case 'actors': next.actors = clone_ACU(base.actors); break;
    case 'chronicle':
      next.chronicle = clone_ACU(base.chronicle);
      next.chronicleOverview = clone_ACU(base.chronicleOverview);
      break;
    case 'guidance': next.guidance = clone_ACU(base.guidance); break;
    case 'rumors': next.rumors = clone_ACU(base.rumors); break;
    case 'player': next.player = clone_ACU(base.player); break;
    default: break;
  }
}

function crossFieldProblems_ACU(next: WorldSimulationLedger_ACU): Array<{ module: WorldSimulationLedgerModule_ACU; message: string }> {
  const problems: Array<{ module: WorldSimulationLedgerModule_ACU; message: string }> = [];
  const push = (message: string): void => {
    const module = violationModule_ACU(message);
    if (module) problems.push({ module, message });
  };
  checkCrossField_ACU(next, push);
  for (const message of collectWorldSimulationLedgerViolations_ACU(next)) push(message);
  return problems;
}

function clearPendingModule_ACU(pending: WorldSimulationPendingFix_ACU[], module: WorldSimulationLedgerModule_ACU): void {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    if (pending[index].module === module) pending.splice(index, 1);
  }
}

export interface WorldSimulationSqlDiagnostic_ACU {
  code: 'WORLD_SIMULATION_SQL_VIEW_FAILED';
  message: string;
  module?: string;
}

export interface WorldSimulationApplyResult_ACU {
  ledger: WorldSimulationLedger_ACU;
  chronicleArchiveWrites: WorldChronicleArchiveDetail_ACU[];
  pendingFixes: WorldSimulationPendingFix_ACU[];
  appliedModules: WorldSimulationLedgerModule_ACU[];
  sqlDiagnostics: WorldSimulationSqlDiagnostic_ACU[];
}

export interface WorldSimulationApplyContext_ACU {
  anchorMessage?: string;
  chronicleArchive?: WorldChronicleArchiveSnapshot_ACU;
}

export function applyWorldSimulationCandidatesDetailed_ACU(
  base: WorldSimulationLedger_ACU,
  candidates: readonly WorldSimulationCandidate_ACU[],
  authorizedEvidenceRefs: ReadonlySet<string>,
  settings?: WorldSimulationSettings_ACU,
  context?: WorldSimulationApplyContext_ACU,
): WorldSimulationApplyResult_ACU {
  const dynamics = resolveDynamics_ACU(settings);
  const validatedBase = validateWorldSimulationLedger_ACU(base, 'agent_persist');
  if (!candidates.length) fail_ACU('commit phải chứa ít nhất một ứng viên');
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.candidateId || candidateIds.has(candidate.candidateId)) fail_ACU('commit candidateId bị thiếu hoặc trùng lặp', { candidateId: candidate.candidateId });
    candidateIds.add(candidate.candidateId);
    if (!isRecord_ACU(candidate.patch) || !Object.keys(candidate.patch).length) fail_ACU('candidate.patch phải là đối tượng không rỗng', { candidateId: candidate.candidateId });
    const declared = new Set(candidate.evidenceRefs);
    for (const ref of declared) if (!authorizedEvidenceRefs.has(ref)) fail_ACU('Ứng viên khai báo evidenceRef chưa được ủy quyền', { candidateId: candidate.candidateId, evidenceRef: ref });
    for (const ref of collectEvidenceRefs_ACU(candidate.patch)) {
      if (!declared.has(ref) || !authorizedEvidenceRefs.has(ref)) fail_ACU('patch dùng evidenceRef chưa được ứng viên khai báo và ủy quyền', { candidateId: candidate.candidateId, evidenceRef: ref });
    }
    const definition = findWorldSimulationAgentDefinition_ACU(candidate.agentName);
    if (!definition) fail_ACU('Agent của ứng viên không nằm trong danh mục vai trò mô phỏng thế giới', { candidateId: candidate.candidateId, agentName: candidate.agentName });
    const writable = new Set<string>(definition.writableModules);
    const forgedPermissions = candidate.writableModules.filter(module => !writable.has(module));
    if (forgedPermissions.length) fail_ACU('Ứng viên khai báo module ghi mà danh mục vai trò chưa ủy quyền', { candidateId: candidate.candidateId, forgedPermissions });
    for (const [module] of orderedPatchEntries_ACU(candidate.patch)) {
      if (!canWritePatchModule_ACU(module, writable)) fail_ACU('Ứng viên ghi vượt quyền vào module ledger', { candidateId: candidate.candidateId, module });
    }
  }

  let next = clone_ACU(validatedBase);
  const chronicleArchiveWrites: WorldChronicleArchiveDetail_ACU[] = [];
  const pendingFixes = clone_ACU(validatedBase.pendingFixes);
  const appliedModules = new Set<WorldSimulationLedgerModule_ACU>();
  const moduleWriters = new Map<WorldSimulationLedgerModule_ACU, { candidateId: string; agentName: string }>();

  for (const candidate of candidates) {
    // chronicle and chronicleArchive share one completion module; a later successful
    // archive write must not erase this candidate's earlier chronicle rejection.
    const failedModules = new Set<WorldSimulationLedgerModule_ACU>();
    for (const [module, patch] of orderedPatchEntries_ACU(candidate.patch)) {
      const ledgerModule = pendingModuleOf_ACU(module);
      const snapshot = clone_ACU(next);
      const blocking: Array<{ path: string; message: string }> = [];
      const collect = (message: string, details?: Record_ACU): void => {
        const severity = details?.severity === 'autoFixed' ? 'autoFixed' : 'blocking';
        if (severity === 'blocking') {
          blocking.push({ path: typeof details?.path === 'string' ? details.path : `$.patch.${module}`, message });
        }
      };
      try {
        switch (module) {
          case 'clock': next.clock = applyClock_ACU(next.clock, singletonPatch_ACU(patch, validatedBase.revision, module), dynamics); break;
          case 'dimensions': next.dimensions = applyUpserts_ACU(next.dimensions, patch, 'patch.dimensions', 'dimensions', next.clock.day, collect); break;
          case 'seeds': next.seeds = applyUpserts_ACU(next.seeds, patch, 'patch.seeds', 'seeds', next.clock.day, collect); break;
          case 'actors': next.actors = applyUpserts_ACU(next.actors, patch, 'patch.actors', 'actors', next.clock.day, collect); break;
          case 'chronicle': next.chronicle = applyChronicle_ACU(next.chronicle, patch, next.clock); break;
          case 'guidance': next.guidance = applyGuidance_ACU(next.guidance, singletonPatch_ACU(patch, validatedBase.revision, module), next, context?.anchorMessage ?? ''); break;
          case 'rumors': next.rumors = applyUpserts_ACU(next.rumors, patch, 'patch.rumors', 'rumors', next.clock.day, collect); break;
          case 'player': next.player = applyPlayer_ACU(next.player, singletonPatch_ACU(patch, validatedBase.revision, module)); break;
          case 'chronicleArchive': {
            const archived = applyChronicleArchive_ACU(next.chronicleOverview, patch, next.clock.day);
            next.chronicleOverview = archived.overview;
            chronicleArchiveWrites.push(...archived.writes);
            break;
          }
        }
        if (blocking.length) {
          const changed = JSON.stringify(next[ledgerModule === 'chronicle' && module === 'chronicleArchive' ? 'chronicleOverview' : ledgerModule])
            !== JSON.stringify(snapshot[ledgerModule === 'chronicle' && module === 'chronicleArchive' ? 'chronicleOverview' : ledgerModule]);
          if (!changed) {
            next = snapshot;
            if (module === 'chronicleArchive') {
              const snapshotRefs = new Set(snapshot.chronicleOverview.map(row => row.archiveRef));
              for (let index = chronicleArchiveWrites.length - 1; index >= 0; index -= 1) {
                if (!snapshotRefs.has(chronicleArchiveWrites[index].archiveRef)) chronicleArchiveWrites.splice(index, 1);
              }
            }
          }
          recordPendingFix_ACU(pendingFixes, ledgerModule, candidate.candidateId, candidate.agentName, blocking, next.clock.day);
          failedModules.add(ledgerModule);
          continue;
        }
        if (!failedModules.has(ledgerModule)) clearPendingModule_ACU(pendingFixes, ledgerModule);
        appliedModules.add(ledgerModule);
        moduleWriters.set(ledgerModule, { candidateId: candidate.candidateId, agentName: candidate.agentName });
      } catch (error) {
        next = snapshot;
        failedModules.add(ledgerModule);
        recordPendingFix_ACU(
          pendingFixes,
          ledgerModule,
          candidate.candidateId,
          candidate.agentName,
          [{ path: `$.patch.${module}`, message: error instanceof Error ? error.message : String(error) }],
          snapshot.clock.day,
        );
      }
    }
  }

  // 行为开始/结束时间以本次提交的最终 clock 为准（批次一的时序推进已并入 next.clock）。
  next.actors = stampWorldActorTimelines_ACU(validatedBase.actors, next.actors, next.clock);
  const problems = crossFieldProblems_ACU(next);
  const grouped = new Map<WorldSimulationLedgerModule_ACU, string[]>();
  for (const problem of problems) {
    const messages = grouped.get(problem.module) ?? [];
    messages.push(problem.message);
    grouped.set(problem.module, messages);
  }
  for (const [module, messages] of grouped) {
    const writer = moduleWriters.get(module);
    const owner = writer ?? {
      candidateId: candidates.find(item => Object.prototype.hasOwnProperty.call(item.patch, module))?.candidateId || candidates[0]?.candidateId || 'commit',
      agentName: candidates.find(item => Object.prototype.hasOwnProperty.call(item.patch, module))?.agentName || candidates[0]?.agentName || 'world-director',
    };
    restoreLedgerModule_ACU(next, validatedBase, module);
    appliedModules.delete(module);
    moduleWriters.delete(module);
    if (module === 'chronicle') {
      const refs = new Set(next.chronicleOverview.map(row => row.archiveRef));
      for (let index = chronicleArchiveWrites.length - 1; index >= 0; index -= 1) {
        if (!refs.has(chronicleArchiveWrites[index].archiveRef)) chronicleArchiveWrites.splice(index, 1);
      }
    }
    recordPendingFix_ACU(
      pendingFixes,
      module,
      owner.candidateId,
      owner.agentName,
      messages.map(message => ({ path: `$.${module}`, message })),
      next.clock.day,
    );
  }
  const remaining = crossFieldProblems_ACU(next);
  if (remaining.length) fail_ACU(remaining.map(item => item.message).join('; '));
  next.pendingFixes = pendingFixes;
  next.revision = validatedBase.revision + 1;
  const ledger = validateWorldSimulationLedger_ACU(next, 'agent_persist');
  return { ledger, chronicleArchiveWrites, pendingFixes: ledger.pendingFixes, appliedModules: [...appliedModules], sqlDiagnostics: [] };
}

export function applyWorldSimulationCandidates_ACU(
  base: WorldSimulationLedger_ACU,
  candidates: readonly WorldSimulationCandidate_ACU[],
  authorizedEvidenceRefs: ReadonlySet<string>,
  settings?: WorldSimulationSettings_ACU,
  context?: WorldSimulationApplyContext_ACU,
): WorldSimulationLedger_ACU {
  return applyWorldSimulationCandidatesDetailed_ACU(base, candidates, authorizedEvidenceRefs, settings, context).ledger;
}

/* ===================== SQL 易失视图校验变体 =====================
 * 计划 D3/D4：候选应用结果在既有 JSON 事务链产出后，再经 SQL 易失视图行级复算：
 * 物化应用前账本 → 逐模块 diff 出 upsert/remove 行 → SQL 层 revision 乐观锁链式推进 →
 * 读回比对。物化或执行失败 fail-closed 回退既有 JSON 链结果，不产生空资料。
 * 注意：账本 revision 语义是「每次 commit +1」而非每模块 +1，因此复算只比对行内容，
 * revision 期望值按视图内写入次数链式推进，不与账本 revision 直接比对。
 */

const SQL_VERIFY_ARRAY_MODULES_ACU = [
  ['dimensions', 'id'],
  ['seeds', 'id'],
  ['actors', 'id'],
  ['chronicle', 'id'],
  ['rumors', 'id'],
  ['chronicleOverview', 'fingerprint'],
] as const;

const SQL_VERIFY_SINGLETONS_ACU = ['clock', 'player', 'guidance'] as const;

function diffLedgerRows_ACU(
  before: readonly Record_ACU[],
  after: readonly Record_ACU[],
  idKey: string,
): { upserts: Record_ACU[]; removedIds: string[] } {
  const keyOf = (item: Record_ACU): string => (typeof item[idKey] === 'string' ? item[idKey] as string : '');
  const previousById = new Map(before.map(item => [keyOf(item), item]));
  const nextIds = new Set(after.map(item => keyOf(item)));
  const upserts = after.filter(item => {
    const prior = previousById.get(keyOf(item));
    return !prior || JSON.stringify(prior) !== JSON.stringify(item);
  });
  const removedIds = before.map(item => keyOf(item)).filter(id =>id && !nextIds.has(id));
  return { upserts, removedIds };
}

async function verifyWorldSimulationRowsViaSql_ACU(
  base: WorldSimulationLedger_ACU,
  after: WorldSimulationLedger_ACU,
  archiveWrites: readonly WorldChronicleArchiveDetail_ACU[],
  archive?: WorldChronicleArchiveSnapshot_ACU,
): Promise<void> {
  const view = await materializeWorldSimulationLedgerSqlView_ACU(base, archive);
  try {
    let expected = base.revision;
    for (const [module, idKey] of SQL_VERIFY_ARRAY_MODULES_ACU) {
      const diff = diffLedgerRows_ACU(
        base[module] as unknown as readonly Record_ACU[],
        after[module] as unknown as readonly Record_ACU[],
        idKey,
      );
      if (!diff.upserts.length && !diff.removedIds.length) continue;
      expected = view.applyArrayWrite({ module: module as WorldSimulationSqlArrayModule_ACU, upserts: diff.upserts, removedIds: diff.removedIds, expectedRevision: expected });
    }
    for (const module of SQL_VERIFY_SINGLETONS_ACU) {
      if (JSON.stringify(base[module]) === JSON.stringify(after[module])) continue;
      expected = view.applySingletonWrite({ module: module as WorldSimulationSqlSingleton_ACU, value: after[module], expectedRevision: expected });
    }
    if (archiveWrites.length) {
      view.applyArchiveWrite({ upserts: archiveWrites });
    }
    const verified = view.readLedger();
    for (const [module] of SQL_VERIFY_ARRAY_MODULES_ACU) {
      if (JSON.stringify(after[module]) !== JSON.stringify(verified[module])) {
        throw new WorldSimulationSqlViewError_ACU(`Kết quả tính lại SQL của module ${module} không khớp với kết quả giao dịch`, { module });
      }
    }
    for (const module of SQL_VERIFY_SINGLETONS_ACU) {
      if (JSON.stringify(after[module]) !== JSON.stringify(verified[module])) {
        throw new WorldSimulationSqlViewError_ACU(`Kết quả tính lại SQL của module ${module} không khớp với kết quả giao dịch`, { module });
      }
    }
    if (archiveWrites.length) {
      const exported = view.exportArchiveRecords();
      const expectedArchive = Object.fromEntries(archiveWrites.map(item => [item.archiveRef, item]));
      if (JSON.stringify(exported) !== JSON.stringify(expectedArchive)) {
        throw new WorldSimulationSqlViewError_ACU('Kết quả tính lại SQL của module chronicleArchive không khớp với kết quả giao dịch', {
          module: 'chronicleArchive',
        });
      }
    }
  } finally {
    view.dispose();
  }
}

/**
 * applyWorldSimulationCandidatesDetailed_ACU 的 SQL 视图变体。
 * 业务合并仍由既有 JSON 事务链完成（保留全部领域校验与 pendingFixes 语义），
 * 结果账本再经 SQL 易失视图按元素行级复算校验；SQL 物化或执行失败时
 * fail-closed 回退 JSON 链结果。chronicleArchiveWrites 与 commit 链输入形态不变。
 */
export async function applyWorldSimulationCandidatesDetailedViaSql_ACU(
  base: WorldSimulationLedger_ACU,
  candidates: readonly WorldSimulationCandidate_ACU[],
  authorizedEvidenceRefs: ReadonlySet<string>,
  settings?: WorldSimulationSettings_ACU,
  context?: WorldSimulationApplyContext_ACU,
): Promise<WorldSimulationApplyResult_ACU> {
  const applied = applyWorldSimulationCandidatesDetailed_ACU(base, candidates, authorizedEvidenceRefs, settings, context);
  try {
    await verifyWorldSimulationRowsViaSql_ACU(base, applied.ledger, applied.chronicleArchiveWrites, context?.chronicleArchive);
  } catch (error) {
    const diagnostic: WorldSimulationSqlDiagnostic_ACU = {
      code: 'WORLD_SIMULATION_SQL_VIEW_FAILED',
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof WorldSimulationSqlViewError_ACU && error.module
        ? { module: error.module }
        : {}),
    };
    return { ...applied, sqlDiagnostics: [diagnostic] };
  }
  return applied;
}

export interface WorldSimulationCandidateViolation_ACU {
  candidateId: string;
  agentName: string;
  module: string;
  path: string;
  message: string;
  severity: WorldSimulationPatchFixSeverity_ACU;
  details?: Record<string, unknown>;
}

export interface WorldSimulationCandidatePreflightReport_ACU {
  blocking: WorldSimulationCandidateViolation_ACU[];
  autoFixed: WorldSimulationCandidateViolation_ACU[];
}

export function preflightWorldSimulationCandidates_ACU(
  base: WorldSimulationLedger_ACU,
  candidates: readonly WorldSimulationCandidate_ACU[],
  authorizedEvidenceRefs: ReadonlySet<string>,
  settings?: WorldSimulationSettings_ACU,
): WorldSimulationCandidatePreflightReport_ACU {
  const dynamics = resolveDynamics_ACU(settings);
  const blocking: WorldSimulationCandidateViolation_ACU[] = [];
  const autoFixed: WorldSimulationCandidateViolation_ACU[] = [];
  let validatedBase: WorldSimulationLedger_ACU;
  try {
    validatedBase = validateWorldSimulationLedger_ACU(base, 'agent_persist');
  } catch (error) {
    blocking.push({ candidateId: '', agentName: '', module: '', path: '$', message: error instanceof Error ? error.message : String(error), severity: 'blocking' });
    return { blocking, autoFixed };
  }
  if (!candidates.length) {
    blocking.push({ candidateId: '', agentName: '', module: '', path: '$', message: 'commit phải chứa ít nhất một ứng viên', severity: 'blocking' });
    return { blocking, autoFixed };
  }
  const next = clone_ACU(validatedBase);
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    const push = (module: string, path: string, message: string, details?: Record_ACU): void => {
      const severity: WorldSimulationPatchFixSeverity_ACU = details?.severity === 'autoFixed' ? 'autoFixed' : 'blocking';
      const bucket = severity === 'autoFixed' ? autoFixed : blocking;
      bucket.push({ candidateId: candidate.candidateId, agentName: candidate.agentName, module, path, message, severity, details });
    };
    if (!candidate.candidateId || candidateIds.has(candidate.candidateId)) {
      push('', '$', 'commit candidateId bị thiếu hoặc trùng lặp', { candidateId: candidate.candidateId });
      continue;
    }
    candidateIds.add(candidate.candidateId);
    if (!isRecord_ACU(candidate.patch) || !Object.keys(candidate.patch).length) {
      push('', '$.patch', 'candidate.patch phải là đối tượng không rỗng');
      continue;
    }
    const declared = new Set(candidate.evidenceRefs);
    for (const ref of declared) if (!authorizedEvidenceRefs.has(ref)) push('', '$.evidenceRefs', `Ứng viên khai báo evidenceRef chưa được ủy quyền: ${ref}`, { evidenceRef: ref });
    try {
      for (const ref of collectEvidenceRefs_ACU(candidate.patch)) {
        if (!declared.has(ref) || !authorizedEvidenceRefs.has(ref)) push('', '$.patch', `patch dùng evidenceRef chưa được khai báo hoặc ủy quyền: ${ref}`, { evidenceRef: ref });
      }
    } catch (error) {
      push('', '$.patch', error instanceof Error ? error.message : String(error));
    }
    const definition = findWorldSimulationAgentDefinition_ACU(candidate.agentName);
    if (!definition) {
      push('', '$.agentName', `Agent của ứng viên không nằm trong danh mục vai trò mô phỏng thế giới: ${candidate.agentName}`);
      continue;
    }
    const writable = new Set<string>(definition.writableModules);
    const forgedPermissions = candidate.writableModules.filter(module => !writable.has(module));
    if (forgedPermissions.length) push('', '$.writableModules', `Ứng viên khai báo module ghi mà danh mục vai trò chưa ủy quyền: ${forgedPermissions.join(',')}`, { forgedPermissions });
    for (const [module, patch] of orderedPatchEntries_ACU(candidate.patch)) {
      if (!canWritePatchModule_ACU(module, writable)) {
        push(module, `$.patch.${module}`, 'Ứng viên ghi vượt quyền vào module ledger');
        continue;
      }
      const collectUpsert = (message: string, details?: Record_ACU): void => {
        push(module, typeof details?.path === 'string' ? details.path : `$.patch.${module}`, message, details);
      };
      try {
        switch (module) {
          case 'clock': next.clock = applyClock_ACU(next.clock, singletonPatch_ACU(patch, validatedBase.revision, module), dynamics); break;
          case 'dimensions': next.dimensions = applyUpserts_ACU(next.dimensions, patch, 'patch.dimensions', 'dimensions', next.clock.day, collectUpsert); break;
          case 'seeds': next.seeds = applyUpserts_ACU(next.seeds, patch, 'patch.seeds', 'seeds', next.clock.day, collectUpsert); break;
          case 'actors': next.actors = applyUpserts_ACU(next.actors, patch, 'patch.actors', 'actors', next.clock.day, collectUpsert); break;
          case 'chronicle': next.chronicle = applyChronicle_ACU(next.chronicle, patch, next.clock); break;
          case 'guidance': next.guidance = applyGuidance_ACU(next.guidance, singletonPatch_ACU(patch, validatedBase.revision, module), next); break;
          case 'rumors': next.rumors = applyUpserts_ACU(next.rumors, patch, 'patch.rumors', 'rumors', next.clock.day, collectUpsert); break;
          case 'player': next.player = applyPlayer_ACU(next.player, singletonPatch_ACU(patch, validatedBase.revision, module)); break;
          case 'chronicleArchive': next.chronicleOverview = applyChronicleArchive_ACU(next.chronicleOverview, patch, next.clock.day).overview; break;
        }
      } catch (error) {
        push(module, `$.patch.${module}`, error instanceof Error ? error.message : String(error));
      }
    }
  }
  checkCrossField_ACU(next, (message, details) => blocking.push({ candidateId: '', agentName: '', module: '', path: '$.patch', message, severity: 'blocking', details }));
  next.revision = validatedBase.revision + 1;
  for (const message of collectWorldSimulationLedgerViolations_ACU(next)) {
    blocking.push({ candidateId: '', agentName: '', module: '', path: '$', message, severity: 'blocking' });
  }
  return { blocking, autoFixed };
}

/** 逐栏提交的领域检查：复用单例应用、条目归一化与跨模块一致性，不隐式创建 partial 完整行。 */
export function applyWorldSimulationFieldDomain_ACU(
  ledger: WorldSimulationLedger_ACU,
  module: WorldSimulationLedgerModule_ACU,
  id: string,
  values: Record<string, unknown>,
  action: 'insert' | 'update' | 'delete',
  settings?: WorldSimulationSettings_ACU,
  anchorMessage = '',
  deferCrossValidation = false,
): WorldSimulationLedger_ACU {
  const next = clone_ACU(ledger);
  if (module === 'clock') next.clock = applyClock_ACU(next.clock, values, resolveDynamics_ACU(settings));
  else if (module === 'player') next.player = applyPlayer_ACU(next.player, values);
  else if (module === 'guidance') next.guidance = applyGuidance_ACU(next.guidance, values, next, anchorMessage);
  else if (module === 'chronicle') next.chronicle = applyChronicle_ACU(next.chronicle,
    action === 'delete' ? { remove: [{ id, reason: values.reason }] } : { append: [{ id, ...values }] }, next.clock);
  else {
    const current = next[module] as Array<{ id: string; revision: number }>;
    next[module] = applyUpserts_ACU(current,
      action === 'delete' ? { remove: [{ id, expectedRevision: values.expectedRevision, reason: values.reason }] }
        : { upsert: [{ id, ...values, expectedRevision: values.expectedRevision }] },
      `patch.${module}`, module, next.clock.day) as never;
    if (module === 'actors') next.actors = stampWorldActorTimelines_ACU(ledger.actors, next.actors, next.clock);
  }
  if (!deferCrossValidation) {
    const problems = crossFieldProblems_ACU(next);
    if (problems.length) fail_ACU(problems.map(item => item.message).join('; '));
  }
  next.revision = ledger.revision + 1;
  return deferCrossValidation ? next : validateWorldSimulationLedger_ACU(next, 'agent_persist');
}
