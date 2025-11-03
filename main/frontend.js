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
    
    // Placeholder for missing thumbnail
    else {
      img.alt = '';
      img.style.background = '#f0f0f0';
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

    hitsEl.appendChild(div); // Append hit to hits container
  }
}

// Render pagination controls container
function renderPaginationFor(container) {
  container.innerHTML = ''; // Clear previous pagination
  const pageSize = Number(window.__serverPageSize || PAGE_SIZE); // Get page size

  // Calculate total pages
  const totalPages = Number(window.__serverTotalPages || Math.max(1, Math.ceil(totalHits / pageSize)));

  const prev = document.createElement('button'); // Previous button
  prev.className = 'page-btn';
  prev.textContent = 'Prev';
  prev.disabled = currentPage <= 1; // Disable if on first page
  prev.onclick = () => doSearch(currentPage - 1); // Previous page action
  container.appendChild(prev); // Append previous button

  const start = Math.max(1, currentPage - 3);
  const end = Math.min(totalPages, currentPage + 3);

  // First page and leading ellipsis
  if (start > 1) {
    const first = pageButton(1); // First page button
    container.appendChild(first); // Append first page button

    // Ellipsis if needed
    if (start > 2) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.margin = '0 6px';
      container.appendChild(dots);
    }
  }

  // Page number buttons
  for (let p = start; p <= end; p++) {
    const btn = pageButton(p);
    container.appendChild(btn);
  }

  // Last page and trailing ellipsis
  if (end < totalPages) {
    if (end < totalPages - 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.margin = '0 6px';
      container.appendChild(dots);
    }
    const last = pageButton(totalPages); // Last page button
    container.appendChild(last); // Append last page button
  }

  const next = document.createElement('button'); // Next button
  next.className = 'page-btn';
  next.textContent = 'Next';
  next.disabled = currentPage >= totalPages; // Disable if on last page
  next.onclick = () => doSearch(currentPage + 1); // Next page action
  container.appendChild(next); // Append next button

  const info = document.createElement('div'); // Page info element
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} / ${totalPages} — ${totalHits} hits (page size ${pageSize})`;
  container.appendChild(info); // Append info to container
}

// Render pagination into all pagination containers
function renderPagination() {
  paginationEls.forEach(el => renderPaginationFor(el)); // Render for each container
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
  
  // If no 'q', show prompt
  else {
    hitsEl.innerHTML = '<p>Enter a query and press Search.</p>';
  }
})();