/**
 * Residential Proxy Pool — shared across all API clients.
 *
 * Provides round-robin residential proxy rotation using undici's ProxyAgent
 * for HTTP CONNECT tunneling. Bypasses Cloudflare JS challenges and IP blocks
 * that affect server-side fetch() from Vercel/Cloudflare Workers.
 *
 * Used by:
 *   - miruro-direct.ts (bypass CF JS challenge on miruro.tv)
 *   - anidap-api.ts    (bypass IP blocks on anidap.lol)
 *   - Any future API that needs residential IP rotation
 *
 * Strategy: On each 403/429, rotate to the next proxy in the pool.
 * The pool is randomized on module load to distribute load evenly.
 */

// ─── Residential proxy pool (321 non-expiring HTTP proxies) ────────────────
const PROXY_POOL: string[] = [
  "http://tickets:proxyon145@190.123.219.12:12345",
  "http://tickets:proxyon145@23.104.162.39:12345",
  "http://hughmuir2:lisamarie11@us1.cactussstp.com:3129",
  "http://a2019111712:Karlosfm1969@proxy.fcsh.unl.pt:3128",
  "http://yjrdrwwc:tauesbfb@uk3.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@us8.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@us8.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@uk3.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@br1.cactussstp.com:81",
  "http://tickets:proxyon145@23.108.233.92:12345",
  "http://tickets:proxyon145@192.227.238.145:12345",
  "http://hughmuir2:lisamarie11@hk1.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@us9.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@us2.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@in1.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@us1.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@us6.cactussstp.com:8080",
  "http://tickets:proxyon145@23.94.251.13:12345",
  "http://bvmbsmie:shibby2511@us4.cactussstp.com:81",
  "http://tickets:proxyon145@5.157.5.154:12345",
  "http://bvmbsmie:shibby2511@my1.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@us2.cactussstp.com:8080",
  "http://a2021102210:Carolin7@proxy.fcsh.unl.pt:3128",
  "http://yefprelf:dr2gsmab@in1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@us1.cactussstp.com:8080",
  "http://tickets:proxyon145@107.172.42.89:12345",
  "http://uncpjndo:w77Ebc0h2A@au1.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@it1.cactussstp.com:81",
  "http://g10701005:j0i2m2@proxy.ttu.edu.tw:3128",
  "http://yjrdrwwc:tauesbfb@in1.cactussstp.com:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-dal.pvdata.host:8080",
  "http://yjrdrwwc:tauesbfb@us4.cactussstp.com:8080",
  "http://tickets:proxyon145@162.212.170.77:12345",
  "http://yjrdrwwc:tauesbfb@my1.cactussstp.com:81",
  "http://tickets:proxyon145@23.95.239.230:12345",
  "http://tickets:proxyon145@196.247.205.91:12345",
  "http://tickets:proxyon145@107.172.241.122:12345",
  "http://hughmuir2:lisamarie11@de1.cactussstp.com:3129",
  "http://tickets:proxyon145@23.81.230.134:12345",
  "http://tickets:proxyon145@107.150.71.197:12345",
  "http://uncpjndo:w77Ebc0h2A@us9.cactussstp.com:3129",
  "http://a2019124811:dF8DyuEk@proxy.fcsh.unl.pt:3128",
  "http://hughmuir2:lisamarie11@us9.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@in1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@br1.cactussstp.com:8080",
  "http://tickets:proxyon145@107.175.34.7:12345",
  "http://yjrdrwwc:tauesbfb@us6.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@it1.cactussstp.com:81",
  "http://tickets:proxyon145@191.102.165.164:12345",
  "http://yjrdrwwc:tauesbfb@au1.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@au1.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@us2.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@us2.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@us4.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@in1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@us8.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@uk3.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@tw-tai.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-los.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-sea.pvdata.host:8080",
  "http://yjrdrwwc:tauesbfb@hk1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@pt1.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@my1.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@uk3.cactussstp.com:3129",
  "http://yefprelf:dr2gsmab@in1.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@in1.cactussstp.com:81",
  "http://yefprelf:dr2gsmab@hk1.cactussstp.com:8080",
  "http://yefprelf:dr2gsmab@hk1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us1.cactussstp.com:81",
  "http://a48053:JWFX8Ru@proxy.fcsh.unl.pt:3128",
  "http://yjrdrwwc:tauesbfb@hk1.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@us2.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@au1.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ar-bue.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@au-bri.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@pt1.cactussstp.com:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-las.pvdata.host:8080",
  "http://a50865:Braga0102@proxy.fcsh.unl.pt:3128",
  "http://hughmuir2:lisamarie11@my1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@us9.cactussstp.com:8080",
  "http://a2021126337:1123581321fI!@proxy.fcsh.unl.pt:3128",
  "http://bvmbsmie:shibby2511@us6.cactussstp.com:3129",
  "http://tickets:proxyon145@192.227.238.229:12345",
  "http://bvmbsmie:shibby2511@us1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@au1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@it1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@in1.cactussstp.com:8080",
  "http://a59356:GryilAd1@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@181.177.102.240:12345",
  "http://hughmuir2:lisamarie11@uk3.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us9.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@us6.cactussstp.com:81",
  "http://tickets:proxyon145@107.174.150.159:12345",
  "http://a48442:X9erJBv@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@5.157.5.100:12345",
  "http://uncpjndo:w77Ebc0h2A@us4.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@us1.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@ro1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@br1.cactussstp.com:8080",
  "http://tickets:proxyon145@107.175.37.77:12345",
  "http://bvmbsmie:shibby2511@it1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@it1.cactussstp.com:8080",
  "http://tickets:proxyon145@161.0.1.119:12345",
  "http://tickets:proxyon145@192.227.241.115:12345",
  "http://tickets:proxyon145@196.247.205.88:12345",
  "http://yjrdrwwc:tauesbfb@br1.cactussstp.com:81",
  "http://tickets:proxyon145@107.172.170.115:12345",
  "http://hughmuir2:lisamarie11@us2.cactussstp.com:8080",
  "http://tickets:proxyon145@192.227.241.125:12345",
  "http://dissy:ardjani@proxy21.temprina.com:8080",
  "http://yefprelf:dr2gsmab@pt1.cactussstp.com:81",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ca-mon.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@pt1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us2.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@au-per.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@au1.cactussstp.com:81",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-nyc.pvdata.host:8080",
  "http://nngone:Oe2933Oe@uk3.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@us8.cactussstp.com:81",
  "http://hughmuir2:lisamarie11@us4.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@us9.cactussstp.com:81",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@id-jak.pvdata.host:8080",
  "http://uncpjndo:w77Ebc0h2A@us1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us6.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@us6.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@us8.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@us8.cactussstp.com:3129",
  "http://tickets:proxyon145@23.94.251.43:12345",
  "http://hughmuir2:lisamarie11@us8.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-atl.pvdata.host:8080",
  "http://ctp:ctp@proxy21.temprina.com:8080",
  "http://bvmbsmie:shibby2511@hk1.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@pt1.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@br1.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ae-dub.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@us6.cactussstp.com:81",
  "http://nngone:Oe2933Oe@ro1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@hk1.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@au1.cactussstp.com:8080",
  "http://tickets:proxyon145@161.0.1.13:12345",
  "http://uncpjndo:w77Ebc0h2A@us6.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@pt1.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@it1.cactussstp.com:8080",
  "http://a45753:Ctgx3O3@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@107.175.38.146:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@nz-auc.pvdata.host:8080",
  "http://tickets:proxyon145@168.228.46.189:12345",
  "http://uncpjndo:w77Ebc0h2A@it1.cactussstp.com:3129",
  "http://tickets:proxyon145@23.95.97.164:12345",
  "http://a2023138326:GRygt17700_*@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@185.122.170.10:12345",
  "http://tickets:proxyon145@192.227.241.77:12345",
  "http://nngone:Oe2933Oe@in1.cactussstp.com:81",
  "http://tickets:proxyon145@198.46.172.102:12345",
  "http://uncpjndo:w77Ebc0h2A@uk3.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@hk1.cactussstp.com:8080",
  "http://tickets:proxyon145@107.175.81.187:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@au-mel.pvdata.host:8080",
  "http://tickets:proxyon145@172.245.66.116:12345",
  "http://tickets:proxyon145@23.94.4.206:12345",
  "http://tickets:proxyon145@196.196.23.45:12345",
  "http://tickets:proxyon145@196.196.23.136:12345",
  "http://yjrdrwwc:tauesbfb@in1.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@us4.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@uk3.cactussstp.com:8080",
  "http://tickets:proxyon145@192.227.191.162:12345",
  "http://tickets:proxyon145@50.3.137.165:12345",
  "http://U11006234:emcr4908@proxy.ttu.edu.tw:3128",
  "http://yefprelf:dr2gsmab@pt1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@us9.cactussstp.com:3129",
  "http://yjrdrwwc:tauesbfb@us2.cactussstp.com:81",
  "http://tickets:proxyon145@107.174.5.149:12345",
  "http://bvmbsmie:shibby2511@it1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@de1.cactussstp.com:81",
  "http://a51692:Cintia1@proxy.fcsh.unl.pt:3128",
  "http://uncpjndo:w77Ebc0h2A@au1.cactussstp.com:3129",
  "http://tickets:proxyon145@173.234.153.90:12345",
  "http://tickets:proxyon145@192.3.143.46:12345",
  "http://yjrdrwwc:tauesbfb@br1.cactussstp.com:3129",
  "http://tickets:proxyon145@172.245.229.242:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-jer.pvdata.host:8080",
  "http://yjrdrwwc:tauesbfb@in1.cactussstp.com:81",
  "http://g11106012:dne1216@proxy.ttu.edu.tw:3128",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-chi.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@uk3.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@uk3.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@uk3.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us6.cactussstp.com:81",
  "http://jantawan.ban:jantawan.ban@proxy.sru.ac.th:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@my-kua.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@ro1.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@br1.cactussstp.com:81",
  "http://6117701001046:1849901413126@proxy.sru.ac.th:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@pl-tor.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@it1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@it1.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@br1.cactussstp.com:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@jp-tok.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ca-van.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@uk-man.pvdata.host:8080",
  "http://uncpjndo:w77Ebc0h2A@my1.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@us8.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@us9.cactussstp.com:3129",
  "http://tickets:proxyon145@107.173.112.245:12345",
  "http://u10902128:910622@proxy.ttu.edu.tw:3128",
  "http://tickets:proxyon145@103.204.109.189:12345",
  "http://tickets:proxyon145@107.172.229.182:12345",
  "http://price2spy:5HciFCe25W@104.237.245.152:60000",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@hk-china.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@us6.cactussstp.com:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-pho.pvdata.host:8080",
  "http://uncpjndo:w77Ebc0h2A@pt1.cactussstp.com:8080",
  "http://tickets:proxyon145@196.247.205.48:12345",
  "http://a58753:NickeujAg9@proxy.fcsh.unl.pt:3128",
  "http://a17768:X5q1ZZ@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@107.173.112.207:12345",
  "http://a51730:Redondoestrela2@proxy.fcsh.unl.pt:3128",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@rs-bel.pvdata.host:8080",
  "http://tickets:proxyon145@107.175.37.119:12345",
  "http://uncpjndo:w77Ebc0h2A@us1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@my1.cactussstp.com:81",
  "http://hughmuir2:lisamarie11@br1.cactussstp.com:81",
  "http://nngone:Oe2933Oe@us4.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@in1.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@in1.cactussstp.com:8080",
  "http://a52512:Tacuara1998@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@168.228.46.128:12345",
  "http://yjrdrwwc:tauesbfb@it1.cactussstp.com:3129",
  "http://yefprelf:dr2gsmab@pt1.cactussstp.com:8080",
  "http://a2020132564:Leagueoflegends123@proxy.fcsh.unl.pt:3128",
  "http://u11001203:DA0501@proxy.ttu.edu.tw:3128",
  "http://bvmbsmie:shibby2511@au1.cactussstp.com:3129",
  "http://uncpjndo:w77Ebc0h2A@pt1.cactussstp.com:81",
  "http://tickets:proxyon145@107.175.38.13:12345",
  "http://bvmbsmie:shibby2511@us1.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@de1.cactussstp.com:81",
  "http://u11004220:hhh92227@proxy.ttu.edu.tw:3128",
  "http://uncpjndo:w77Ebc0h2A@my1.cactussstp.com:3129",
  "http://p2s_proxy:oazaCentric@quebec.oaza.rs:8899",
  "http://hughmuir2:lisamarie11@in1.cactussstp.com:81",
  "http://yjrdrwwc:tauesbfb@pt1.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@us4.cactussstp.com:81",
  "http://a59369:Donaldtrump1200@proxy.fcsh.unl.pt:3128",
  "http://hughmuir2:lisamarie11@us4.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@lu-lux.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@us6.cactussstp.com:81",
  "http://tickets:proxyon145@107.173.112.211:12345",
  "http://yjrdrwwc:tauesbfb@de1.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@mx-mex.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@us4.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@pt1.cactussstp.com:3129",
  "http://hughmuir2:lisamarie11@us2.cactussstp.com:81",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ro-buk.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@us1.cactussstp.com:81",
  "http://tickets:proxyon145@196.247.205.113:12345",
  "http://yjrdrwwc:tauesbfb@my1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@my1.cactussstp.com:8080",
  "http://yjrdrwwc:tauesbfb@pt1.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@us9.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@us6.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@bg-sof.pvdata.host:8080",
  "http://yjrdrwwc:tauesbfb@pt1.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@in1.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@it1.cactussstp.com:81",
  "http://a2022131572:Portalegre2004@proxy.fcsh.unl.pt:3128",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@se-got.pvdata.host:8080",
  "http://backup:backup@proxy21.temprina.com:8080",
  "http://tickets:proxyon145@104.160.17.116:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@au-syd.pvdata.host:8080",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@ie-dub.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@uk3.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@us2.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@ro1.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@at-wie.pvdata.host:8080",
  "http://hughmuir2:lisamarie11@us8.cactussstp.com:8080",
  "http://uncpjndo:w77Ebc0h2A@my1.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@pt1.cactussstp.com:81",
  "http://uncpjndo:w77Ebc0h2A@us9.cactussstp.com:8080",
  "http://tickets:proxyon145@172.245.62.145:12345",
  "http://tickets:proxyon145@190.123.219.34:12345",
  "http://a45687:Montinho1@proxy.fcsh.unl.pt:3128",
  "http://yjrdrwwc:tauesbfb@us8.cactussstp.com:8080",
  "http://bvmbsmie:shibby2511@us8.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@us4.cactussstp.com:3129",
  "http://tickets:proxyon145@107.172.170.102:12345",
  "http://tickets:proxyon145@196.247.205.228:12345",
  "http://uncpjndo:w77Ebc0h2A@us1.cactussstp.com:3129",
  "http://bvmbsmie:shibby2511@us8.cactussstp.com:8080",
  "http://hughmuir2:lisamarie11@us2.cactussstp.com:3129",
  "http://tickets:proxyon145@50.3.137.177:12345",
  "http://a47995:hVq77tI@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@181.215.16.247:12345",
  "http://yefprelf:dr2gsmab@in1.cactussstp.com:81",
  "http://tickets:proxyon145@162.212.170.252:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@us-mia.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@my1.cactussstp.com:8080",
  "http://tickets:proxyon145@107.173.112.240:12345",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@il-tel.pvdata.host:8080",
  "http://tickets:proxyon145@107.173.112.194:12345",
  "http://a53869:ap06060422NM@proxy.fcsh.unl.pt:3128",
  "http://uncpjndo:w77Ebc0h2A@au1.cactussstp.com:81",
  "http://6217701001049:ohmsin0809@proxy.sru.ac.th:8080",
  "http://hughmuir2:lisamarie11@br1.cactussstp.com:3129",
  "http://tickets:proxyon145@107.150.71.30:12345",
  "http://uncpjndo:w77Ebc0h2A@br1.cactussstp.com:3129",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@pa-pan.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@us1.cactussstp.com:3129",
  "http://a59205:Simpsons98@proxy.fcsh.unl.pt:3128",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@cl-san.pvdata.host:8080",
  "http://bvmbsmie:shibby2511@us9.cactussstp.com:81",
  "http://NFNmXMmY2PEtCktkfKzwhb4C:SAMA_698940@kr-seo.pvdata.host:8080",
  "http://85244:ulr452@200.135.35.13:8080",
  "http://a47420:Limpol05@proxy.fcsh.unl.pt:3128",
  "http://uncpjndo:w77Ebc0h2A@us2.cactussstp.com:81",
  "http://bvmbsmie:shibby2511@br1.cactussstp.com:8080",
  "http://a2020103198:Dglen741@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@198.46.172.86:12345",
  "http://a2023147470:Budape$t1@proxy.fcsh.unl.pt:3128",
  "http://tickets:proxyon145@107.158.118.94:12345",
  "http://tickets:proxyon145@107.175.80.123:12345",
  "http://yjrdrwwc:tauesbfb@us4.cactussstp.com:81",
];

