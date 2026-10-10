/**
 * tests/shared/table-defaults.test.ts
 * 默认表模板 DDL 放宽规则 单元测试
 */
import { describe, expect, it } from 'vitest';
import {
  buildDefaultTableTemplateObject_ACU,
  buildLegacyZhDefaultTemplateSignatureLists_ACU,
  buildOriginalDefaultTableTemplateObject_ACU,
  relaxDefaultTableDdl_ACU,
} from '../../src/shared/table-defaults/index.js';
import { parseDDLColumnInfos_ACU } from '../../src/shared/ddl-utils';
import { resolvePhysicalTableNames_ACU } from '../../src/shared/sheet-identity';
import { validateImportedTemplateObject_ACU } from '../../src/service/template/template-import-validator';

const HAN_ACU = /[\u4e00-\u9fff]/;

function listSheets(template: any): any[] {
  return Object.keys(template).filter(key => key !== 'mate').map(key => template[key]);
}

describe.each([
  ['当前默认模板', buildDefaultTableTemplateObject_ACU],
  ['原默认模板', buildOriginalDefaultTableTemplateObject_ACU],
])('%s 越南语化', (_label, build) => {
  it('表名、表头、提示词、DDL 注释与导出配置不含中文，中文只出现在历史别名声明里', () => {
    for (const sheet of listSheets(build())) {
      const { tableAliases, columnAliases, ...sourceData } = sheet.sourceData;
      expect(HAN_ACU.test(JSON.stringify({ ...sheet, sourceData }))).toBe(false);
      expect(tableAliases).toHaveLength(1);
      expect(HAN_ACU.test(tableAliases[0])).toBe(true);
      expect(Object.keys(columnAliases).length).toBe(sheet.content[0].length - 1);
    }
  });

  it('DDL 列注释与表头逐列一致，columnAliases 以物理列名为键', () => {
    for (const sheet of listSheets(build())) {
      const columns = parseDDLColumnInfos_ACU(sheet.sourceData.ddl);
      expect(columns.map(column => column.sqlName === 'row_id' ? 'row_id' : column.comment)).toEqual(sheet.content[0]);
      expect(Object.keys(sheet.sourceData.columnAliases).sort())
        .toEqual(columns.map(column => column.sqlName).filter(name => name !== 'row_id').sort());
    }
  });

  it('导出配置引用的列都存在于表头', () => {
    for (const sheet of listSheets(build())) {
      const config = sheet.exportConfig;
      const referenced = [
        ...config.extraIndexColumns,
        ...Object.keys(config.extraIndexColumnModes),
        ...String(config.keywords || '').split(',').map((item: string) => item.trim()).filter(Boolean),
      ];
      for (const column of referenced) expect(sheet.content[0]).toContain(column);
    }
  });

  it('越南语表名派生出互不冲突的 SQLite 物理表名，并通过模板导入校验', () => {
    const template = build();
    const physicalNames = [...resolvePhysicalTableNames_ACU(template).values()];
    expect(new Set(physicalNames).size).toBe(physicalNames.length);
    for (const name of physicalNames) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(physicalNames).toContain('bangkyyeu');
    expect(validateImportedTemplateObject_ACU(template)).toEqual([]);
  });
});

describe('默认模板的中文旧名', () => {
  it('旧名签名与改名前的模板一致：当前默认 8 张、原默认 8 张，表名互不重复', () => {
    const [current, original] = buildLegacyZhDefaultTemplateSignatureLists_ACU();
    expect(current).toHaveLength(8);
    expect(original).toHaveLength(8);
    expect(current).toContain('纪要表::["row_id","编码索引","时间跨度","概览","纪要","重要对话"]');
    expect(original).toContain('纪要表::["row_id","时间跨度","地点","纪要","概览","编码索引"]');
    expect(original).toContain('背包物品表::["row_id","物品名称","数量","描述/效果","类别"]');
    for (const list of [current, original]) {
      const names = list.map((signature: string) => signature.split('::')[0]);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('每张默认表把自己的中文旧表名与旧列名声明为别名', () => {
    const template = buildDefaultTableTemplateObject_ACU() as any;
    const chronicle = listSheets(template).find(sheet => sheet.name === 'Bảng kỷ yếu');
    expect(chronicle.sourceData.tableAliases).toEqual(['纪要表']);
    expect(chronicle.sourceData.columnAliases).toEqual({
      code_index: ['编码索引'],
      time_span: ['时间跨度'],
      summary: ['概览'],
      chronicle_text: ['纪要'],
      key_dialogue: ['重要对话'],
    });
    expect(chronicle.exportConfig).toMatchObject({
      entryName: 'Kỷ yếu',
      keywords: 'Mã chỉ mục',
      extraIndexEntryName: 'Chỉ mục kỷ yếu',
      injectionTemplate: '<Hồi tưởng ký ức>\n$1\n</Hồi tưởng ký ức>',
    });
  });
});

describe('relaxDefaultTableDdl_ACU', () => {
  it('删除表级约束后不会在闭合括号前留下尾逗号', () => {
    const ddl = `CREATE TABLE test_table (
  row_id INTEGER PRIMARY KEY CHECK (row_id > 0), -- 行号
  name TEXT NOT NULL UNIQUE, -- 名称
  status TEXT DEFAULT 'active', -- 状态
  UNIQUE (name)
);`;

    const relaxed = relaxDefaultTableDdl_ACU(ddl);

    expect(relaxed).not.toContain(',\n);');
    expect(relaxed).toContain('row_id INTEGER PRIMARY KEY, -- 行号');
    expect(relaxed).toContain('name TEXT, -- 名称');
    expect(relaxed).toContain('status TEXT -- 状态');
    expect(relaxed).not.toMatch(/\bNOT\s+NULL\b/i);
    expect(relaxed).not.toMatch(/\bUNIQUE\b/i);
    expect(relaxed).not.toMatch(/\bCHECK\b/i);
    expect(relaxed).not.toMatch(/\bDEFAULT\b/i);
  });

  it('保留闭合行注释并清理其前一列尾逗号', () => {
    const ddl = `CREATE TABLE test_table (
  row_id INTEGER PRIMARY KEY, -- 行号
  value TEXT,
  PRIMARY KEY (row_id)
); -- end`;

    const relaxed = relaxDefaultTableDdl_ACU(ddl);

    expect(relaxed).toContain('value TEXT\n); -- end');
    expect(relaxed).not.toContain('value TEXT,\n); -- end');
  });
});
