// 🔧 설정값: 소유자/리포/브랜치
const GITHUB_OWNER = "imt-log";        // ← 깃허브 사용자/조직 이름
const LOG_REPO     = "imt-log";     // ← 발행 산출물 리포
const PAGES_LIMIT  = 50;            // 최대 페이지만큼 가져오지 않고, UI에서 limit로 절단
const PER_PAGE     = 30;            // GitHub API 한 페이지 리스팅 수

// (선택) 토큰 사용 시 아래에 입력하면 비로그인 레이트리밋(60/h) 회피 가능 (공개 리포면 보통 불필요)
// const GITHUB_TOKEN = "ghp_...";

// 간단 캐시 (세션)
const cacheKey = (limit, filter, q) => `releases:${limit}:${filter}:${q || ""}`;
const ss = window.sessionStorage;

async function fetchAllReleases() {
  const headers = { "Accept": "application/vnd.github+json" };
  // if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;

  let releases = [];
  for (let page = 1; page <= Math.ceil(PAGES_LIMIT / PER_PAGE); page++) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${LOG_REPO}/releases?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers });
    if (res.status === 403) document.getElementById("rateHint").hidden = false;
    if (!res.ok) break;
    const data = await res.json();
    releases = releases.concat(data);
    if (data.length < PER_PAGE) break; // 더 없음
  }
  return releases;
}

function extTag(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".html")) return "HTML";
  if (lower.endsWith(".pdf"))  return "PDF";
  if (lower.endsWith(".docx")) return "DOCX";
  if (lower.endsWith(".webp")) return "WEBP";
  return "FILE";
}

function matchFilter(asset, filterExt, query) {
  const name = asset.name || "";
  const hitExt = !filterExt || name.toLowerCase().endsWith(filterExt);
  const hitQ = !query || name.toLowerCase().includes(query.toLowerCase());
  return hitExt && hitQ;
}

function humanDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function renderReleases(all, limit, filterExt, query) {
  const $list = document.getElementById("releaseList");
  const $empty = document.getElementById("empty");
  $list.innerHTML = "";

  // 최신 → 오래된 순
  const releases = all.slice(0, limit);

  let countCards = 0;
  for (const rel of releases) {
    // 자산 필터 + 검색
    const assets = (rel.assets || []).filter(a => matchFilter(a, filterExt, query));
    const title = rel.name || rel.tag_name || "(no title)";
    const time  = humanDate(rel.published_at || rel.created_at);
    const tag   = rel.tag_name;
    const url   = rel.html_url;

    // 카드
    const card = document.createElement("div");
    card.className = "card";

    // 헤더
    const h3 = document.createElement("h3");
    h3.textContent = title;
    card.appendChild(h3);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `태그: <code>${tag}</code> · 발행: ${time} · <a href="${url}" target="_blank" rel="noreferrer">Release 열기</a>`;
    card.appendChild(meta);

    // 에셋
    const assetsBox = document.createElement("div");
    assetsBox.className = "assets";

    // (검색/필터 결과가 없어도 대표 3종은 보여주기 위해 fallback 링크 구성)
    let any = false;
    for (const a of assets) {
      any = true;
      const link = document.createElement("a");
      link.href = a.browser_download_url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.className = "asset";
      link.textContent = `${extTag(a.name)} · ${a.name}`;
      assetsBox.appendChild(link);
    }

    // fallback: 확장자별 대표 에셋 우선 표시
    if (!any && rel.assets && rel.assets.length) {
      const priority = [".html", ".pdf", ".docx", ".webp"];
      for (const ext of priority) {
        const a = rel.assets.find(x => x.name && x.name.toLowerCase().endsWith(ext));
        if (a) {
          const link = document.createElement("a");
          link.href = a.browser_download_url;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.className = "asset";
          link.textContent = `${extTag(a.name)} · ${a.name}`;
          assetsBox.appendChild(link);
        }
      }
    }

    card.appendChild(assetsBox);

    // TAGS: 파일 확장자 집계
    const tags = document.createElement("div");
    tags.className = "tags";
    const exts = new Set((rel.assets || []).map(a => (a.name || "").split(".").pop()?.toUpperCase()));
    exts.forEach(e => { if (!e) return; const t = document.createElement("span"); t.className="tag"; t.textContent = e; tags.appendChild(t); });
    card.appendChild(tags);

    $list.appendChild(card);
    countCards++;
  }

  $empty.hidden = countCards > 0;
}

async function bootstrap() {
  const $search = document.getElementById("search");
  const $filter = document.getElementById("assetFilter");
  const $limit  = document.getElementById("limit");
  const $reload = document.getElementById("reload");

  async function loadAndRender(force=false) {
    const limit = parseInt($limit.value, 10) || 20;
    const filterExt = ($filter.value || "").toLowerCase();
    const q = $search.value.trim();
    const key = cacheKey(limit, filterExt, q);

    if (!force) {
      const cached = ss.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          renderReleases(parsed.all, parsed.limit, parsed.filterExt, parsed.q);
          return;
        } catch {}
      }
    }

    const all = await fetchAllReleases();
    renderReleases(all, limit, filterExt, q);
    ss.setItem(key, JSON.stringify({ all, limit, filterExt, q }));
  }

  // 이벤트
  $search.addEventListener("input", () => loadAndRender(true));
  $filter.addEventListener("change", () => loadAndRender(true));
  $limit.addEventListener("change", () => loadAndRender(true));
  $reload.addEventListener("click", () => { ss.clear(); loadAndRender(true); });

  // 최초 로드
  loadAndRender();
}

// ⚠️ 리포 소유자명 바꾸기
document.addEventListener("DOMContentLoaded", () => {
  // 헤더 버튼 링크의 USER 자리도 교체
  document.querySelectorAll('a[href*="github.com/imt-log/imt-onpager"]').forEach(a => {
    a.href = a.href.replace("USER", GITHUB_OWNER);
  });
  bootstrap();
});
