export const config = { schedule: "@monthly" };

export default async (req) => {
  let nextRun;
  try { nextRun = (await req.json()).next_run; } catch (e) { nextRun = 'inconnu'; }

  console.log(`[refresh-rates] Exécution. Prochaine : ${nextRun}`);

  const BUILD_HOOK_URL = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!BUILD_HOOK_URL) {
    console.warn('[refresh-rates] NETLIFY_BUILD_HOOK_URL manquant — aucune action');
    return new Response(null, { status: 204 });
  }

  try {
    await fetch(BUILD_HOOK_URL, { method: 'POST' });
    console.log('[refresh-rates] Build Hook déclenché');
  } catch (e) {
    console.error('[refresh-rates] Échec Build Hook:', e.message);
  }

  return new Response(null, { status: 204 });
};
