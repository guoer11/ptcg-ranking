import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const corsHeaders = { "Access-Control-Allow-Origin": "https://guoer11.github.io", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();
    const playerId = String(body?.player_id || "").trim().toLowerCase();
    const currentTid = String(body?.current_tid || "").trim();

    if (!endpoint || !/^https:\/\//i.test(endpoint)) throw new Error("invalid endpoint");
    if (!/^tw\d+$/i.test(playerId)) throw new Error("invalid player_id");

    const { data: familyRow, error: familyError } = await service
      .from("family_push_subscriptions")
      .select("owner_user_id")
      .eq("endpoint", endpoint)
      .eq("active", true)
      .maybeSingle();
    if (familyError) throw familyError;

    const ownerUserId = String(familyRow?.owner_user_id || "");
    if(ownerUserId){
      const {data:allowed,error:allowError}=await service.rpc("is_pairing_member",{target_user:ownerUserId});
      if(allowError||allowed!==true)return json({ok:false},403);
      // Legacy owner devices are preserved; guest devices must present their subscription auth key.
      const {data:admin,error:adminError}=await service.rpc("is_pairing_authorized",{target_user:ownerUserId});
      if(adminError)return json({ok:false},403);
      if(admin!==true){
        const auth=String(body?.auth||"");
        if(!auth)return json({ok:false},403);
        const {data:verified,error:verifyError}=await service.from("family_push_subscriptions").select("id").eq("endpoint",endpoint).eq("auth",auth).eq("owner_user_id",ownerUserId).eq("active",true).maybeSingle();
        if(verifyError||!verified)return json({ok:false},403);
      }
    }
    if (!ownerUserId) {
      return json({
        ok: true,
        found: false,
        name: "",
        confirmed_deck: "",
        possible_decks: [],
        previous_deck: "",
        deck: "",
        deck_type: "",
      });
    }

    const namePromise = service
      .from("player_identities")
      .select("real_name")
      .eq("player_id", playerId)
      .maybeSingle();

    const previousPromise = (() => {
      let query = service
        .from("pairing_shared_scouts")
        .select("tid,player_id,deck_name,observed_round,updated_at")
        .eq("conflict",false)
        .eq("player_id", playerId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (currentTid) query = query.neq("tid", currentTid);
      return query;
    })();

    const currentExactPromise = currentTid
      ? service
          .from("pairing_shared_scouts")
          .select("player_id,deck_name,observed_round,updated_at")
          .eq("conflict",false)
          .eq("tid", currentTid)
      : Promise.resolve({ data: [], error: null } as any);

    const currentPairsPromise = currentTid
      ? service
          .from("pairing_shared_pairs")
          .select("player_a_id,player_b_id,deck_a,deck_b,updated_at")
          .eq("conflict",false)
          .eq("tid", currentTid)
      : Promise.resolve({ data: [], error: null } as any);

    const [nameResult, previousResult, currentExactResult, currentPairsResult] = await Promise.all([
      namePromise,
      previousPromise,
      currentExactPromise,
      currentPairsPromise,
    ]);

    if (nameResult.error) throw nameResult.error;
    if (previousResult.error) throw previousResult.error;
    if (currentExactResult.error) throw currentExactResult.error;
    if (currentPairsResult.error) throw currentPairsResult.error;

    const exact = new Map<string, string>();
    for (const row of currentExactResult.data || []) {
      const id = String(row.player_id || "").toLowerCase();
      const deck = String(row.deck_name || "").trim();
      if (id && deck) exact.set(id, deck);
    }

    const confirmedDeck = exact.get(playerId) || "";
    const possible = new Set<string>();

    if (!confirmedDeck) {
      for (const row of currentPairsResult.data || []) {
        const a = String(row.player_a_id || "").toLowerCase();
        const b = String(row.player_b_id || "").toLowerCase();
        if (a !== playerId && b !== playerId) continue;

        const other = a === playerId ? b : a;
        const deckA = String(row.deck_a || "").trim();
        const deckB = String(row.deck_b || "").trim();
        const otherDeck = exact.get(other) || "";

        if (deckA && deckA === deckB) {
          possible.add(deckA);
        } else if (otherDeck && [deckA, deckB].includes(otherDeck)) {
          if (deckA && deckA !== otherDeck) possible.add(deckA);
          if (deckB && deckB !== otherDeck) possible.add(deckB);
        } else {
          if (deckA) possible.add(deckA);
          if (deckB) possible.add(deckB);
        }
      }
    }

    const previousRow = previousResult.data?.[0] || null;
    const previousDeck = String(previousRow?.deck_name || "").trim();
    const possibleDecks = [...possible];
    const bestDeck = confirmedDeck || previousDeck;
    const deckType = confirmedDeck ? "confirmed" : (possibleDecks.length ? "possible" : (previousDeck ? "previous" : ""));

    return json({
      ok: true,
      found: Boolean(confirmedDeck || possibleDecks.length || previousDeck || nameResult.data?.real_name),
      name: String(nameResult.data?.real_name || ""),
      confirmed_deck: confirmedDeck,
      possible_decks: possibleDecks,
      previous_deck: previousDeck,
      deck: bestDeck,
      deck_type: deckType,
      previous_tid: String(previousRow?.tid || ""),
      previous_observed_round: previousRow?.observed_round ?? null,
      previous_updated_at: previousRow?.updated_at || null,
    });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: String((error as Error)?.message || error) }, 400);
  }
});
