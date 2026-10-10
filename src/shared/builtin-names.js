/**
 * builtin-names.js — Tên dựng sẵn (bảng, cột, mục sổ thế giới) và bí danh tiếng Trung cũ
 *
 * Bảng mẫu mặc định dùng tên tiếng Việt. Dữ liệu đã lưu (mẫu cũ, chat cũ, sổ thế giới cũ) vẫn mang
 * tên tiếng Trung, nên mọi chỗ so khớp tên phải đi qua các hàm ở đây để nhận cả hai.
 * Quy ước: phần tử đầu của mỗi danh sách là tên dùng khi ghi mới; các phần tử sau chỉ để nhận diện.
 */

function normalizeName_ACU(value) {
  return String(value ?? '').trim();
}

function matchesAnyName_ACU(value, names) {
  const normalized = normalizeName_ACU(value);
  return !!normalized && names.includes(normalized);
}

function startsWithAny_ACU(value, prefixes) {
  const text = String(value ?? '');
  return prefixes.some(prefix => text.startsWith(prefix));
}

// ── Tên bảng ────────────────────────────────────────────────────────────────

/** Bảng kỷ yếu (nhật ký theo lượt) của mẫu mặc định. */
export const CHRONICLE_SHEET_NAMES_ACU = Object.freeze(['Bảng kỷ yếu', '纪要表']);
export const IMPORTANT_CHARACTERS_SHEET_NAMES_ACU = Object.freeze(['Bảng nhân vật quan trọng', '重要角色表']);
export const GLOBAL_DATA_SHEET_NAMES_ACU = Object.freeze(['Bảng dữ liệu toàn cục', '全局数据表', '全局表']);
/**
 * Ba bảng đặc biệt kiểu cũ (总结表 / 总体大纲 / 重要人物表) không có trong mẫu mặc định. Chúng sinh các mục cố định
 * mang tên tiếng Trung và được dọn theo đúng các tên đó, nên chỉ nhận diện bằng tên gốc, không thêm bí danh tiếng Việt.
 */
const SUMMARY_SHEET_NAMES_ACU = Object.freeze(['总结表']);
const OUTLINE_SHEET_NAMES_ACU = Object.freeze(['总体大纲']);
const IMPORTANT_PERSONS_SHEET_NAMES_ACU = Object.freeze(['重要人物表']);

export const CHRONICLE_SHEET_NAME_ACU = CHRONICLE_SHEET_NAMES_ACU[0];

export function isChronicleSheetName_ACU(name) { return matchesAnyName_ACU(name, CHRONICLE_SHEET_NAMES_ACU); }
export function isSummarySheetName_ACU(name) { return matchesAnyName_ACU(name, SUMMARY_SHEET_NAMES_ACU); }
export function isOutlineSheetName_ACU(name) { return matchesAnyName_ACU(name, OUTLINE_SHEET_NAMES_ACU); }
export function isImportantPersonsSheetName_ACU(name) { return matchesAnyName_ACU(name, IMPORTANT_PERSONS_SHEET_NAMES_ACU); }
export function isGlobalDataSheetName_ACU(name) { return matchesAnyName_ACU(name, GLOBAL_DATA_SHEET_NAMES_ACU); }
/** Bảng kỷ yếu hoặc bảng tổng kết kiểu cũ: hai bảng cùng đóng vai nhật ký cốt truyện. */
export function isChronicleOrSummarySheetName_ACU(name) {
  return isChronicleSheetName_ACU(name) || isSummarySheetName_ACU(name);
}

// ── Tên cột ─────────────────────────────────────────────────────────────────

export const INDEX_CODE_COLUMN_NAMES_ACU = Object.freeze(['Mã chỉ mục', '编码索引']);
export const OVERVIEW_COLUMN_NAMES_ACU = Object.freeze(['Tổng quan', 'Tóm lược', '概览', '概要']);
export const CHRONICLE_TEXT_COLUMN_NAMES_ACU = Object.freeze(['Kỷ yếu', '纪要']);
export const PERSON_NAME_COLUMN_NAMES_ACU = Object.freeze(['Tên', '姓名', 'Tên nhân vật', '角色名']);

export const INDEX_CODE_COLUMN_NAME_ACU = INDEX_CODE_COLUMN_NAMES_ACU[0];
export const OVERVIEW_COLUMN_NAME_ACU = OVERVIEW_COLUMN_NAMES_ACU[0];

export function isIndexCodeColumnName_ACU(header) { return matchesAnyName_ACU(header, INDEX_CODE_COLUMN_NAMES_ACU); }
export function isOverviewColumnName_ACU(header) { return matchesAnyName_ACU(header, OVERVIEW_COLUMN_NAMES_ACU); }

