const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const now = Date.now();
    const DAY = 86400000;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const paths = ['home', 'anime', 'watch', 'search', 'manga', 'movies', 'tv', 'live', 'schedule', 'profile', 'bookmarks'];
    const refs = ['google.com', 'direct', 't.co', 'reddit.com', 'bing.com', 'youtube.com', 'discord.gg'];

    const ops = [];
    let totalViews = 0;
    let totalSessions = 0;
    let totalSignups = 0;

    // Daily views and sessions for last 14 days
    for (let d = 13; d >= 0; d--) {
      const dayStr = new Date(today.getTime() - d * DAY).toISOString().slice(0, 10);
      const views = 50 + Math.floor(Math.random() * 200);
      const sessions = 15 + Math.floor(Math.random() * 60);
      totalViews += views;
      totalSessions += sessions;

      ops.push(p.kvStore.upsert({ where: { key: 'a:v:' + dayStr }, update: { value: String(views) }, create: { key: 'a:v:' + dayStr, value: String(views) } }));
      ops.push(p.kvStore.upsert({ where: { key: 'a:s:' + dayStr }, update: { value: String(sessions) }, create: { key: 'a:s:' + dayStr, value: String(sessions) } }));

      if (Math.random() > 0.4) {
        const signups = 1 + Math.floor(Math.random() * 4);
        totalSignups += signups;
        ops.push(p.kvStore.upsert({ where: { key: 'a:signups:' + dayStr }, update: { value: String(signups) }, create: { key: 'a:signups:' + dayStr, value: String(signups) } }));
      }
    }

    // Total counts
    ops.push(p.kvStore.upsert({ where: { key: 'a:v:total' }, update: { value: String(totalViews) }, create: { key: 'a:v:total', value: String(totalViews) } }));
    ops.push(p.kvStore.upsert({ where: { key: 'a:s:total' }, update: { value: String(totalSessions) }, create: { key: 'a:s:total', value: String(totalSessions) } }));
    ops.push(p.kvStore.upsert({ where: { key: 'a:signups:total' }, update: { value: String(totalSignups) }, create: { key: 'a:signups:total', value: String(totalSignups) } }));

    // Path distribution
    const pathCounts = { home: 450, anime: 380, watch: 320, search: 210, manga: 150, movies: 120, tv: 90, live: 75, schedule: 60, profile: 45, bookmarks: 30 };
    for (const [path, count] of Object.entries(pathCounts)) {
      ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:paths', field: path } }, update: { value: String(count) }, create: { hash: 'a:paths', field: path, value: String(count) } }));
    }

    // Referrers
    const refCounts = { 'google.com': 320, 'direct': 280, 't.co': 95, 'reddit.com': 72, 'bing.com': 45, 'youtube.com': 38, 'discord.gg': 22 };
    for (const [ref, count] of Object.entries(refCounts)) {
      ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:refs', field: ref } }, update: { value: String(count) }, create: { hash: 'a:refs', field: ref, value: String(count) } }));
    }

    // Countries
    const countryCounts = { 'US': 380, 'BD': 210, 'IN': 145, 'GB': 82, 'DE': 55, 'CA': 48, 'PH': 35, 'BR': 28, 'AU': 22, 'JP': 18 };
    for (const [code, count] of Object.entries(countryCounts)) {
      ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:countries', field: code } }, update: { value: String(count) }, create: { hash: 'a:countries', field: code, value: String(count) } }));
    }

    // Devices
    ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:devices', field: 'Desktop' } }, update: { value: '680' }, create: { hash: 'a:devices', field: 'Desktop', value: '680' } }));
    ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:devices', field: 'Mobile' } }, update: { value: '290' }, create: { hash: 'a:devices', field: 'Mobile', value: '290' } }));
    ops.push(p.kvHash.upsert({ where: { hash_field: { hash: 'a:devices', field: 'Tablet' } }, update: { value: '30' }, create: { hash: 'a:devices', field: 'Tablet', value: '30' } }));

    // Unique visitors (HLL) - batch insert
    for (let i = 1; i <= 847; i++) {
      try { await p.kvHll.create({ data: { key: 'a:uniq', member: 'v_' + i } }); } catch {}
    }

    // Online users (3 currently online)
    const nowMs = Date.now();
    for (const v of ['v_42', 'v_128', 'v_501']) {
      ops.push(p.kvSortedSet.upsert({ where: { key_member: { key: 'a:online', member: v } }, update: { score: nowMs }, create: { key: 'a:online', member: v, score: nowMs } }));
    }

    await Promise.all(ops);
    console.log('✓ Seeded analytics data successfully!');
    console.log('  Total views:', totalViews);
    console.log('  Total sessions:', totalSessions);
    console.log('  Total signups:', totalSignups);
    console.log('  Unique visitors: 847');
    console.log('  Online now: 3');

    // Verify
    const kvCount = await p.kvStore.count();
    const hashCount = await p.kvHash.count();
    const hllCount = await p.kvHll.count();
    const ssCount = await p.kvSortedSet.count();
    console.log('  KV rows:', kvCount, '| Hash rows:', hashCount, '| HLL rows:', hllCount, '| SortedSet rows:', ssCount);
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  } finally {
    await p.$disconnect();
  }
})();
