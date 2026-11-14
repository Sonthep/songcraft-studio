// End-to-end workflow check against a running server, using the installed Chrome.
// Usage: BASE_URL=http://localhost:3000 node scripts/e2e/workflows.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = process.env.SHOT_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "songcraft-e2e-"));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Write a 16-bit mono WAV with a three-note hummed-style melody (C4, E4, G4). */
function makeHumWav(file) {
  const sr = 22050;
  const parts = [[261.63, 0.5], [0, 0.15], [329.63, 0.5], [392, 0.6]];
  const total = Math.floor(parts.reduce((a, [, d]) => a + d, 0) * sr);
  const data = new Float32Array(total);
  let i = 0;
  let ph = 0;
  for (const [f, d] of parts) {
    for (let k = 0; k < Math.floor(d * sr); k++, i++) {
      if (f) {
        ph += (2 * Math.PI * f) / sr;
        data[i] = 0.5 * (Math.sin(ph) + 0.3 * Math.sin(2 * ph));
      }
    }
  }
  const buf = Buffer.alloc(44 + total * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + total * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(total * 2, 40);
  for (let k = 0; k < total; k++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[k])) * 32767), 44 + k * 2);
  fs.writeFileSync(file, buf);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["microphone", "clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
});

const notesCount = async () => Number((await page.locator("text=/\\d+ notes/").first().textContent()).match(/(\d+) notes/)[1]);