/** Vị trí cột đầu tiên có tên thuộc danh sách bí danh, theo thứ tự ưu tiên của danh sách; không có thì -1. */
export function findColumnIndexByNames_ACU(headers, names) {
  if (!Array.isArray(headers)) return -1;
  const normalized = headers.map(normalizeName_ACU);
  for (const name of names) {
    const index = normalized.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

// ── Tên mục sổ thế giới ─────────────────────────────────────────────────────

export const CUSTOM_EXPORT_COMMENT_PREFIX_ACU = 'TavernDB-ACU-CustomExport-';
/** Tên mục kỷ yếu theo hàng khi mẫu không tự đặt tên mục. */
export const CHRONICLE_ENTRY_NAME_ACU = 'Kỷ yếu';
/** Tên mục chỉ mục kỷ yếu: mục này được chỉ mục vector ghi đè nội dung. */
export const SUMMARY_INDEX_ENTRY_NAMES_ACU = Object.freeze(['Chỉ mục kỷ yếu', '纪要索引']);
export const SUMMARY_INDEX_ENTRY_NAME_ACU = SUMMARY_INDEX_ENTRY_NAMES_ACU[0];
/** Chú thích mục chỉ mục kỷ yếu (chưa kèm tiền tố cách ly); phần tử đầu dùng khi tạo mới. */
export const SUMMARY_INDEX_ENTRY_COMMENTS_ACU = Object.freeze(
  SUMMARY_INDEX_ENTRY_NAMES_ACU.map(name => `${CUSTOM_EXPORT_COMMENT_PREFIX_ACU}${name}`),
);

export function isSummaryIndexEntryName_ACU(name) { return matchesAnyName_ACU(name, SUMMARY_INDEX_ENTRY_NAMES_ACU); }
/** Chú thích (có thể còn tiền tố cách ly/nhập ngoài) có kết thúc bằng chú thích mục chỉ mục kỷ yếu không. */
export function endsWithSummaryIndexEntryComment_ACU(comment) {
  const text = normalizeName_ACU(comment);
  return SUMMARY_INDEX_ENTRY_COMMENTS_ACU.some(base => text.endsWith(base));
}
/** Chú thích đã bỏ tiền tố có bắt đầu bằng chú thích mục chỉ mục kỷ yếu không. */
export function startsWithSummaryIndexEntryComment_ACU(comment) {
  return startsWithAny_ACU(normalizeName_ACU(comment), SUMMARY_INDEX_ENTRY_COMMENTS_ACU);
}

/** Hậu tố mặc định của tên mục chỉ mục phụ: `<tên mục>-Chỉ mục`; `-索引` là hậu tố của bản cũ. */
const EXTRA_INDEX_ENTRY_SUFFIXES_ACU = Object.freeze(['-Chỉ mục', '-索引']);
export function buildDefaultExtraIndexEntryName_ACU(baseName) {
  return `${normalizeName_ACU(baseName)}${EXTRA_INDEX_ENTRY_SUFFIXES_ACU[0]}`;
}
export function isDefaultExtraIndexEntryName_ACU(entryName, baseName) {
  const base = normalizeName_ACU(baseName);
  return EXTRA_INDEX_ENTRY_SUFFIXES_ACU.some(suffix => entryName === `${base}${suffix}`);
}

/** Hậu tố các mục phụ của một nhóm xuất tùy chỉnh. */
export const EXPORT_HEADER_SUFFIX_ACU = '-Tiêu đề';
export const EXPORT_WRAPPER_BEFORE_SUFFIX_ACU = '-Bao-trên';
export const EXPORT_WRAPPER_AFTER_SUFFIX_ACU = '-Bao-dưới';
/** Mảnh regex khớp hậu tố mục phụ (không kèm dấu gạch đầu), gồm cả tên tiếng Trung của bản cũ. */
export const EXPORT_AUXILIARY_SUFFIX_PATTERN_ACU = 'Tiêu đề|Bao-trên|Bao-dưới|表头|包裹-上|包裹-下';

/** Tiền tố mục cố định của ba bảng kiểu cũ: là dấu nhận diện để dọn dẹp, giữ nguyên tên gốc. */
const SUMMARY_ENTRY_PREFIXES_ACU = Object.freeze(['总结条目']);
const SMALL_SUMMARY_ENTRY_PREFIXES_ACU = Object.freeze(['小总结条目']);
const PERSON_ENTRY_PREFIXES_ACU = Object.freeze(['重要人物条目']);

export function isSummaryEntryComment_ACU(comment) { return startsWithAny_ACU(comment, SUMMARY_ENTRY_PREFIXES_ACU); }
export function isSmallSummaryEntryComment_ACU(comment) { return startsWithAny_ACU(comment, SMALL_SUMMARY_ENTRY_PREFIXES_ACU); }
export function isPersonEntryComment_ACU(comment) { return startsWithAny_ACU(comment, PERSON_ENTRY_PREFIXES_ACU); }

/**
 * Tiền tố mục do "nhập từ ngoài" tạo. Đây là dấu bảo vệ (mục mang tiền tố này không bị tự động dọn) và là
 * một phần khóa lưu trữ, nên giữ nguyên tên gốc.
 */
const IMPORT_ENTRY_PREFIXES_ACU = Object.freeze(['外部导入-']);
const IMPORT_ENTRY_PREFIX_PATTERN_ACU = /^外部导入-(?:[^-]+-)?/;

export function hasImportEntryPrefix_ACU(comment) { return startsWithAny_ACU(comment, IMPORT_ENTRY_PREFIXES_ACU); }
/** Bỏ tiền tố nhập ngoài cùng mã phân đoạn tùy chọn theo sau nó. */
export function stripImportEntryPrefix_ACU(comment) {
  return String(comment ?? '').replace(IMPORT_ENTRY_PREFIX_PATTERN_ACU, '');
}
