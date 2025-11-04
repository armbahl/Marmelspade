const PAGE_SIZE = 8;
let currentQuery = '';
let currentPage = 1;
let totalHits = 0;

const qInput = document.getElementById('q'); // Search query input
const searchBtn = document.getElementById('searchBtn'); // Search button
const hitsEl = document.getElementById('hits'); // Container for search results
const paginationEls = Array.from(document.querySelectorAll('.pagination')); // Pagination containers

// Perform search and update UI
async function doSearch(page = 1) {
  // If no query, clear results and return
  if (!currentQuery || currentQuery.trim() === '') {
    hitsEl.innerHTML = '<p>Enter a query and press Search.</p>';
    paginationEls.forEach(el => el.innerHTML = '');
    return;
  }

  currentPage = page; // Update current page
  hitsEl.innerHTML = '<p>Loading…</p>'; // Show loading message
  paginationEls.forEach(el => el.innerHTML = ''); // Clear pagination

  try {
    // Build query parameters
    const params = new URLSearchParams({
      q: currentQuery,
      page: String(currentPage)
    });

    // Fetch search results from server
    const resp = await fetch('/search?' + params.toString(), { credentials: 'same-origin' });

    // Handle non-OK responses
    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error:'error'}));
      hitsEl.innerHTML = '<p>Error: ' + (err.error || resp.statusText) + '</p>';
      return;
    }

    const data = await resp.json(); // Parse JSON response
    console.log('search response', data); // Debug log

    // Determine total hits from various possible fields
    totalHits = Number(
      data.nbHits ??
      data.cappedTotal ??
      data.estimatedTotalHits ??
      data.totalHits ??
      data.total ??
      (data.hits ? data.hits.length : 0)
    ) || 0;

    window.__serverPageSize = Number(data.pageSize) || PAGE_SIZE; // Store page size globally

    // Store total pages globally
    window.__serverTotalPages = Number(data.totalPages) || Math.max(1, Math.ceil(totalHits / window.__serverPageSize));

    renderHits(data.hits || []); // Render search hits
    renderPagination(); // Render pagination controls
  }
  
  // Error handling
  catch (e) {
    hitsEl.innerHTML = '<p>Network error</p>';
    console.error(e);
  }
}

// Render search hits into the hits container
function renderHits(hits) {
  // Clear previous results
  if (!hits.length) {
    hitsEl.innerHTML = '<p>No results</p>';
    return;
  }

  hitsEl.innerHTML = ''; // Clear previous results

  // Render each hit
  for (const h of hits) {
    const div = document.createElement('div');
    div.className = 'hit';
    const img = document.createElement('img');
    img.className = 'thumb';

    // Set thumbnail or placeholder
    if (h.thumbnailUrl) {
      img.src = h.thumbnailUrl;
      img.alt = h.name ?? 'thumbnail';
    }
    
    else {
      img.alt = '';
      img.style.background = '#000000';
    }

    const meta = document.createElement('div'); // Meta element
    meta.className = 'meta'; // Metadata container

    const name = document.createElement('div'); // Name element
    name.className = 'name'; // Name container
    name.textContent = h.name ?? '(no name)'; // Set name or placeholder

    const path = document.createElement('div'); // Path element
    path.className = 'path'; // Path container
    path.textContent = h.path ?? ''; // Set path or empty

    meta.appendChild(name); // Append name to meta
    meta.appendChild(path); // Append path to meta

    div.appendChild(img); // Append thumbnail to hit
    div.appendChild(meta); // Append meta to hit

    // Copy Button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy resdb';
    btn.setAttribute('aria-label', 'Copy resdb link');

    // Copy button click handler
    btn.addEventListener('click', async () => {
      const text = h.assetUri ?? h.thumbnailUri ?? h.thumbnailUrl ?? '';
      if (!text) return;
      try {
        // Use Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        }
        
        // Fallback method
        else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        const prev = btn.textContent;
        btn.textContent = 'Copied';
        btn.disabled = true;

        setTimeout(() => {
          btn.textContent = prev;
          btn.disabled = false;
        }, 1500);
      }
      
      // Error handling
      catch (err) {
        console.error('copy failed', err);
      }
    });

    div.appendChild(btn); // Append copy button
    hitsEl.appendChild(div); // Append hit to hits container
  }
}

// Render pagination controls container
function renderPaginationFor(container) {
  container.innerHTML = '';
  const pageSize = Number(window.__serverPageSize || PAGE_SIZE);
  const totalPages = Number(window.__serverTotalPages || Math.max(1, Math.ceil(totalHits / pageSize)));

  // First page button
  const first = document.createElement('button');
  first.className = 'page-btn';
  first.textContent = '<<';
  first.disabled = currentPage <= 1;
  first.onclick = () => doSearch(1);
  container.appendChild(first);

  // Prev button
  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '<';
  prev.disabled = currentPage <= 1;
  prev.onclick = () => doSearch(currentPage - 1);
  container.appendChild(prev);

  // Page number buttons
  const windowSize = 3;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - windowSize + 1);
  }

  // Render only the windowed numeric buttons
  for (let p = start; p <= end; p++) {
    const btn = pageButton(p);
    container.appendChild(btn);
  }

  // Next button
  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '>';
  next.disabled = currentPage >= totalPages;
  next.onclick = () => doSearch(currentPage + 1);
  container.appendChild(next);

  // Last page button
  const last = document.createElement('button');
  last.className = 'page-btn';
  last.textContent = '>>';
  last.disabled = currentPage >= totalPages;
  last.onclick = () => doSearch(totalPages);
  container.appendChild(last);

  // Page info
  const info = document.createElement('div');
  info.className = 'page-info';
  info.textContent = `${totalPages} pages || ${totalHits} results`;
  container.appendChild(info);
}

function renderPagination() {
  // Render identical pagination into every pagination container
  paginationEls.forEach(el => renderPaginationFor(el));
}

// Create a page button element
function pageButton(p) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.textContent = String(p);

  // Disable button for current page
  if (p === currentPage) {
    btn.disabled = true;
    btn.style.fontWeight = '700';
    btn.style.background = '#eef';
  }
  
  // Set onclick for other pages
  else {
    btn.onclick = () => doSearch(p);
  }

  return btn;
}

// Event listeners for search
searchBtn.addEventListener('click', () => {
  currentQuery = qInput.value.trim();
  doSearch(1);
});

// Trigger search on Enter key
qInput.addEventListener('keydown', (e) => {
  // If Enter key pressed
  if (e.key === 'Enter') {
    currentQuery = qInput.value.trim();
    doSearch(1);
  }
});

// Initialize from query string if present
(function initFromQS(){
  const params = new URLSearchParams(location.search); // Get query params
  const q = params.get('q'); // Get 'q' parameter

  // If 'q' exists, set input and perform search
  if (q) {
    qInput.value = q;
    currentQuery = q;
    doSearch(1);
  }
})();