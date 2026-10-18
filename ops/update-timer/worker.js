// Cloudflare Worker on a cron trigger: starts the repo's "Update results" GitHub workflow every 10 minutes during
// Worlds 2026 (16/10 to 16/11/2026 NZDT). GitHub throttles its own schedules to every 2 to 5 hours; a started
// (workflow_dispatch) run is not throttled. The workflow decides whether anything changed and whether to publish.
// Secret GH_TOKEN: a fine-grained GitHub token with "Actions: read and write" on this one repository only.
const REPO = 'tommihhunter/poroprophet';
const WORKFLOW = 'update.yml';
const START = Date.UTC(2026, 9, 15, 11, 0);   // 16/10/2026 00:00 NZDT
const END = Date.UTC(2026, 10, 16, 11, 0);    // 17/11/2026 00:00 NZDT

async function dispatch(env) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'poroprophet-update-timer',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  return r.status; // 204 = started
}

export default {
  async scheduled(event, env, ctx) {
    const now = Date.now();
    if (now < START || now > END) return;
    ctx.waitUntil(dispatch(env).then((s) => console.log('dispatch', s)));
  },
  // GET / shows whether the timer is inside the event window (no secrets, no dispatch)
  async fetch() {
    const now = Date.now();
    return new Response(`update timer: ${now >= START && now <= END ? 'active' : 'idle'} (every 10 minutes, 16/10 to 16/11/2026 NZDT)\n`);
  },
};
