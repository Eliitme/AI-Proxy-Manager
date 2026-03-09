import { NextResponse } from "next/server";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import Database from "better-sqlite3";
import { CURSOR_CONFIG } from "../../../../../lib/oauth/constants/cursor.js";

/** Get candidate db paths by platform (Cursor IDE state.vscdb) */
function getCandidatePaths(platform) {
  const home = homedir();

  if (platform === "darwin") {
    return [
      join(home, "Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
      join(home, "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb"),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(appData, "Cursor - Insiders", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(localAppData, "Programs", "Cursor", "User", "globalStorage", "state.vscdb"),
    ];
  }

  return [
    join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    join(home, ".config/cursor/User/globalStorage/state.vscdb"),
  ];
}

/**
 * Read accessToken and machineId from Cursor state.vscdb (itemTable key/value).
 * Returns { accessToken, machineId } or null if read fails (e.g. file locked, wrong schema).
 */
function readCursorTokensFromDb(dbPath) {
  const { accessToken: keyToken, machineId: keyMachine } = CURSOR_CONFIG.dbKeys;
  let db = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const stmt = db.prepare(
      "SELECT key, value FROM itemTable WHERE key = ? OR key = ?"
    );
    const rows = stmt.all(keyToken, keyMachine);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const accessToken = byKey[keyToken];
    const machineId = byKey[keyMachine];
    if (accessToken && machineId) {
      return { accessToken: String(accessToken), machineId: String(machineId) };
    }
    return null;
  } catch (err) {
    return null;
  } finally {
    if (db) db.close();
  }
}

/**
 * GET /api/oauth/cursor/auto-import
 * Detects Cursor state.vscdb, reads accessToken and machineId when possible.
 * Returns found: true + tokens for auto-fill; otherwise windowsManual or error for manual paste.
 */
export async function GET() {
  try {
    const platform = process.platform;
    const candidates = getCandidatePaths(platform);

    let dbPath = null;
    for (const candidate of candidates) {
      try {
        await access(candidate, constants.R_OK);
        dbPath = candidate;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!dbPath) {
      return NextResponse.json({
        found: false,
        error: `Cursor database not found. Checked locations:\n${candidates.join("\n")}\n\nMake sure Cursor IDE is installed and opened at least once.`,
      });
    }

    const tokens = readCursorTokensFromDb(dbPath);
    if (tokens) {
      return NextResponse.json({
        found: true,
        accessToken: tokens.accessToken,
        machineId: tokens.machineId,
      });
    }

    return NextResponse.json({
      found: false,
      windowsManual: true,
      dbPath,
      message:
        "Could not read tokens from Cursor database (e.g. Cursor may be open). Paste your access token and machine ID manually below.",
    });
  } catch (error) {
    console.log("Cursor auto-import error:", error);
    return NextResponse.json({ found: false, error: error.message }, { status: 500 });
  }
}
