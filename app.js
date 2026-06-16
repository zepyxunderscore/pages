// ─── Config ──────────────────────────────────────────────
const CONFIG = {
  owner: 'xZepyx',
  repo: 'zepyx.github.io',
  blogRepo: 'xZepyx',
  blogRepoName: 'blog',
  // GitHub OAuth App client ID — replace with your own from https://github.com/settings/developers
  clientId: 'YOUR_GITHUB_OAUTH_CLIENT_ID',
  // Alternative: use a Personal Access Token for admin operations (simpler, no OAuth needed)
  fallbackPat: null, // set to 'ghp_...' if you prefer PAT over OAuth
}

// ─── State ───────────────────────────────────────────────
const State = {
  user: null,
  token: null,
  isAdmin: false,
  ready: false,
}

// ─── Utils ───────────────────────────────────────────────
const $ = (s, p = document) => p.querySelector(s)
const $$ = (s, p = document) => [...p.querySelectorAll(s)]

function html(strings, ...vals) {
  return strings.reduce((r, s, i) => r + s + (vals[i] || ''), '')
}

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

// ─── GitHub API ──────────────────────────────────────────
const GH_API = 'https://api.github.com'

async function ghFetch(path, opts = {}) {
  const headers = { Accept: 'application/vnd.github.v3+json', ...opts.headers }
  if (State.token) headers.Authorization = `Bearer ${State.token}`
  const res = await fetch(`${GH_API}${path}`, { ...opts, headers })
  if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
  return res.json()
}

async function ghFetchAll(path, opts = {}) {
  const items = []
  let page = 1
  while (true) {
    const perPage = 100
    const data = await ghFetch(`${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`, opts)
    items.push(...data)
    if (data.length < perPage) break
    page++
  }
  return items
}

// ─── Auth (GitHub OAuth Device Flow) ────────────────────
async function startDeviceFlow() {
  try {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: CONFIG.clientId, scope: 'repo,user' })
    })
    const data = await res.json()
    if (!data.device_code) throw new Error('Failed to get device code')

    // Show user code
    const codeEl = document.getElementById('device-code')
    const verifyEl = document.getElementById('device-verify')
    const modal = document.getElementById('auth-modal')
    if (codeEl) codeEl.textContent = data.user_code
    if (verifyEl) verifyEl.href = data.verification_uri
    if (modal) modal.classList.add('open')

    // Poll for token
    return await pollForToken(data.device_code, data.interval || 5)
  } catch (e) {
    console.error('Device flow error:', e)
    throw e
  }
}

async function pollForToken(deviceCode, interval) {
  return new Promise((resolve, reject) => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: CONFIG.clientId,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          })
        })
        const data = await res.json()
        if (data.access_token) {
          clearInterval(poll)
          resolve(data.access_token)
        } else if (data.error === 'authorization_pending') {
          // still waiting
        } else if (data.error === 'slow_down') {
          // increase interval
        } else if (data.error === 'expired_token' || data.error === 'access_denied') {
          clearInterval(poll)
          reject(new Error(data.error_description || 'Auth cancelled'))
        }
      } catch (e) {
        // retry
      }
    }, interval * 1000)
  })
}

async function verifyAdmin(token) {
  try {
    const user = await ghFetch('/user', { headers: { Authorization: `Bearer ${token}` } })
    if (user.login === CONFIG.owner) {
      State.user = user
      State.token = token
      State.isAdmin = true
      sessionStorage.setItem('gh_token', token)
      sessionStorage.setItem('gh_user', JSON.stringify(user))
      updateAuthUI()
      return true
    }
    return false
  } catch (e) {
    console.error('Verify admin error:', e)
    return false
  }
}

function checkSession() {
  const token = sessionStorage.getItem('gh_token')
  const userRaw = sessionStorage.getItem('gh_user')
  if (token && userRaw) {
    try {
      const user = JSON.parse(userRaw)
      if (user.login === CONFIG.owner) {
        State.user = user
        State.token = token
        State.isAdmin = true
        updateAuthUI()
      }
    } catch {}
  }
}

function logout() {
  State.user = null
  State.token = null
  State.isAdmin = false
  sessionStorage.removeItem('gh_token')
  sessionStorage.removeItem('gh_user')
  updateAuthUI()
}

function updateAuthUI() {
  const loginBtn = document.getElementById('login-btn')
  const adminLink = document.getElementById('admin-link')
  const userBadge = document.getElementById('user-badge')

  if (State.isAdmin) {
    if (loginBtn) loginBtn.innerHTML = `${State.user.login} ●`
    if (adminLink) adminLink.style.display = 'flex'
    if (userBadge) {
      userBadge.innerHTML = `
        <img src="${State.user.avatar_url}" alt="" style="width:24px;height:24px;border-radius:50%">
        <span>${State.user.login}</span>
        <button onclick="logout()" style="background:none;border:none;color:var(--txt-muted);cursor:pointer;font-size:0.75rem">✕</button>
      `
    }
  } else {
    if (loginBtn) loginBtn.innerHTML = 'Login'
    if (adminLink) adminLink.style.display = 'none'
    if (userBadge) userBadge.innerHTML = ''
  }
}

