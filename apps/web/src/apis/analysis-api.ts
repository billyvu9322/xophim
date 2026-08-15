import { api } from "./api";
import type { AnalysisOverview } from "./types/analysis-types";

export const analysisApi = {
  async overview(password: string): Promise<AnalysisOverview> {
    const { data } = await api.get<AnalysisOverview>("/analysis/overview", {
      headers: { "x-analysis-password": password },
    });
    return data;
  },
};
