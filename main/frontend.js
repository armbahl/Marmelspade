const PAGE_SIZE = 8;
let currentQuery = '';
let currentPage = 1;
let totalHits = 0;

const qInput = document.getElementById('q');
const searchBtn = document.getElementById('searchBtn');
const hitsEl = document.getElementById('hits');
// replace single pagination element with node list
const paginationEls = Array.from(document.querySelectorAll('.pagination'));

async function doSearch(page = 1) {
  if (!currentQuery || currentQuery.trim() === '') {
    hitsEl.innerHTML = '<p>Enter a query and press Search.</p>';
    paginationEls.forEach(el => el.innerHTML = '');
    return;
  }
  currentPage = page;
  hitsEl.innerHTML = '<p>Loading…</p>';
  paginationEls.forEach(el => el.innerHTML = '');

  try {
    const params = new URLSearchParams({
      q: currentQuery,
      page: String(currentPage)
    });
    const resp = await fetch('/search?' + params.toString(), { credentials: 'same-origin' });
    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error:'error'}));
      hitsEl.innerHTML = '<p>Error: ' + (err.error || resp.statusText) + '</p>';
      return;
    }
    const data = await resp.json();
    console.log('search response', data);

    // coerce possible server fields to a numeric total
    totalHits = Number(
      data.nbHits ??
      data.cappedTotal ??
      data.estimatedTotalHits ??
      data.totalHits ??
      data.total ??
      (data.hits ? data.hits.length : 0)
    ) || 0;

    // prefer server-provided pageSize/totalPages if present (coerce to numbers)
    window.__serverPageSize = Number(data.pageSize) || PAGE_SIZE;
    window.__serverTotalPages = Number(data.totalPages) || Math.max(1, Math.ceil(totalHits / window.__serverPageSize));

    renderHits(data.hits || []);
    renderPagination();
  } catch (e) {
    hitsEl.innerHTML = '<p>Network error</p>';
    console.error(e);
  }
}

function renderHits(hits) {
  if (!hits.length) {
    hitsEl.innerHTML = '<p>No results</p>';
    return;
  }
  hitsEl.innerHTML = '';
  for (const h of hits) {
    const div = document.createElement('div');
    div.className = 'hit';
    const img = document.createElement('img');
    img.className = 'thumb';
    if (h.thumbnailUrl) {
      img.src = h.thumbnailUrl;
      img.alt = h.name ?? 'thumbnail';
    } else {
      img.alt = '';
      img.style.background = '#f0f0f0';
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = h.name ?? '(no name)';
    const path = document.createElement('div');
    path.className = 'path';
    path.textContent = h.path ?? '';
    meta.appendChild(name);
    meta.appendChild(path);
    div.appendChild(img);
    div.appendChild(meta);
    hitsEl.appendChild(div);
  }
}

function renderPaginationFor(container) {
  container.innerHTML = '';
  const pageSize = Number(window.__serverPageSize || PAGE_SIZE);
  const totalPages = Number(window.__serverTotalPages || Math.max(1, Math.ceil(totalHits / pageSize)));

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = 'Prev';
  prev.disabled = currentPage <= 1;
  prev.onclick = () => doSearch(currentPage - 1);
  container.appendChild(prev);

  const start = Math.max(1, currentPage - 3);
  const end = Math.min(totalPages, currentPage + 3);

  if (start > 1) {
    const first = pageButton(1);
    container.appendChild(first);
    if (start > 2) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.margin = '0 6px';
      container.appendChild(dots);
    }
  }

  for (let p = start; p <= end; p++) {
    const btn = pageButton(p);
    container.appendChild(btn);
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.margin = '0 6px';
      container.appendChild(dots);
    }
    const last = pageButton(totalPages);
    container.appendChild(last);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = 'Next';
  next.disabled = currentPage >= totalPages;
  next.onclick = () => doSearch(currentPage + 1);
  container.appendChild(next);

  const info = document.createElement('div');
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} / ${totalPages} — ${totalHits} hits (page size ${pageSize})`;
  container.appendChild(info);
}

function renderPagination() {
  // render identical pagination into every pagination container
  paginationEls.forEach(el => renderPaginationFor(el));
}

function pageButton(p) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = String(p);
  if (p === currentPage) {
    btn.disabled = true;
    btn.style.fontWeight = '700';
    btn.style.background = '#eef';
  } else {
    btn.onclick = () => doSearch(p);
  }
  return btn;
}

searchBtn.addEventListener('click', () => {
  currentQuery = qInput.value.trim();
  doSearch(1);
});

qInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    currentQuery = qInput.value.trim();
    doSearch(1);
  }
});

(function initFromQS(){
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if (q) {
    qInput.value = q;
    currentQuery = q;
    doSearch(1);
  } else {
    hitsEl.innerHTML = '<p>Enter a query and press Search.</p>';
  }
})();