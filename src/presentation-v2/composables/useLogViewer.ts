/**
 * useLogViewer — 运行日志页业务流编排
 *
 * 页面只消费本 composable；日志读写集中对接 shared/log-buffer，避免 v2
 * Vue 组件复用旧 presentation/log-viewer 的 jQuery 状态机。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  type LogEntry,
  type LogLevel,
  clearLogs,
  getAllLogs,
  getKnownTags,
  getLogCount,
  isDebugLogEnabled,
  setDebugLogEnabled,
  subscribe,
} from '../../shared/log-buffer';
import { acuCancelAnimationFrame, acuRequestAnimationFrame } from '../bootstrap/host-env';
import { getAcuHostDocument } from '../bootstrap/host-document';
import { useDevOptions } from './useDevOptions';
import { useToastStore } from '../stores/toast-store';

export type LogLevelFilter = LogLevel | 'all';

export interface LogViewerMessage {
  kind: 'success' | 'info' | 'warning' | 'error';
  text: string;
}

const levelOptions: { value: LogLevelFilter; label: string }[] = [
  { value: 'all', label: 'Mọi cấp độ' },
  { value: 'api', label: 'Yêu cầu API' },
  { value: 'debug', label: 'Debug' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
];

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const doc = getAcuHostDocument();
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useLogViewer() {
  const toast = useToastStore();
  const { apiLogEnabled, setApiLogEnabled, warnLogEnabled, setWarnLogEnabled } = useDevOptions();
  const logs = ref<LogEntry[]>([]);
  const knownTags = ref<string[]>([]);
  const totalCount = ref(0);
  const levelFilter = ref<LogLevelFilter>('all');
  const tagFilter = ref('all');
  const keyword = ref('');
  const paused = ref(false);
  const pendingEntries = ref<LogEntry[]>([]);
  const autoScroll = ref(true);
  const debugLogEnabled = ref(false);
  const message = ref<LogViewerMessage | null>(null);
  let unsubscribe: (() => void) | null = null;
  let rafId: number | null = null;

  const tagOptions = computed(() => [
    { value: 'all', label: 'Mọi module' },
    ...knownTags.value.map(tag => ({ value: tag, label: tag })),
  ]);

  const filteredLogs = computed(() => {
    const needle = keyword.value.trim().toLowerCase();
    return logs.value.filter(entry => {
      if (levelFilter.value !== 'all' && entry.level !== levelFilter.value) return false;
      if (tagFilter.value !== 'all' && entry.tag !== tagFilter.value) return false;
      if (needle && !entry.message.toLowerCase().includes(needle)) return false;
      return true;
    });
  });

  const visibleLogs = computed(() => filteredLogs.value.slice().reverse());
  const filteredCount = computed(() => filteredLogs.value.length);
  const pendingCount = computed(() => pendingEntries.value.length);
  const statusLabel = computed(() => {
    if (paused.value) return pendingCount.value ? `Đã tạm dừng, ${pendingCount.value} mục chờ hiển thị` : 'Đã tạm dừng';
    return 'Đang cập nhật theo thời gian thực';
  });
  const debugLabel = computed(() => (debugLogEnabled.value ? 'Đang thu thập Debug' : 'Không thu thập Debug'));
  const warnLabel = computed(() => (warnLogEnabled.value ? 'Đang thu thập Warn' : 'Không thu thập Warn'));
  const apiLabel = computed(() => (apiLogEnabled.value ? 'Đang thu thập API' : 'Không thu thập API'));

  function refresh(): void {
    logs.value = getAllLogs();
    knownTags.value = getKnownTags();
    totalCount.value = getLogCount();
    debugLogEnabled.value = isDebugLogEnabled();
    if (tagFilter.value !== 'all' && !knownTags.value.includes(tagFilter.value)) {
      tagFilter.value = 'all';
    }
  }

  function scheduleRefresh(): void {
    if (rafId !== null) return;
    rafId = acuRequestAnimationFrame(() => {
      rafId = null;
      refresh();
    });
  }

  function setPaused(value: boolean): void {
    paused.value = value;
    if (!value) {
      pendingEntries.value = [];
      refresh();
    }
  }

  function clearAll(): void {
    clearLogs();
    pendingEntries.value = [];
    refresh();
    message.value = null;
    toast.success('Đã xóa trống bộ đệm nhật ký.');
  }

  function setDebugCollection(enabled: boolean): void {
    setDebugLogEnabled(enabled);
    debugLogEnabled.value = enabled;
    message.value = null;
    if (enabled) toast.info('Đã bắt đầu thu thập nhật ký Debug; nên tắt sau khi điều tra xong.');
    else toast.success('Đã dừng thu thập nhật ký Debug.');
  }

  function setApiCollection(enabled: boolean): void {
    setApiLogEnabled(enabled);
    message.value = null;
    if (enabled) toast.info('Đã bắt đầu thu thập yêu cầu và phản hồi API; hãy kiểm tra quyền riêng tư trước khi chia sẻ nhật ký.');
    else toast.success('Đã dừng thu thập yêu cầu và phản hồi API.');
  }

  function setWarnCollection(enabled: boolean): void {
    setWarnLogEnabled(enabled);
    message.value = null;
    if (enabled) toast.info('Đã bắt đầu thu thập nhật ký Warn; nên tắt sau khi điều tra xong.');
    else toast.success('Đã dừng thu thập nhật ký Warn.');
  }

  function exportFiltered(): void {
    const exportData = filteredLogs.value.map(entry => ({
      time: new Date(entry.timestamp).toISOString(),
      level: entry.level,
      tag: entry.tag,
      message: entry.message,
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJson(`acu-logs-${stamp}.json`, exportData);
    message.value = null;
    toast.success(`Đã xuất ${exportData.length} mục nhật ký.`);
  }

  onMounted(() => {
    refresh();
    unsubscribe = subscribe(entry => {
      totalCount.value = getLogCount();
      knownTags.value = getKnownTags();
      if (paused.value) {
        pendingEntries.value = [...pendingEntries.value, entry];
        return;
      }
      scheduleRefresh();
    });
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
    unsubscribe = null;
    if (rafId !== null) {
      acuCancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  return {
    logs,
    visibleLogs,
    levelOptions,
    tagOptions,
    levelFilter,
    tagFilter,
    keyword,
    paused,
    autoScroll,
    debugLogEnabled,
    warnLogEnabled,
    apiLogEnabled,
    message,
    totalCount,
    filteredCount,
    pendingCount,
    statusLabel,
    debugLabel,
    warnLabel,
    apiLabel,
    refresh,
    setPaused,
    clearAll,
    setDebugCollection,
    setWarnCollection,
    setApiCollection,
    exportFiltered,
  };
}
