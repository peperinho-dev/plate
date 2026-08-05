import { useAppStore } from "../../shared/store";
import type { AnalyticsLayoutEntry } from "../../shared/store/types";

export function setAnalyticsLayout(layout: AnalyticsLayoutEntry[]) {
  useAppStore.setState({ analyticsLayout: layout });
}
