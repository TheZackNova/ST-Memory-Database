import type { SheetExportConfig_ACU } from './table-data';

/** 模板构造期的占位 key。协调层会按显示名重新派生真实 key，运行时一律读 FlightModeState.bigSummarySheetKey。 */
export const FLIGHT_MODE_BIG_SUMMARY_SHEET_KEY_ACU = 'sheet_acu_flight_big_summary';
export const FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU = 'Bảng tóm tắt lớn';
/** Tên đã từng dùng cho bảng tóm tắt lớn; chat cũ vẫn mang tên tiếng Trung. Phần tử đầu là tên khi tạo mới. */
export const FLIGHT_MODE_BIG_SUMMARY_SHEET_NAMES_ACU: readonly string[] = Object.freeze([FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU, '大总结']);

export function isFlightModeBigSummarySheetName_ACU(name: unknown): boolean {
  const normalized = String(name ?? '').trim();
  return !!normalized && FLIGHT_MODE_BIG_SUMMARY_SHEET_NAMES_ACU.includes(normalized);
}
export const FLIGHT_MODE_MAX_VISIBLE_CHRONICLE_ROWS_ACU = 15;

export interface FlightModeArchive_ACU {
  chronicleExportConfig?: SheetExportConfig_ACU;
  templateScope?: unknown;
  templateScopeWasAbsent?: boolean;
  /** 启用正式模板提交后记录的作用域模板文本，用于停用前拒绝静默覆盖用户后续修改。 */
  enabledTemplateStr?: string;
}

export interface FlightModeState_ACU {
  enabled: boolean;
  enabledAt: number;
  hiddenRowIds: string[];
  /**
   * 大总结表的真实 sheetKey，来自模板提交成功后按表名解析的结果。
   * 不得使用 FLIGHT_MODE_BIG_SUMMARY_SHEET_KEY_ACU 常量：协调层会按显示名重新派生 key。
   */
  bigSummarySheetKey: string;
  archive?: FlightModeArchive_ACU;
}

export interface FlightModeEnableCheck_ACU {
  canEnable: boolean;
  visibleChronicleRowCount: number;
  reason?: 'chronicle_not_found' | 'too_many_visible_chronicle_rows';
}
