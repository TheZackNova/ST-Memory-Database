/**
 * service/runtime/plot-runtime/plot-data-format.ts
 * 剧情推进 — 表格数据格式化（LLM 可读文本 / 大纲表 / 纪要索引）
 * 从 helpers-plot-runtime.ts 拆出（L26-L219）
 */
import { logDebug_ACU, logError_ACU, logWarn_ACU } from '../../../shared/utils';
import { getCharLorebooks_ACU } from '../../../data/gateways/character-gateway';
import { getLorebookEntries_ACU } from '../../../data/gateways/worldbook-gateway';
import { getIsolationPrefix_ACU } from '../../worldbook/injection-engine';
import { INDEX_CODE_COLUMN_NAME_ACU, OVERVIEW_COLUMN_NAME_ACU, SUMMARY_INDEX_ENTRY_COMMENTS_ACU, endsWithSummaryIndexEntryComment_ACU, isChronicleSheetName_ACU, isIndexCodeColumnName_ACU, isOutlineSheetName_ACU, isOverviewColumnName_ACU, isSummarySheetName_ACU } from '../../../shared/builtin-names.js';

  export function formatTableDataForLLM_ACU(jsonData: any) {
    if (!jsonData || typeof jsonData !== 'object' || Object.keys(jsonData).length === 0) {
      return 'Hiện không có dữ liệu bảng nào khả dụng.';
    }

    let output = 'Sau đây là toàn bộ dữ liệu bảng do plugin st-memory-enhancement lưu trong lịch sử trò chuyện của nhân vật hiện tại:\n';

    for (const sheetId in jsonData) {
      if (Object.prototype.hasOwnProperty.call(jsonData, sheetId)) {
        const sheet = jsonData[sheetId];
        if (sheet && sheet.name && sheet.content && sheet.content.length > 1) {
          output += `\n## Bảng: ${sheet.name}\n`;
          const headers = sheet.content[0].slice(1);
          const rows = sheet.content.slice(1);

          rows.forEach((row: any, rowIndex: number) => {
            const rowData = row.slice(1);
            let rowOutput = '';
            let hasContent = false;
            headers.forEach((header: any, index: number) => {
              const cellValue = rowData[index];
              if (cellValue !== null && cellValue !== undefined && String(cellValue).trim() !== '') {
                rowOutput += `  - ${header}: ${cellValue}\n`;
                hasContent = true;
              }
            });

            if (hasContent) {
              output += `\n### ${sheet.name} - Bản ghi thứ ${rowIndex + 1}\n${rowOutput}`;
            }
          });
        }
      }
    }
    output += '\n--- Hết dữ liệu bảng ---\n';
    return output;
  }

  /** 从世界书获取"纪要索引"条目内容（用于$5优先替换） */
  export async function getSummaryIndexContentForPlot_ACU(plotSettings: any) {
    try {
      const plotCfg = plotSettings?.plotWorldbookConfig;
      const worldbookSource = plotCfg?.source || 'character';
      let bookNames: string[] = [];
      
      if (worldbookSource === 'manual' && Array.isArray(plotCfg?.manualSelection) && plotCfg.manualSelection.length) {
        bookNames = plotCfg.manualSelection;
      } else {
        try {
          const charLorebooks = await getCharLorebooks_ACU({ type: 'all' });
          if (charLorebooks.primary) bookNames.push(charLorebooks.primary);
          if (charLorebooks.secondary) bookNames.push(charLorebooks.secondary);
          if (Array.isArray(charLorebooks.additional)) bookNames.push(...charLorebooks.additional);
        } catch (e) {
          return null;
        }
      }
      bookNames = [...new Set(bookNames.map((name: any) => String(name || '').trim()).filter(Boolean))];
      
      const isoPrefix = getIsolationPrefix_ACU();
      const targetComments = SUMMARY_INDEX_ENTRY_COMMENTS_ACU.map(base => isoPrefix + base);
      
      for (const bookName of bookNames) {
        try {
          const entries = await getLorebookEntries_ACU(bookName);
          const indexEntry = entries?.find((entry: any) => {
            const comment = String(entry?.comment || '').trim();
            return targetComments.includes(comment) || endsWithSummaryIndexEntryComment_ACU(comment);
          });
          if (indexEntry?.content) {
            logDebug_ACU('[剧情推进] $5 从世界书纪要索引条目获取成功' + (indexEntry.enabled ? '' : '(条目已禁用)'));
            return indexEntry.content;
          }
        } catch (e) {
          continue;
        }
      }
      return null;
    } catch (error) {
      logError_ACU('[剧情推进] 获取纪要索引条目失败:', error);
      return null;
    }
  }

  /** [剧情推进专用] $5 只注入"总体大纲"表（含表头） */
  export function formatOutlineTableForPlot_ACU(allTablesJson: any) {
    try {
      if (!allTablesJson || typeof allTablesJson !== 'object') {
        return 'Bảng dàn ý tổng thể: không lấy được dữ liệu bảng.';
      }
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
      const outline = sheets.find(s => isOutlineSheetName_ACU(s.name));
      if (!outline || !Array.isArray(outline.content) || outline.content.length === 0) {
        return 'Bảng dàn ý tổng thể: không tìm thấy bảng này hoặc cấu trúc bảng trống.';
      }

      const headerRow = Array.isArray(outline.content[0]) ? outline.content[0] : [];
      const headers = headerRow.slice(1).map((h: any) => String(h ?? '').trim()).filter(Boolean);
      let out = `## Bảng: ${String(outline.name || '').trim()}\n`;
      out += headers.length ? `Columns: ${headers.join(', ')}\n` : 'Columns: (không có tiêu đề)\n';

      const rows = outline.content.slice(1).filter((r: any) => Array.isArray(r));
      if (rows.length === 0) {
        out += '(không có hàng dữ liệu)\n';
        return out;
      }

      rows.forEach((row: any, idx: number) => {
        const cells = row.slice(1);
        const parts: string[] = [];
        for (let i = 0; i < headers.length; i++) {
          const v = cells[i];
          if (v !== null && v !== undefined && String(v).trim() !== '') {
            parts.push(`${headers[i]}: ${String(v)}`);
          }
        }
        out += parts.length ? `- [${idx}] ${parts.join(' | ')}\n` : `- [${idx}] (hàng trống)\n`;
      });
      return out;
    } catch (e) {
      return 'Bảng dàn ý tổng thể: đã xảy ra lỗi khi định dạng.';
    }
  }

  /** [剧情推进专用] $5 从纪要表本地数据读取概要和编码索引两列 */
  export function formatSummaryIndexForPlot_ACU(allTablesJson: any) {
    try {
      if (!allTablesJson || typeof allTablesJson !== 'object') {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未获取到表格数据');
        return { success: false, content: 'Chỉ mục kỷ yếu: không lấy được dữ liệu bảng.' };
      }
      const sheets: any[] = Object.values(allTablesJson).filter((x: any) => x && typeof x === 'object' && x.name && x.content);
      const summaryTable = sheets.find(s => {
        const name = String(s.name || '').trim();
        return isChronicleSheetName_ACU(name) || isSummarySheetName_ACU(name);
      });
      
      if (!summaryTable) {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未找到纪要表，可用表格:', sheets.map(s => s.name));
        return { success: false, content: 'Chỉ mục kỷ yếu: không tìm thấy bảng kỷ yếu.' };
      }
      
      if (!Array.isArray(summaryTable.content) || summaryTable.content.length <= 1) {
        logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 纪要表为空，content长度:', summaryTable.content?.length);
        return { success: false, content: 'Chỉ mục kỷ yếu: bảng kỷ yếu trống.' };
      }

      const headerRow = Array.isArray(summaryTable.content[0]) ? summaryTable.content[0] : [];
      logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 纪要表表头:', JSON.stringify(headerRow));
      
      const summaryColIdx = headerRow.findIndex((h: any) => {
        return isOverviewColumnName_ACU(h);
      });
      const indexColIdx = headerRow.findIndex((h: any) => isIndexCodeColumnName_ACU(h));
      
      if (summaryColIdx === -1 || indexColIdx === -1) {
        logWarn_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 未找到概要列或编码索引列，概要列索引=', summaryColIdx, ', 编码索引列索引=', indexColIdx);
        return { success: false, content: `Chỉ mục kỷ yếu: không tìm thấy cột ${OVERVIEW_COLUMN_NAME_ACU} hoặc cột ${INDEX_CODE_COLUMN_NAME_ACU}.` };
      }

      let out = `## Bảng: Chỉ mục kỷ yếu\n`;
      out += `Columns: ${OVERVIEW_COLUMN_NAME_ACU}, ${INDEX_CODE_COLUMN_NAME_ACU}\n`;

      const rows = summaryTable.content.slice(1).filter((r: any) => Array.isArray(r));
      if (rows.length === 0) {
        out += '(không có hàng dữ liệu)\n';
        return { success: true, content: out };
      }

      rows.forEach((row: any, idx: number) => {
        const summary = row[summaryColIdx] ? String(row[summaryColIdx]).trim() : '';
        const indexCode = row[indexColIdx] ? String(row[indexColIdx]).trim() : '';
        if (summary || indexCode) {
          out += `- [${idx}] ${OVERVIEW_COLUMN_NAME_ACU}: ${summary} | ${INDEX_CODE_COLUMN_NAME_ACU}: ${indexCode}\n`;
        }
      });
      logDebug_ACU('[剧情推进] formatSummaryIndexForPlot_ACU: 成功生成纪要索引，行数=', rows.length);
      return { success: true, content: out };
    } catch (e) {
      logError_ACU('[剧情推进] 格式化纪要索引时出错:', e);
      return { success: false, content: 'Chỉ mục kỷ yếu: đã xảy ra lỗi khi định dạng.' };
    }
  }
