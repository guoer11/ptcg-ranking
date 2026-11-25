import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as cheerio from "npm:cheerio@1.0.0";

const ALLOWED_ORIGIN = "https://guoer11.github.io";
const USER_AGENT = "Mozilla/5.0 (compatible; PTCG-Ranking-Pairing/0.14.3; +https://guoer11.github.io/ptcg-ranking/)";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\-＿_]/g, "");
}

function aliasVariants(value: unknown) {
  const aliases = String(value ?? "")
    .split(/[|,，\n]+/)
    .map(cleanText)
    .filter(Boolean);
  const values = new Set<string>();
  for (const alias of aliases) {
    const raw = normalize(alias);
    if (!raw) continue;
    values.add(raw);
    if (/^tw\d+$/i.test(raw)) values.add(raw.slice(2));
    if (/^\d{6,}$/.test(raw)) values.add(`tw${raw}`);
  }
  return [...values];
}

function searchTermFromAliases(value: unknown) {
  const variants = aliasVariants(value);
  const tw = variants.find(item => /^tw\d+$/i.test(item));
  if (tw) return tw.slice(2);
  const digits = variants.find(item => /^\d{6,}$/.test(item));
  if (digits) return digits;
  return variants[0] || "";
}

function validSourceUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只接受 http / https 網址");
  if (url.hostname !== "tcg.sfc-jpn.jp") throw new Error("只接受 tcg.sfc-jpn.jp 配對網址");
  if (!/\/tourround\.asp$/i.test(url.pathname)) throw new Error("請貼 tourround.asp 的 Round 配對網址");
  const tid = url.searchParams.get("tid") || "";
  const kno = url.searchParams.get("kno") || "";
  if (!/^\d+$/.test(tid) || !/^\d+$/.test(kno)) throw new Error("網址缺少有效 tid / kno");
  url.protocol = "https:";
  url.searchParams.set("znt", url.searchParams.get("znt") || "0");
  return url;
}

function decodeHtml(bytes: Uint8Array, contentType: string) {
  const headerCharset = /charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, "").toLowerCase() || "";
  if (/shift[_-]?jis|sjis|windows-31j|cp932/i.test(headerCharset)) return new TextDecoder("shift_jis").decode(bytes);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const head = utf8.slice(0, 3000);
  if (/charset\s*=\s*["']?(?:shift[_-]?jis|sjis|windows-31j|cp932)/i.test(head) || (utf8.match(/�/g)?.length || 0) > 8) {
    try { return new TextDecoder("shift_jis").decode(bytes); } catch { /* keep utf8 */ }
  }
  return utf8;
}

type Row = { index: number; cells: string[]; text: string };
type Pairing = {
  row_index: number;
  table: string;
  number: string;
  player: string;
  opponent: string;
  player_name?: string;
  opponent_name?: string;
  player_score?: string;
  opponent_score?: string;
  ttl_score?: string;
  format?: string;
};

function collectRows($: any): Row[] {
  const rows: Row[] = [];
  $("tr").each((index: number, element: any) => {
    const cells = $(element).children("th,td").map((_: number, cell: any) => cleanText($(cell).clone().children("table").remove().end().text())).get().filter(Boolean);
    if (!cells.length) return;
    rows.push({ index, cells, text: cells.join(" | ") });
  });
  return rows;
}

