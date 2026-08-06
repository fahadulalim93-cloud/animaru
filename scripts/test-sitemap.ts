import sitemap from '../src/app/sitemap';

async function main() {
  const entries = await sitemap();
  console.log('Total sitemap entries:', entries.length);
  console.log('Anime entries:', entries.filter(e => e.url.includes('/anime/')).length);
  console.log('Watch entries:', entries.filter(e => e.url.includes('/watch/')).length);
  console.log('Genre entries:', entries.filter(e => e.url.includes('/genre/')).length);
  console.log('Dub entries:', entries.filter(e => e.url.includes('/dub/')).length);
  console.log('Year entries:', entries.filter(e => e.url.includes('/year/')).length);
  console.log('Season entries:', entries.filter(e => e.url.includes('/season/')).length);
  console.log('\nFirst 5:', entries.slice(0, 5).map(e => e.url));
  console.log('Last 5:', entries.slice(-5).map(e => e.url));
}

main().catch(console.error);
