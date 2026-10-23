type WebVitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB";

type WebVitalPayload = {
  name: WebVitalName;
  value: number;
  path: string;
  navigationId: string;
};

let started = false;

function reportMetric(name: WebVitalName, value: number, navigationId: string) {
  if (!Number.isFinite(value) || value < 0) return;
  const payload: WebVitalPayload = {
    name,
    value: Math.round(value * 1_000) / 1_000,
    path: window.location.pathname,
    navigationId,
  };
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/web-vitals", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/web-vitals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  });
}

function observe(type: string, callback: (entries: PerformanceEntry[]) => void) {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()));
    observer.observe({ type, buffered: true });
    return observer;
  } catch {
    return null;
  }
}

export function startWebVitalsMonitoring() {
  if (started || typeof window === "undefined" || !("PerformanceObserver" in window)) return;
  started = true;
  const navigationId = `${Math.round(performance.timeOrigin)}-${Math.random().toString(36).slice(2, 10)}`;
  const observers: PerformanceObserver[] = [];

  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (navigation) reportMetric("TTFB", navigation.responseStart - navigation.startTime, navigationId);

  const paintObserver = observe("paint", (entries) => {
    const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
    if (fcp) reportMetric("FCP", fcp.startTime, navigationId);
  });
  if (paintObserver) observers.push(paintObserver);

  let largestContentfulPaint = 0;
  const lcpObserver = observe("largest-contentful-paint", (entries) => {
    largestContentfulPaint = entries.at(-1)?.startTime ?? largestContentfulPaint;
  });
  if (lcpObserver) observers.push(lcpObserver);

  let cumulativeLayoutShift = 0;
  const clsObserver = observe("layout-shift", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
      if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value ?? 0;
    }
  });
  if (clsObserver) observers.push(clsObserver);

  let interactionToNextPaint = 0;
  const inpObserver = observe("event", (entries) => {
    for (const entry of entries as Array<PerformanceEntry & { interactionId?: number }>) {
      if (entry.interactionId && entry.duration > interactionToNextPaint) {
        interactionToNextPaint = entry.duration;
      }
    }
  });
  if (inpObserver) observers.push(inpObserver);

  const flush = () => {
    if (largestContentfulPaint) reportMetric("LCP", largestContentfulPaint, navigationId);
    reportMetric("CLS", cumulativeLayoutShift, navigationId);
    if (interactionToNextPaint) reportMetric("INP", interactionToNextPaint, navigationId);
    observers.forEach((observer) => observer.disconnect());
  };

  window.addEventListener("pagehide", flush, { once: true });
}