async function fetchHtml(url: string | URL) {
  const response = await fetch(String(url), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml",
      "Cache-Control": "no-cache",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`TCG マイスター回應 HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const html = decodeHtml(bytes, response.headers.get("content-type") || "");
  const $ = cheerio.load(html);
  $("script,style,noscript").remove();
  return {
    $,
    rows: collectRows($),
    pageText: cleanText($("body").text()),
    title: cleanText($("title").text()) || cleanText($("h1,h2,h3").first().text()),
  };
}

async function fetchSearchRows(tid: string, round: number, search: string) {
  if (!search) return [] as Row[];
  const url = new URL("https://tcg.sfc-jpn.jp/toursearch.asp");
  url.searchParams.set("tid", tid);
  url.searchParams.set("kno", String(round));
  url.searchParams.set("Sort", "Table");
  url.searchParams.set("Order", "");
  url.searchParams.set("Search", search);
  return (await fetchHtml(url)).rows;
}

function rowMatchesAliases(cells: string[], variants: string[]) {
  if (!variants.length) return false;
  const normalizedCells = cells.map(normalize);
  return normalizedCells.some(cell => variants.some(alias => cell === alias || cell.includes(alias)));
}

function extractTwIds(cells: string[]) {
  const ids: string[] = [];
  for (const cell of cells) {
    const matches = String(cell).match(/tw\d+/gi) || [];
    for (const id of matches) ids.push(cleanText(id));
  }
  return [...new Set(ids)];
}

function scoreText(value: unknown) {
  const text = cleanText(value);
  const match = text.match(/^-?\d+(?:\.\d+)?/);
  return match?.[0] || "";
}

function scoreNearPlayer(cells: string[], playerId: string) {
  const wanted = normalize(playerId);
  const idIndex = cells.findIndex(cell => {
    const ids = extractTwIds([cell]).map(normalize);
    return ids.includes(wanted);
  });
  if (idIndex < 0) return "";

  let nextIdIndex = cells.length;
  for (let i = idIndex + 1; i < cells.length; i += 1) {
    if (extractTwIds([cells[i]]).length) {
      nextIdIndex = i;
      break;
    }
  }

  for (const cell of cells.slice(idIndex + 1, nextIdIndex)) {
    const score = scoreText(cell);
    if (score) return score;
  }
  return "";
}

function modernPairing(row: Row): Pairing | null {
  const ids = extractTwIds(row.cells);
  if (ids.length < 2) return null;
  const playerScore = scoreNearPlayer(row.cells, ids[0]);
  const opponentScore = scoreNearPlayer(row.cells, ids[1]);
  return {
    row_index: row.index,
    table: cleanText(row.cells[0]),
    number: cleanText(row.cells[1]),
    player: ids[0],
    opponent: ids[1],
    player_score: playerScore || undefined,
    opponent_score: opponentScore || undefined,
    format: "id",
  };
}

function isLegacyScoreCell(value: unknown) {
  const text = cleanText(value);
  if (!text) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return true;
  if (/^\d+\s*[-:/]\s*\d+(?:\s*[-:/]\s*\d+)?$/.test(text)) return true;
  return /^(?:ttl\s*score|score)$/i.test(text);
}

function legacyEntry(row: Row) {
  const ids = extractTwIds(row.cells);
  if (ids.length !== 1 || row.cells.length < 4) return null;
  const table = cleanText(row.cells[0]);
  if (!/^\d+$/.test(table)) return null;
  const idIndex = row.cells.findIndex(cell => /tw\d+/i.test(cell));
  if (idIndex < 0) return null;

  const ttlScore = row.cells
    .slice(idIndex + 1)
    .map(scoreText)
    .find(Boolean) || "";

  // 舊版 Master Ball：Round 1 為「ID｜姓名｜對手姓名」，Round 2+ 會插入 TtlScore。
  // 不再依固定欄位位置，改抓 ID 後前兩個非分數文字欄位。
  const nameCells = row.cells
    .slice(idIndex + 1)
    .map(cleanText)
    .filter(Boolean)
    .filter(cell => !isLegacyScoreCell(cell));
  const playerName = cleanText(nameCells[0] || "");
  const opponentName = cleanText(nameCells[1] || "");
  if (!playerName || !opponentName) return null;
  return { row_index: row.index, table, player: ids[0], player_name: playerName, opponent_name: opponentName, ttl_score: ttlScore };
}

function parsePairings(rows: Row[]) {
  const pairings: Pairing[] = [];
  for (const row of rows) {
    const parsed = modernPairing(row);
    if (parsed) pairings.push(parsed);
  }

  const legacy = rows.map(legacyEntry).filter(Boolean) as NonNullable<ReturnType<typeof legacyEntry>>[];
  for (const entry of legacy) {
    const counterpart = legacy.find(other =>
      other.row_index !== entry.row_index &&
      other.table === entry.table &&
      normalize(other.player_name) === normalize(entry.opponent_name)
    );
    if (!counterpart) continue;
    pairings.push({
      row_index: entry.row_index,
      table: entry.table,
      number: "",
      player: entry.player,
      opponent: counterpart.player,
      player_name: entry.player_name,
      opponent_name: entry.opponent_name,
      player_score: entry.ttl_score || undefined,
      opponent_score: counterpart.ttl_score || undefined,
      format: "name",
    });
  }

  const seen = new Set<string>();
  return pairings.filter(item => {
    const key = `${item.row_index}|${normalize(item.player)}|${normalize(item.opponent)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function structuredStanding(row: Row) {
  const rankText = cleanText(row.cells[0]);
  if (!/^\d+$/.test(rankText)) return null;
  const ids = extractTwIds(row.cells);
  if (!ids.length) return null;
  return { row_index: row.index, rank: Number(rankText), player: ids[0] };
}

function findMatch<T extends { player: string }>(items: T[], variants: string[]) {
  let match = items.find(item => variants.includes(normalize(item.player)));
  if (!match) match = items.find(item => variants.some(alias => normalize(item.player).includes(alias)));
  return match || null;
}

function findPairingMatch(items: Pairing[], variants: string[]) {
  const isMatch = (value: string) =>
    variants.includes(normalize(value)) ||
    variants.some(alias => normalize(value).includes(alias));

  const direct = items.find(item => isMatch(item.player));
  if (direct) return {
    ...direct,
    ttl_score: direct.player_score || "",
  };

  const reverse = items.find(item => isMatch(item.opponent));
  if (!reverse) return null;
  return {
    ...reverse,
    player: reverse.opponent,
    opponent: reverse.player,
    player_name: reverse.opponent_name,
    opponent_name: reverse.player_name,
    player_score: reverse.opponent_score,
    opponent_score: reverse.player_score,
    ttl_score: reverse.opponent_score || "",
  };
}

async function searchPairing(tid: string, round: number, aliases: string): Promise<Pairing | null> {
  const variants = aliasVariants(aliases);
  const searchTerm = searchTermFromAliases(aliases);
  const rawTw = variants.find(item => /^tw\d+$/i.test(item)) || "";
  const terms = [...new Set([searchTerm, rawTw].filter(Boolean))];

  for (const term of terms) {
    const rows = await fetchSearchRows(tid, round, term);
    const modern = findPairingMatch(parsePairings(rows), variants);
    if (modern) return { ...modern, format: modern.format === "id" ? "id-search" : modern.format };

    const entries = rows.map(legacyEntry).filter(Boolean) as NonNullable<ReturnType<typeof legacyEntry>>[];
    const playerEntry = entries.find(entry => variants.includes(normalize(entry.player))) ||
      entries.find(entry => rowMatchesAliases([entry.player], variants));
    if (!playerEntry) continue;

    const opponentRows = await fetchSearchRows(tid, round, playerEntry.opponent_name);
    const opponentEntries = opponentRows.map(legacyEntry).filter(Boolean) as NonNullable<ReturnType<typeof legacyEntry>>[];
    const opponentEntry = opponentEntries.find(entry =>
      entry.table === playerEntry.table &&
      normalize(entry.player_name) === normalize(playerEntry.opponent_name) &&
      normalize(entry.opponent_name) === normalize(playerEntry.player_name)
    ) || opponentEntries.find(entry => normalize(entry.player_name) === normalize(playerEntry.opponent_name));

    if (!opponentEntry) continue;
    return {
      row_index: playerEntry.row_index,
      table: playerEntry.table,
      number: "",
      player: playerEntry.player,
      opponent: opponentEntry.player,
      player_name: playerEntry.player_name,
      opponent_name: playerEntry.opponent_name,
      player_score: playerEntry.ttl_score || undefined,
      opponent_score: opponentEntry.ttl_score || undefined,
      ttl_score: playerEntry.ttl_score || "",
      format: "legacy-search",
    };
  }
  return null;
}

async function fetchRound(sourceUrl: URL, aliases: string, sharedPage?: Awaited<ReturnType<typeof fetchHtml>>) {
  const page = sharedPage || await fetchHtml(sourceUrl);
  const pageText = page.pageText;
  const title = page.title;
  const rows = page.rows;
  const unavailable = /対戦表は公開されていません|対戦表.*公開されていません|pairings?.{0,20}not.{0,20}(?:published|available)/i.test(pageText);

  const variants = aliasVariants(aliases);
  const round = Number(sourceUrl.searchParams.get("kno") || 0) || null;
  const znt = sourceUrl.searchParams.get("znt") || "0";
  const tid = sourceUrl.searchParams.get("tid") || "";
  const finalMode = round === 9999999 || znt === "1";
  const matchedRows = variants.length ? rows.filter(row => rowMatchesAliases(row.cells, variants)) : [];

  if (finalMode) {
    const standings = rows.map(structuredStanding).filter(Boolean) as NonNullable<ReturnType<typeof structuredStanding>>[];
    let standingMatch = findMatch(standings, variants);
    if (!standingMatch && aliases && tid && round) {
      const searchRows = await fetchSearchRows(tid, round, searchTermFromAliases(aliases));
      const searchStandings = searchRows.map(structuredStanding).filter(Boolean) as NonNullable<ReturnType<typeof structuredStanding>>[];
      standingMatch = findMatch(searchStandings, variants);
    }
    // TCG Meister now publishes interim standings at kno=<last-round>&znt=1.
    // An interim ranking is visible but must never be reported as official final.
    const isInterim = /\bend\s+of\s+round\s*\d+\s+interim\s+result\b|\binterim\s+(?:standings?|results?)\b/i.test(pageText);
    const isFinal = !isInterim && (round === 9999999 || /\bfinal\s+(?:standings?|results?|rankings?)\b/i.test(pageText));
    const rankStatus = isInterim ? "interim" : (isFinal ? "final" : "unconfirmed");
    return {
      ok: true,
      type: "final_rank",
      rank_status: rankStatus,
      is_interim: isInterim,
      is_final: isFinal,
      source_url: sourceUrl.toString(),
      tid,
      round,
      title,
      available: !unavailable && (standings.length > 0 || Boolean(standingMatch)),
      unavailable,
      standing_count: standings.length,
      standing_match: standingMatch || null,
      checked_at: new Date().toISOString(),
    };
  }

  const pairings = parsePairings(rows);
  let match = findPairingMatch(pairings, variants);
  if (!match && aliases && tid && round) {
    match = await searchPairing(tid, round, aliases);
  }

  return {
    ok: true,
    type: "round",
    source_url: sourceUrl.toString(),
    tid,
    round,
    title,
    available: !unavailable && (pairings.length > 0 || Boolean(match)),
    unavailable,
    pairing_count: pairings.length,
    match: match || null,
    matched_rows: matchedRows,
    checked_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    let source = "";
    let aliases = "";
    let players: string[] = [];
    if (req.method === "GET") {
      const incoming = new URL(req.url);
      source = incoming.searchParams.get("url") || "";
      aliases = incoming.searchParams.get("player") || "";
    } else {
      const body = await req.json().catch(() => ({}));
      source = String(body?.url || "");
      aliases = String(body?.player || body?.aliases || "");
      if (body?.players !== undefined) {
        if (!Array.isArray(body.players) || body.players.length < 1 || body.players.length > 5) throw new Error("請提供 1 至 5 位玩家");
        players = [...new Set<string>(body.players.map((id: unknown) => String(id).trim().toLowerCase()))];
        if (players.length !== body.players.length || players.some(id => !/^tw\d{1,16}$/.test(id))) throw new Error("PTCG ID 格式錯誤或重複");
      }
    }
    if (!source) return json({ ok: false, error: "請提供 Round 配對網址" }, 400);
    const url = validSourceUrl(source);
    if (players.length) {
      const page = await fetchHtml(url);
      const results = await Promise.all(players.map(async player_id => ({
        ...(await fetchRound(url, player_id, page)), player_id
      })));
      return json({...results[0], available:results.some(result=>result.available), results});
    }
    return json(await fetchRound(url, aliases));
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: String((error as Error)?.message || error) }, 400);
  }
});