// Shuffle pool on load for even distribution
for (let i = PROXY_POOL.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [PROXY_POOL[i], PROXY_POOL[j]] = [PROXY_POOL[j], PROXY_POOL[i]];
}

// Round-robin index (atomic-ish for serverless)
let _proxyIdx = 0;

/**
 * Get the next proxy URL from the pool (round-robin).
 */
export function getResidentialProxy(): string {
  const proxy = PROXY_POOL[_proxyIdx % PROXY_POOL.length];
  _proxyIdx++;
  return proxy;
}

/**
 * Fetch a URL through a residential proxy from the pool.
 * Uses undici's ProxyAgent for HTTP CONNECT tunneling.
 * Returns the response body as text, or null on failure.
 *
 * Each call rotates to the NEXT proxy in the pool automatically.
 */
export async function residentialProxyFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 6000
): Promise<string | null> {
  const proxy = getResidentialProxy();
  try {
    const undici = await import("undici");
    const agent = new undici.ProxyAgent(proxy);

    const res = await undici.request(url, {
      dispatcher: agent,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.statusCode === 200) {
      return await res.body.text();
    }
    // Non-200 — caller will try next proxy
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a URL trying multiple proxies IN PARALLEL and returning the FIRST
 * successful response.
 *
 * Strategy:
 *   - Fire N proxies at once (default 5)
 *   - First proxy to return a 200 wins; all others are abandoned
 *   - Total latency = fastest proxy, NOT sum of all attempts
 *   - If all fail, returns null
 *
 * This is ~5x faster than sequential attempts when most proxies are working
 * but a few are slow/dead. The old sequential approach waited up to 24s
 * (3 attempts × 8s timeout) if the first proxies were slow.
 */
export async function multiProxyFetch(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 6000,
  maxAttempts = 5
): Promise<string | null> {
  // Limit parallelism to avoid exhausting connection pools
  const parallel = Math.min(maxAttempts, 8);

  const attempts: Promise<string | null>[] = [];
  for (let i = 0; i < parallel; i++) {
    // Each call to residentialProxyFetch rotates to the NEXT proxy automatically
    attempts.push(residentialProxyFetch(url, headers, timeoutMs));
  }

  // Race them — return as soon as ANY one succeeds
  return new Promise<string | null>((resolve) => {
    let remaining = parallel;
    let resolved = false;

    for (const p of attempts) {
      p.then((result) => {
        if (resolved) return;
        if (result) {
          resolved = true;
          resolve(result);
          return;
        }
        remaining--;
        if (remaining === 0) {
          resolve(null);
        }
      }).catch(() => {
        if (resolved) return;
        remaining--;
        if (remaining === 0) {
          resolve(null);
        }
      });
    }
  });
}

/**
 * Get the total number of proxies in the pool.
 */
export function getProxyPoolSize(): number {
  return PROXY_POOL.length;
}
