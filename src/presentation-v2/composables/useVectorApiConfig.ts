import { reactive, ref } from "vue";
import { saveSettings_ACU } from "../../service/settings/settings-service";
import {
  getCurrentVectorMemoryConfig_ACU,
  validateSummaryVectorIndexConfig_ACU,
} from "../../service/vector/vector-memory-config";
import {
  normalizeRerankBatchSize_ACU,
  VECTOR_RERANK_DEFAULT_BATCH_SIZE_ACU,
  VECTOR_RERANK_MAX_BATCH_SIZE_ACU,
  VECTOR_RERANK_MIN_BATCH_SIZE_ACU,
} from "../../data/gateways/vector-rerank-gateway";
import { useToastStore } from "../stores/toast-store";

export interface VectorApiForm {
  embeddingEndpoint: string;
  embeddingModel: string;
  embeddingApiKey: string;
  rerankEndpoint: string;
  rerankModel: string;
  rerankApiKey: string;
  rerankInstruction: string;
  rerankBatchSize: number;
}

export const RERANK_BATCH_SIZE_LIMITS = {
  min: VECTOR_RERANK_MIN_BATCH_SIZE_ACU,
  max: VECTOR_RERANK_MAX_BATCH_SIZE_ACU,
  default: VECTOR_RERANK_DEFAULT_BATCH_SIZE_ACU,
} as const;

function createEmptyForm(): VectorApiForm {
  return {
    embeddingEndpoint: "",
    embeddingModel: "",
    embeddingApiKey: "",
    rerankEndpoint: "",
    rerankModel: "",
    rerankApiKey: "",
    rerankInstruction: "",
    rerankBatchSize: VECTOR_RERANK_DEFAULT_BATCH_SIZE_ACU,
  };
}

export function useVectorApiConfig() {
  const toast = useToastStore();
  const form = reactive<VectorApiForm>(createEmptyForm());
  const errors = ref<string[]>([]);
  const savedAt = ref<number | null>(null);

  function refresh(): void {
    const config = getCurrentVectorMemoryConfig_ACU();
    form.embeddingEndpoint = config.embeddingEndpoint || "";
    form.embeddingModel = config.embeddingModel || "";
    form.embeddingApiKey = config.embeddingApiKey || "";
    form.rerankEndpoint = config.rerankEndpoint || "";
    form.rerankModel = config.rerankModel || "";
    form.rerankApiKey = config.rerankApiKey || "";
    form.rerankInstruction = config.rerankInstruction ?? "";
    form.rerankBatchSize = normalizeRerankBatchSize_ACU(config.rerankBatchSize);
    errors.value = [];
  }

  function save(): boolean {
    const config = getCurrentVectorMemoryConfig_ACU();
    config.embeddingEndpoint = form.embeddingEndpoint.trim();
    config.embeddingModel = form.embeddingModel.trim();
    config.embeddingApiKey = form.embeddingApiKey;
    config.rerankEndpoint = form.rerankEndpoint.trim();
    config.rerankModel = form.rerankModel.trim();
    config.rerankApiKey = form.rerankApiKey;
    config.rerankInstruction = form.rerankInstruction.trim();
    const batchSize = normalizeRerankBatchSize_ACU(form.rerankBatchSize);
    form.rerankBatchSize = batchSize;
    config.rerankBatchSize = batchSize;

    const validation = validateSummaryVectorIndexConfig_ACU(config);
    if (!validation.valid) {
      errors.value = formatVectorApiErrors(validation.errors);
      return false;
    }

    errors.value = [];
    saveSettings_ACU();
    savedAt.value = Date.now();
    toast.success("Đã lưu cấu hình dịch vụ vector.");
    return true;
  }

  refresh();

  return {
    form,
    errors,
    savedAt,
    refresh,
    save,
  };
}

function formatVectorApiErrors(rawErrors: string[]): string[] {
  return rawErrors.map((error) => {
    if (error.includes("embeddingEndpoint")) {
      return "Thiếu “URL vector hóa”";
    }
    if (error.includes("embeddingModel")) {
      return "Thiếu “tên mô hình vector hóa”";
    }
    if (error.includes("rerankEndpoint") || error.includes("rerankModel")) {
      return "“URL rerank” và “tên mô hình rerank” cần điền cùng nhau, hoặc để trống cả hai";
    }
    return error;
  });
}