try {
  // 1. Create a project
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "New song" }).first().click();
  await page.getByLabel("Title").fill("E2E Workflow Song");
  await page.getByRole("button", { name: "Create song" }).click();
  await page.waitForURL(/\/studio\/.+\/lyrics/);
  const pid = page.url().split("/studio/")[1].split("/")[0];
  check("create project", !!pid, pid);

  // 2. Lyrics editing + analysis
  const first = page.locator("[data-line-input]").first();
  await first.click();
  await first.fill("คืนนี้ฉันนอนไม่หลับ");
  await first.press("Enter");
  await page.keyboard.type("คิดถึงอุดร");
  await page.keyboard.press("Enter");
  await page.keyboard.type("ใจยังรอคอยกลับ");
  await page.keyboard.press("Enter");
  await page.keyboard.type("เพลงกาพย์กลอน");
  await page.waitForTimeout(800);
  const lineCount = await page.locator("section").first().locator("[data-line-input]").count();
  check("line-based editing (Enter creates lines)", lineCount === 4, `${lineCount} lines`);
  const scheme = await page.locator("text=/scheme ABAB/").count();
  check("rhyme scheme detection", scheme > 0, "ABAB expected");

  // 3. Rhyme finder from a syllable click
  await page.getByRole("button", { name: "ดร" }).first().click();
  await page.waitForTimeout(500);
  const rhymeHit = await page.getByRole("button", { name: /ออนซอน/ }).count();
  check("rhyme finder finds ออนซอน for อุดร", rhymeHit > 0);

  // 4. Manual syllable override
  await page.locator("[data-line-id]").nth(1).hover();
  await page.locator("[data-line-id]").nth(1).getByRole("button", { name: /edit syllables/ }).click();
  const ov = page.getByLabel("Manual syllables");
  await ov.fill("คิด-ถึง อุ-ดร-น้อ");
  await ov.press("Enter");
  await page.waitForTimeout(300);
  const counts = await page.locator("[data-line-id]").nth(1).locator("[title^='Syllables']").textContent();
  check("manual syllable override", counts?.trim() === "5", `count ${counts?.trim()}`);

  // 5. Chords
  await page.goto(`${BASE}/studio/${pid}/chords`);
  await page.getByLabel("Chord progression text").fill("Am – F – C – G7");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.waitForTimeout(300);
  const chordChips = await page.locator("button[aria-pressed]").filter({ hasText: /bar \d/ }).count();
  check("chord progression parsing", chordChips === 4, `${chordChips} chords`);

  // 6. Melody designer
  await page.goto(`${BASE}/studio/${pid}/melody`);
  await page.getByRole("button", { name: /Generate 3 candidates/ }).click();
  await page.waitForTimeout(500);
  const tabs = await page.getByRole("tab").count();
  check("melody designer generates 3 candidates", tabs === 3, `${tabs} tabs`);
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "melody.png") });

  // 7. Piano roll edit, undo, playback, MIDI export
  await page.goto(`${BASE}/studio/${pid}/piano-roll`);
  await page.waitForSelector("[data-note-id]");
  const n0 = await notesCount();
  check("applied melody shows in piano roll with lyric labels", n0 >= 19 && (await page.locator("[data-note-id] span").filter({ hasText: "ดร" }).count()) > 0, `${n0} notes`);
  const scroller = page.locator("[aria-label='Piano roll note editor']");
  await scroller.evaluate((el) => (el.scrollTop = 0)); // top octaves are empty
  const sb = await scroller.boundingBox();
  await page.mouse.click(sb.x + 260, sb.y + 120);
  await page.waitForTimeout(200);
  const n1 = await notesCount();
  check("draw note", n1 === n0 + 1, `${n0} → ${n1}`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  check("undo", (await notesCount()) === n0);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(200);
  check("redo", (await notesCount()) === n1);
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);
  check("delete selected note", (await notesCount()) === n0);
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(1600);
  const posText = await page.locator("[title='Bar.Beat.Sixteenth']").textContent();
  check("playback advances transport", posText !== "1.1.1", posText);
  await page.getByRole("button", { name: /Stop and return/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export MIDI/ }).click()]);
  const midiPath = path.join(OUT, "song.mid");
  await dl.saveAs(midiPath);
  const midi = fs.readFileSync(midiPath);
  check("MIDI export", midi.subarray(0, 4).toString() === "MThd" && midi.length > 100, `${midi.length} bytes`);
  await page.screenshot({ path: path.join(OUT, "piano-roll.png") });

  // 8. Hum to melody via upload
  const wav = path.join(OUT, "hum.wav");
  makeHumWav(wav);
  await page.goto(`${BASE}/studio/${pid}/hum`);
  await page.locator("input[type=file]").setInputFiles(wav);
  await page.getByRole("button", { name: /Analyse pitch/ }).click();
  await page.waitForSelector("table tbody tr", { timeout: 20000 });
  const rows = await page.locator("table tbody tr").count();
  const firstNotes = await page.locator("table tbody tr td:nth-child(2)").allTextContents();
  check("hum analysis detects 3 notes", rows === 3 && firstNotes.join(",") === "C4,E4,G4", `${rows} rows: ${firstNotes.join(",")}`);
  await page.screenshot({ path: path.join(OUT, "hum.png") });
  await page.getByRole("button", { name: /Send 3 notes to Piano Roll/ }).click();
  await page.waitForURL(/piano-roll/);
  await page.waitForTimeout(300);
  check("hum notes sent to piano roll", (await notesCount()) === n0 + 3);

  // 9. Rap flow
  await page.goto(`${BASE}/studio/${pid}/flow`);
  await page.getByRole("button", { name: /Auto-arrange section/ }).click();
  await page.waitForTimeout(300);
  const placed = await page.locator("button[draggable=true]").count();
  check("flow auto-arrange places syllables", placed >= 19, `${placed} chips`);
  await page.screenshot({ path: path.join(OUT, "flow.png") });

  // 10. Vocal recorder with fake microphone
  await page.goto(`${BASE}/studio/${pid}/record`);
  await page.getByRole("button", { name: /Record take 1/ }).click();
  await page.waitForTimeout(4500);
  check(
    "transport reflects recording state",
    (await page.getByRole("button", { name: "Stop recording" }).count()) === 1 && (await page.getByRole("button", { name: "Pause" }).count()) === 1,
  );
  await page.getByRole("button", { name: /Stop ·/ }).click();
  await page.waitForSelector("text=/Take 1 saved/", { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(800);
  const takes = await page.getByLabel("Take name").count();
  check("record a take (fake mic)", takes === 1, `${takes} takes`);

  // 11. Audio workspace + tempo
  await page.goto(`${BASE}/studio/${pid}/audio`);
  await page.getByLabel("Take name").first().waitFor();
  await page.waitForTimeout(500);
  const files = await page.getByLabel("Take name").count();
  check("audio workspace lists files", files >= 2, `${files} files`);

  // 12. WAV render + export page
  await page.goto(`${BASE}/studio/${pid}/export`);
  const [wdl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "WAV", exact: true }).click()]);
  const wavOut = path.join(OUT, "render.wav");
  await wdl.saveAs(wavOut);
  const w = fs.readFileSync(wavOut);
  check("WAV render export", w.subarray(0, 4).toString() === "RIFF" && w.length > 100000, `${(w.length / 1024).toFixed(0)} KB`);
  const prompt = await page.locator("pre").first().textContent();
  check("Suno prompt generated from song", /Genre:/.test(prompt) && /Tempo: 80 BPM/.test(prompt));

  // 13. Persistence across reload
  await page.goto(`${BASE}/studio/${pid}/lyrics`);
  await page.waitForSelector("[data-line-input]");
  const persisted = await page.locator("[data-line-input]").first().inputValue();
  check("autosave persists after reload", persisted === "คืนนี้ฉันนอนไม่หลับ");
  await page.screenshot({ path: path.join(OUT, "lyrics.png") });

  // 14. Project management
  await page.goto(`${BASE}/projects`);
  await page.getByRole("button", { name: "Actions for E2E Workflow Song" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.waitForTimeout(500);
  const listItem = (t) => page.locator("ul li").filter({ has: page.getByText(t, { exact: true }) });
  check("duplicate project", (await listItem("E2E Workflow Song (copy)").count()) === 1);
  await page.getByRole("button", { name: "Actions for E2E Workflow Song (copy)" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForTimeout(500);
  check("delete project", (await listItem("E2E Workflow Song (copy)").count()) === 0 && (await listItem("E2E Workflow Song").count()) === 1);

  // 15. Other pages render
  for (const p of ["/rhymes", "/settings", `/studio/${pid}/coach`]) {
    await page.goto(BASE + p);
    await page.waitForTimeout(500);
  }
  check("rhymes/settings/coach pages render", (await page.getByText("Measurements").count()) > 0);
} catch (err) {
  check("workflow script completed", false, err.message.split("\n")[0]);
  await page.screenshot({ path: path.join(OUT, "failure.png") }).catch(() => null);
}

const real = errors.filter((e) => !/favicon/.test(e));
check("no console/page errors", real.length === 0, real.slice(0, 5).join(" | "));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed. Artifacts: ${OUT}`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
