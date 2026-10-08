"use client";

import { ConnectionTestPanel, useConnectionTest } from "./connection-test";

/** « Tester ma connexion », dans le diagnostic technique : les contrôles réels, pour l'assistance. */
export function DiagnosticTest({ salesFollowed, scanCount }: { salesFollowed: boolean; scanCount: number }) {
  const test = useConnectionTest();
  return <ConnectionTestPanel result={test.result} running={test.running} canTestScan={salesFollowed} scanCount={scanCount} onRun={test.run} />;
}
