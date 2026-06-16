// ─── Config ──────────────────────────────────────────────
const CONFIG = {
  owner: 'xZepyx',
  siteRepo: 'zepyx.github.io',
  authRepo: 'tracker',
  authFile: 'auth',
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

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
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

// ─── Auth: PAT-based push verification ──────────────────
// Flow: enter PAT → push to xZepyx/tracker/auth → if push succeeds, admin
// PAT is stored in localStorage only — never sent anywhere except GitHub API

function restoreSession() {
  try {
    const raw = localStorage.getItem('zepyx_token')
    if (!raw) return false
    State.token = raw
    // Verify the token is still valid by checking user
    return validateToken(raw)
  } catch { return false }
}

async function validateToken(token) {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    })
    if (!res.ok) { logout(); return false }
    const user = await res.json()
    if (user.login !== CONFIG.owner) { logout(); return false }
    State.user = user
    State.isAdmin = true
    updateAuthUI()
    return true
  } catch { logout(); return false }
}

async function verifyWithPush(token) {
  // Try to push to xZepyx/tracker/auth to verify write access
  const now = new Date()
  const dateStr = now.toLocaleString('en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const content = `Authorized User Zepyx on ${dateStr}`
  const encoded = btoa(content)

  // First check if file exists to get SHA
  let sha = null
  try {
    const check = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.authRepo}/contents/${CONFIG.authFile}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }
    })
    if (check.ok) {
      const existing = await check.json()
      sha = existing.sha
    }
  } catch {}

  // Push the file
  const body = {
    message: `auth: ${CONFIG.owner} login at ${dateStr}`,
    content: encoded,
  }
  if (sha) body.sha = sha

  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.authRepo}/contents/${CONFIG.authFile}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    // Push succeeded — token has write access
    State.token = token
    localStorage.setItem('zepyx_token', token)
    return await validateToken(token)
  } catch (e) {
    throw new Error(`Push failed: ${e.message}. Make sure the token has write access to ${CONFIG.owner}/${CONFIG.authRepo}.`)
  }
}

function logout() {
  State.user = null
  State.token = null
  State.isAdmin = false
  localStorage.removeItem('zepyx_token')
  updateAuthUI()
}

function updateAuthUI() {
  document.querySelectorAll('#login-btn, #admin-login-btn').forEach(el => {
    if (el) el.textContent = State.isAdmin ? `@${State.user.login}` : 'Login'
  })
  document.querySelectorAll('#admin-link').forEach(el => {
    if (el) el.style.display = State.isAdmin ? 'inline-flex' : 'none'
  })
  const badge = document.getElementById('user-badge')
  if (badge) {
    badge.innerHTML = State.isAdmin
      ? `<img src="${State.user.avatar_url}" alt="" style="width:22px;height:22px;border-radius:50%"> <span style="font-size:0.8rem">${State.user.login}</span> <button onclick="logout()" style="background:none;border:none;color:var(--txt-muted);cursor:pointer;font-size:0.7rem;padding:2px">✕</button>`
      : ''
  }
}

// ─── Blog (GitHub Issues CMS) ───────────────────────────
async function getBlogPosts() {
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.siteRepo}/issues?state=open&sort=created&direction=desc&labels=blog&per_page=50`)
    if (!res.ok) throw new Error('fail')
    const issues = await res.json()
    return issues.filter(i => !i.pull_request)
  } catch { return [] }
}

async function getBlogPost(number) {
  try {
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.siteRepo}/issues/${number}`)
    if (!res.ok) throw new Error('not found')
    const issue = await res.json()
    if (issue.pull_request) return null
    return issue
  } catch { return null }
}

