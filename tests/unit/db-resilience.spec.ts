import { expect, test } from "@playwright/test";

import {
  getFailureBackoffMs,
  shouldReportFailure,
  summarizeDatabaseError,
} from "../../src/lib/db/resilience";

test("database failure backoff grows and is capped", () => {
  expect(getFailureBackoffMs(1)).toBe(30_000);
  expect(getFailureBackoffMs(2)).toBe(60_000);
  expect(getFailureBackoffMs(20)).toBe(300_000);
});

test("database failure reporting is rate limited", () => {
  expect(shouldReportFailure(0, 10_000)).toBe(true);
  expect(shouldReportFailure(10_000, 30_000)).toBe(false);
  expect(shouldReportFailure(10_000, 70_000)).toBe(true);
});

test("database errors are summarized without emitting a stack trace", () => {
  const error = new Error("Failed query: select content\nparams: []", {
    cause: Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" }),
  });

  expect(summarizeDatabaseError(error)).toBe("ECONNREFUSED: connect refused");
});