// ─── Blog (GitHub Issues CMS) ───────────────────────────
async function getBlogPosts() {
  try {
    const issues = await ghFetchAll(`/repos/${CONFIG.blogRepo}/${CONFIG.blogRepoName}/issues?state=open&sort=created&direction=desc`)
    return issues.filter(i => !i.pull_request && i.labels.some(l => l.name === 'blog'))
  } catch {
    // Fallback: try reading from this repo
    try {
      const issues = await ghFetchAll(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues?state=open&sort=created&direction=desc&labels=blog`)
      return issues.filter(i => !i.pull_request)
    } catch {
      return []
    }
  }
}

async function getBlogPost(number) {
  try {
    return await ghFetch(`/repos/${CONFIG.blogRepo}/${CONFIG.blogRepoName}/issues/${number}`)
  } catch {
    try {
      return await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${number}`)
    } catch {
      return null
    }
  }
}

function renderBlogCard(issue) {
  const labelTags = issue.labels
    .filter(l => l.name !== 'blog')
    .map(l => `<span class="tag">${esc(l.name)}</span>`).join('')

  const body = issue.body || ''
  const excerpt = body.replace(/[#*`>\[\]]/g, '').slice(0, 200).trim()

  return html`
    <a href="/blog/post.html?id=${issue.number}" class="blog-card glass">
      <div class="blog-card-header">
        <div class="blog-card-meta">
          <span class="blog-date">${timeAgo(issue.created_at)}</span>
          ${issue.comments > 0 ? html`<span class="blog-comments">💬 ${issue.comments}</span>` : ''}
          ${issue.reactions?.['+1'] ? html`<span class="blog-reactions">👍 ${issue.reactions['+1']}</span>` : ''}
        </div>
        ${labelTags ? html`<div class="blog-tags">${labelTags}</div>` : ''}
      </div>
      <h3 class="blog-card-title">${esc(issue.title)}</h3>
      <p class="blog-card-excerpt">${esc(excerpt)}</p>
      <div class="blog-card-footer">
        <span class="blog-readmore">Read more →</span>
      </div>
    </a>
  `
}

async function renderBlogPost(postEl, post) {
  if (!post) {
    postEl.innerHTML = '<div style="text-align:center;padding:80px 0"><h2>Post not found</h2><a href="/blog/" class="btn btn-ghost" style="margin-top:20px">← Back to blog</a></div>'
    return
  }

  const labelTags = post.labels
    .filter(l => l.name !== 'blog')
    .map(l => `<span class="tag">${esc(l.name)}</span>`).join('')

  // Convert markdown to HTML (simple approach)
  const md = post.body || ''
  const bodyHtml = renderMarkdown(md)

  postEl.innerHTML = html`
    <div class="post-header">
      <a href="/blog/" class="post-back">← Back to blog</a>
      <div class="post-meta">
        <span>${formatDate(post.created_at)}</span>
        ${post.updated_at !== post.created_at ? html`<span class="post-updated">(updated ${formatDate(post.updated_at)})</span>` : ''}
        <span>by ${esc(post.user?.login || 'unknown')}</span>
      </div>
      ${labelTags ? html`<div class="post-tags">${labelTags}</div>` : ''}
      <h1 class="post-title">${esc(post.title)}</h1>
    </div>
    <div class="post-body">${bodyHtml}</div>
    <div class="post-reactions">
      <h3>Reactions</h3>
      <div class="reaction-bar">
        ${['👍','👎','😄','🎉','❤️','🚀','👀'].map(r => {
          const key = { '👍':'+1', '👎':'-1', '😄':'laugh', '🎉':'hooray', '❤️':'heart', '🚀':'rocket', '👀':'eyes' }[r]
          const count = post.reactions?.[key] || 0
          return html`<button class="reaction-btn" data-reaction="${key}">${r} <span>${count}</span></button>`
        }).join('')}
      </div>
      <p style="color:var(--txt-muted);font-size:0.85rem;margin-top:8px">${post.reactions?.total_count || 0} total · <a href="${post.html_url}" target="_blank">React on GitHub</a></p>
    </div>
    <div class="post-comments">
      <h3>Comments (${post.comments})</h3>
      <div id="giscus-comments"></div>
    </div>
  `

  // Add giscus
  loadGiscus(post.html_url)
}

function renderMarkdown(md) {
  if (!md) return ''
  let html = esc(md) // escape first, then re-markup
    .replace(/&gt;/g, '>') // undo escape on blockquotes

  // Code blocks
  html = html.replace(/```(\w*)\s*([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${esc(code)}</code></pre>`
  })
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Headings
  html = html.replace(/^###### (.+)/gm, '<h6>$1</h6>')
  html = html.replace(/^##### (.+)/gm, '<h5>$1</h5>')
  html = html.replace(/^#### (.+)/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)/gm, '<h1>$1</h1>')
  // Blockquotes
  html = html.replace(/^&gt; (.+)/gm, '<blockquote>$1</blockquote>')
  // Horizontal rules
  html = html.replace(/^---+/gm, '<hr>')
  // Lists
  html = html.replace(/^- (.+)/gm, '<li>$1</li>')
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = '<p>' + html + '</p>'

  // Clean up nesting
  html = html.replace(/<li><\/li>/g, '')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  return html
}

function loadGiscus(issueUrl) {
  const container = document.getElementById('giscus-comments')
  if (!container) return

  container.innerHTML = ''
  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.setAttribute('data-repo', `${CONFIG.owner}/${CONFIG.repo}`)
  script.setAttribute('data-repo-id', '')
  script.setAttribute('data-category', 'Announcements')
  script.setAttribute('data-category-id', '')
  script.setAttribute('data-mapping', 'specific')
  script.setAttribute('data-term', issueUrl)
  script.setAttribute('data-strict', '0')
  script.setAttribute('data-reactions-enabled', '1')
  script.setAttribute('data-emit-metadata', '0')
  script.setAttribute('data-input-position', 'top')
  script.setAttribute('data-theme', 'dark')
  script.setAttribute('data-lang', 'en')
  script.setAttribute('crossorigin', 'anonymous')
  script.async = true
  container.appendChild(script)
}

// ─── Community (Discussions) ────────────────────────────
async function getDiscussions() {
  try {
    const data = await ghFetch(`/repos/${CONFIG.owner}/${CONFIG.repo}/discussions?per_page=20`)
    return data || []
  } catch {
    return []
  }
}

function renderDiscussionCard(d) {
  const answers = d.answers || 0
  const comments = d.comments || 0
  const labels = (d.labels || []).map(l => `<span class="tag">${esc(l.name)}</span>`).join('')

  return html`
    <a href="${d.html_url}" target="_blank" class="disc-card glass">
      <div class="disc-card-header">
        <span class="disc-author">${esc(d.user?.login || 'unknown')}</span>
        <span class="disc-date">${timeAgo(d.created_at)}</span>
      </div>
      <h4 class="disc-title">${esc(d.title)}</h4>
      <p class="disc-body">${esc((d.body || '').replace(/[#*`>]/g, '').slice(0, 150))}</p>
      <div class="disc-card-footer">
        <span>💬 ${comments} comments</span>
        ${answers > 0 ? html`<span class="disc-answered">✅ ${answers} answers</span>` : ''}
        <span class="disc-upvotes">👍 ${d.upvote_count || 0}</span>
      </div>
    </a>
  `
}

// ─── Init ────────────────────────────────────────────────
function init() {
  checkSession()

  // Cursor
  const cur = document.getElementById('cursor')
  const fol = document.getElementById('cursor-follower')
  if (cur && fol) {
    document.addEventListener('mousemove', e => {
      cur.style.left = e.clientX + 'px'
      cur.style.top = e.clientY + 'px'
      setTimeout(() => {
        fol.style.left = (e.clientX - 16) + 'px'
        fol.style.top = (e.clientY - 16) + 'px'
      }, 50)
    })
  }

  // Nav scroll
  const nav = document.querySelector('nav')
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50)
    })
  }

  // Hamburger
  const ham = document.querySelector('.hamburger')
  const links = document.querySelector('.nav-links')
  if (ham && links) {
    ham.addEventListener('click', () => links.classList.toggle('open'))
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'))
    })
  }

  // Login button
  const loginBtn = document.getElementById('login-btn')
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      if (State.isAdmin) {
        logout()
        return
      }
      try {
        loginBtn.textContent = 'Connecting...'
        const token = await startDeviceFlow()
        const verified = await verifyAdmin(token)
        if (!verified) {
          alert('Access denied. Only the admin can log in.')
          logout()
        }
      } catch (e) {
        alert('Authentication failed: ' + e.message)
        loginBtn.textContent = 'Login'
      }
    })
  }

  // Close auth modal
  const closeModal = document.getElementById('close-auth-modal')
  if (closeModal) {
    closeModal.addEventListener('click', () => {
      document.getElementById('auth-modal')?.classList.remove('open')
    })
  }

  // Loader
  const loader = document.getElementById('loader')
  const main = document.getElementById('main-content')
  if (loader && main) {
    setTimeout(() => {
      loader.classList.add('hidden')
      main.classList.add('visible')
    }, 2000)
  } else if (main) {
    main.classList.add('visible')
  }

  State.ready = true
}

// ─── Fire ────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