function renderBlogCard(issue) {
  const labelTags = issue.labels
    .filter(l => l.name !== 'blog')
    .map(l => `<span class="tag">${esc(l.name)}</span>`).join('')
  const body = issue.body || ''
  const excerpt = body.replace(/[#*`>\[\]]/g, '').slice(0, 160).trim()
  const date = formatDate(issue.created_at)
  return `
    <a href="/blog/post.html?id=${issue.number}" class="blog-card">
      <div class="blog-card-meta">
        <span>${date}</span>
        ${issue.comments > 0 ? `<span>💬 ${issue.comments}</span>` : ''}
      </div>
      <h3 class="blog-card-title">${esc(issue.title)}</h3>
      <p class="blog-card-excerpt">${esc(excerpt)}</p>
      <div class="blog-card-foot">
        ${labelTags}
        <span class="blog-card-arrow">→</span>
      </div>
    </a>
  `
}

// ─── Markdown ────────────────────────────────────────────
function renderMarkdown(md) {
  if (!md) return ''
  let h = esc(md)
  // code blocks (must come first)
  h = h.replace(/```(\w*)\s*([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${esc(code)}</code></pre>`)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>')
  h = h.replace(/^###### (.+)/gm, '<h6>$1</h6>')
  h = h.replace(/^##### (.+)/gm, '<h5>$1</h5>')
  h = h.replace(/^#### (.+)/gm, '<h4>$1</h4>')
  h = h.replace(/^### (.+)/gm, '<h3>$1</h3>')
  h = h.replace(/^## (.+)/gm, '<h2>$1</h2>')
  h = h.replace(/^# (.+)/gm, '<h1>$1</h1>')
  h = h.replace(/^&gt; (.+)/gm, '<blockquote>$1</blockquote>')
  h = h.replace(/^---+/gm, '<hr>')
  // wrap consecutive list items
  h = h.replace(/((?:^- .+\n?)+)/gm, '<ul>$&</ul>')
  h = h.replace(/^- (.+)/gm, '<li>$1</li>')
  // paragraphs
  h = '<p>' + h.replace(/\n\n/g, '</p><p>') + '</p>'
  h = h.replace(/<p><\/p>/g, '')
  h = h.replace(/<li><\/li>/g, '')
  return h
}

// ─── Discussions ────────────────────────────────────────
async function getDiscussions() {
  try {
    const headers = { Accept: 'application/vnd.github.v3+json' }
    if (State.token) headers.Authorization = `Bearer ${State.token}`
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.siteRepo}/discussions?per_page=20`, { headers })
    if (res.ok) {
      const data = await res.json()
      return { type: 'rest', data }
    }
    return { type: 'error', error: 'Discussions API unavailable. Enable Discussions in repo settings.' }
  } catch (e) {
    return { type: 'error', error: e.message }
  }
}

function renderDiscussionCard(d) {
  const body = (d.bodyText || d.body || '').slice(0, 140)
  const date = formatDate(d.createdAt || d.created_at)
  const comments = d.comments?.totalCount ?? d.comments ?? 0
  const upvotes = d.upvoteCount ?? d.upvote_count ?? 0
  const url = d.url || d.html_url
  const author = d.author?.login || d.user?.login || 'unknown'
  return `
    <a href="${url}" target="_blank" class="disc-card">
      <div class="disc-card-top">
        <span class="disc-card-author">${esc(author)}</span>
        <span class="disc-card-date">${date}</span>
      </div>
      <h4 class="disc-card-title">${esc(d.title)}</h4>
      <p class="disc-card-body">${esc(body)}</p>
      <div class="disc-card-bottom">
        <span class="disc-card-stats">💬 ${comments} · 👍 ${upvotes}</span>
      </div>
    </a>
  `
}

// ─── Animations ──────────────────────────────────────────
function observeAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' })
  document.querySelectorAll('.fade-in, .fade-in-stagger').forEach(el => observer.observe(el))
}

// ─── Init ────────────────────────────────────────────────
function init() {
  restoreSession()

  // Cursor
  const cur = document.getElementById('cursor')
  if (cur) {
    document.addEventListener('mousemove', e => {
      cur.style.left = e.clientX + 'px'
      cur.style.top = e.clientY + 'px'
    })
    document.querySelectorAll('a, button, .blog-card, .disc-card, .project-card, .sub-card').forEach(el => {
      el.addEventListener('mouseenter', () => cur.classList.add('hover'))
      el.addEventListener('mouseleave', () => cur.classList.remove('hover'))
    })
  }

  // Nav scroll
  const nav = document.querySelector('nav')
  if (nav) {
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 80), { passive: true })
  }

  // Hamburger
  const ham = document.querySelector('.hamburger')
  const links = document.querySelector('.nav-links')
  if (ham && links) {
    ham.addEventListener('click', () => links.classList.toggle('open'))
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')))
  }

  // Loader
  const loader = document.getElementById('loader')
  const main = document.getElementById('main-content')
  if (loader && main) {
    setTimeout(() => { loader.classList.add('hidden'); main.classList.add('visible') }, 1000)
  } else if (main) {
    main.classList.add('visible')
  }

  observeAnimations()
  State.ready = true
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
