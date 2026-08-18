import { api } from "./api";
import type { AnalysisOverview } from "./types/analysis-types";

export const analysisApi = {
  async overview(): Promise<AnalysisOverview> {
    const { data } = await api.get<AnalysisOverview>("/analysis/overview");
    return data;
  },
};
