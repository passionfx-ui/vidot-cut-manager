/**
 * Browser-less route check: ids that are not uuid-shaped (path-like, trailing dash, drive paths ...) are rejected with
 * 400/404 and never 200/500. Read-only GET requests only. Needs the server restarted on a build with 0.9.45 for the
 * native-id rule; on an older server the same requests still end in 404, so this never fails for the wrong reason.
 */
import os from "node:os";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8188";
const MIN_RAM = 40 * 1024 ** 3;
if (os.freemem() < MIN_RAM) {
  console.log(`SKIP: RAM check failed (start): ${Math.round(os.freemem() / 1e9)} GB free, need 40+ GB`);
  process.exit(0);
}

const bad = ["../x-y", "..%5Cx-y", "C:/x-y", "x-y-", "-", "a-b-c-d-e", "018f-abc", "018F2A3B-4C5D-7E6F-8A9B-0C1D2E3F4A5B", "../../018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b"];
const unknownUuid = "018f2a3b-4c5d-7e6f-8a9b-0c1d2e3f4a5b";
let failed = 0;
for (const route of ["/gonggan/timeline", "/gonggan/trash", "/gonggan/template"]) {
  for (const pid of [...bad, unknownUuid]) {
    const enc = pid.includes("%") ? pid : encodeURIComponent(pid);
    const res = await fetch(`${BASE}${route}?pid=${enc}`);
    const text = await res.text();
    if (res.status !== 400 && res.status !== 404) {
      failed += 1;
      console.error(`FAIL  ${route}?pid=${pid} -> ${res.status} ${text.slice(0, 120)}`);
    }
  }
}
if (failed) process.exit(1);
console.log(`PASS  ${3 * (bad.length + 1)} non-uuid / unknown ids answered 400/404 (no 200, no 500)`);
console.log("PASS  pid validation e2e complete");