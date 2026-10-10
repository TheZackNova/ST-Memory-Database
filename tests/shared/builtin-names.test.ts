/**
 * tests/shared/builtin-names.test.ts
 * 内置表名/列名/世界书条目名：越南语现行名与中文旧名的双语识别
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_AUXILIARY_SUFFIX_PATTERN_ACU,
  EXPORT_HEADER_SUFFIX_ACU,
  EXPORT_WRAPPER_AFTER_SUFFIX_ACU,
  EXPORT_WRAPPER_BEFORE_SUFFIX_ACU,
  INDEX_CODE_COLUMN_NAMES_ACU,
  SUMMARY_INDEX_ENTRY_COMMENTS_ACU,
  buildDefaultExtraIndexEntryName_ACU,
  endsWithSummaryIndexEntryComment_ACU,
  findColumnIndexByNames_ACU,
  hasImportEntryPrefix_ACU,
  isChronicleOrSummarySheetName_ACU,
  isChronicleSheetName_ACU,
  isDefaultExtraIndexEntryName_ACU,
  isGlobalDataSheetName_ACU,
  isImportantPersonsSheetName_ACU,
  isIndexCodeColumnName_ACU,
  isOutlineSheetName_ACU,
  isOverviewColumnName_ACU,
  isPersonEntryComment_ACU,
  isSmallSummaryEntryComment_ACU,
  isSummaryEntryComment_ACU,
  isSummaryIndexEntryName_ACU,
  isSummarySheetName_ACU,
  startsWithSummaryIndexEntryComment_ACU,
  stripImportEntryPrefix_ACU,
} from '../../src/shared/builtin-names.js';
import { isSummaryOrOutlineTable_ACU } from '../../src/shared/utils';

describe('builtin-names', () => {
  it('纪要表同时识别越南语现行名与中文旧名，忽略首尾空白', () => {
    expect(isChronicleSheetName_ACU('Bảng kỷ yếu')).toBe(true);
    expect(isChronicleSheetName_ACU(' 纪要表 ')).toBe(true);
    expect(isChronicleSheetName_ACU('Bảng kỷ yếu 2')).toBe(false);
    expect(isChronicleSheetName_ACU(undefined)).toBe(false);
    expect(isChronicleOrSummarySheetName_ACU('总结表')).toBe(true);
    expect(isGlobalDataSheetName_ACU('Bảng dữ liệu toàn cục')).toBe(true);
    expect(isGlobalDataSheetName_ACU('全局表')).toBe(true);
  });

  it('旧式特殊表只按中文原名识别，越南语默认表不会误入旧式固定条目路径', () => {
    expect(isSummarySheetName_ACU('总结表')).toBe(true);
    expect(isOutlineSheetName_ACU('总体大纲')).toBe(true);
    expect(isImportantPersonsSheetName_ACU('重要人物表')).toBe(true);
    expect(isImportantPersonsSheetName_ACU('Bảng nhân vật quan trọng')).toBe(false);
    expect(isImportantPersonsSheetName_ACU('重要角色表')).toBe(false);
    expect(isSummarySheetName_ACU('Bảng kỷ yếu')).toBe(false);
  });

  it('isSummaryOrOutlineTable_ACU 把越南语纪要表视为总结类表', () => {
    expect(isSummaryOrOutlineTable_ACU('Bảng kỷ yếu')).toBe(true);
    expect(isSummaryOrOutlineTable_ACU('纪要表')).toBe(true);
    expect(isSummaryOrOutlineTable_ACU('总体大纲')).toBe(true);
    expect(isSummaryOrOutlineTable_ACU('Bảng vật phẩm hành trang')).toBe(false);
  });

  it('列名按别名表识别，查找时现行名优先于旧名', () => {
    expect(isIndexCodeColumnName_ACU('Mã chỉ mục')).toBe(true);
    expect(isIndexCodeColumnName_ACU('编码索引')).toBe(true);
    expect(isOverviewColumnName_ACU('Tổng quan')).toBe(true);
    expect(isOverviewColumnName_ACU('概要')).toBe(true);
    expect(findColumnIndexByNames_ACU(['row_id', '编码索引', 'Mã chỉ mục'], INDEX_CODE_COLUMN_NAMES_ACU)).toBe(2);
    expect(findColumnIndexByNames_ACU(['row_id', ' 编码索引 '], INDEX_CODE_COLUMN_NAMES_ACU)).toBe(1);
    expect(findColumnIndexByNames_ACU(['row_id', 'Tên'], INDEX_CODE_COLUMN_NAMES_ACU)).toBe(-1);
    expect(findColumnIndexByNames_ACU(null, INDEX_CODE_COLUMN_NAMES_ACU)).toBe(-1);
  });

  it('纪要索引条目的越南语与中文注释都能命中，新建时使用越南语注释', () => {
    expect(SUMMARY_INDEX_ENTRY_COMMENTS_ACU[0]).toBe('TavernDB-ACU-CustomExport-Chỉ mục kỷ yếu');
    expect(isSummaryIndexEntryName_ACU('Chỉ mục kỷ yếu')).toBe(true);
    expect(isSummaryIndexEntryName_ACU('纪要索引')).toBe(true);
    expect(isSummaryIndexEntryName_ACU('Bảng kỷ yếu-Chỉ mục')).toBe(false);
    expect(endsWithSummaryIndexEntryComment_ACU('ACU-[k]-TavernDB-ACU-CustomExport-纪要索引')).toBe(true);
    expect(endsWithSummaryIndexEntryComment_ACU('ACU-[k]-TavernDB-ACU-CustomExport-Chỉ mục kỷ yếu')).toBe(true);
    expect(startsWithSummaryIndexEntryComment_ACU('TavernDB-ACU-CustomExport-Chỉ mục kỷ yếu-2')).toBe(true);
    expect(startsWithSummaryIndexEntryComment_ACU('TavernDB-ACU-CustomExport-Kỷ yếu-2')).toBe(false);
  });

  it('附加索引默认名用越南语后缀生成，新旧后缀都算默认名', () => {
    expect(buildDefaultExtraIndexEntryName_ACU('Bảng lựa chọn')).toBe('Bảng lựa chọn-Chỉ mục');
    expect(isDefaultExtraIndexEntryName_ACU('背包-索引', '背包')).toBe(true);
    expect(isDefaultExtraIndexEntryName_ACU('背包-Chỉ mục', '背包')).toBe(true);
    expect(isDefaultExtraIndexEntryName_ACU('背包-自定义', '背包')).toBe(false);
  });

  it('自定义导出辅助条目的新旧后缀都被同一个模式匹配', () => {
    const pattern = new RegExp(`^条目(?:-(?:${EXPORT_AUXILIARY_SUFFIX_PATTERN_ACU}|[1-9]\\d*))?$`);
    for (const suffix of [EXPORT_HEADER_SUFFIX_ACU, EXPORT_WRAPPER_BEFORE_SUFFIX_ACU, EXPORT_WRAPPER_AFTER_SUFFIX_ACU, '-表头', '-包裹-上', '-包裹-下', '-12', '']) {
      expect(pattern.test(`条目${suffix}`)).toBe(true);
    }
    expect(pattern.test('条目-其他')).toBe(false);
  });

  it('旧式固定条目前缀与外部导入前缀保持中文原名', () => {
    expect(isSummaryEntryComment_ACU('总结条目3')).toBe(true);
    expect(isSummaryEntryComment_ACU('小总结条目3')).toBe(false);
    expect(isSmallSummaryEntryComment_ACU('小总结条目3')).toBe(true);
    expect(isPersonEntryComment_ACU('重要人物条目1')).toBe(true);
    expect(hasImportEntryPrefix_ACU('外部导入-TavernDB-ACU-CustomExport-纪要-1')).toBe(true);
    expect(hasImportEntryPrefix_ACU('Nhập ngoài-x')).toBe(false);
    expect(stripImportEntryPrefix_ACU('外部导入-批次A-总结条目1')).toBe('总结条目1');
    expect(stripImportEntryPrefix_ACU('普通条目')).toBe('普通条目');
  });
});
