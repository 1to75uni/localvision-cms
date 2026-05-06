import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard,
  Store,
  Monitor,
  UploadCloud,
  ListVideo,
  Settings,
  Plus,
  Copy,
  Wifi,
  WifiOff,
  PlayCircle,
  Image,
  Film,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Download,
  Database,
  RotateCcw,
  Save,
  Tv,
  Eye,
  Camera,
  Send,
  Clock3,
  FileText,
  ArrowUp,
  ArrowDown,
  PauseCircle,
  EyeOff,
} from 'lucide-react'

const STORAGE_KEY = 'localvision-cms-v1-6'
const PLAYER_BASE = 'https://localvision-player.pages.dev'
const API_BASE = 'https://localvision-cms.pages.dev'
const AUTH_STORAGE_KEY = 'localvision-cms-auth-v1-6'
const ADMIN_PASSWORD = '0213'
const CMS_VERSION_LABEL = 'CMS Console v1.6'
const DEVICE_ONLINE_TTL_MS = 10 * 60 * 1000
const OLD_PLAYER_BASES = [
  'https://localvision-media-ujb-player.pages.dev',
  'https://player-8kv.pages.dev',
  'https://localvision-for-sosang-ujb.pages.dev',
]

const OLD_API_BASES = [
  'https://odd-glitter-4464localvision-api-ujb.1to75uni.workers.dev',
  'https://localvision-api.kiklekidz.workers.dev',
]


const sampleStores = [
  {
    id: 'st_001',
    name: '굽네치킨 고산점',
    slug: 'goobne',
    category: '치킨 / 음식점',
    address: '의정부시 고산동',
    contact: '010-0000-0000',
    status: '운영중',
    plan: 'Local Basic',
    createdAt: '2026-05-02',
  },
  {
    id: 'st_002',
    name: '샛별플라워',
    slug: 'sbflower',
    category: '꽃집',
    address: '의정부시 민락동',
    contact: '010-0000-0000',
    status: '준비중',
    plan: 'Local Basic',
    createdAt: '2026-05-02',
  },
  {
    id: 'st_003',
    name: '아름드리 카페',
    slug: 'areumcafe',
    category: '카페',
    address: '의정부시 금오동',
    contact: '010-0000-0000',
    status: '운영중',
    plan: 'Public Board',
    createdAt: '2026-05-02',
  },
]

const sampleContents = [
  {
    id: 'ct_001',
    store: 'goobne',
    side: 'left',
    type: 'video',
    title: '대표메뉴 치킨 영상',
    duration: 20,
    status: '사용중',
    fileName: 'left_1.mp4',
    updatedAt: '2026-05-02',
  },
  {
    id: 'ct_002',
    store: 'goobne',
    side: 'left',
    type: 'image',
    title: '점심세트 메뉴판',
    duration: 10,
    status: '사용중',
    fileName: 'left_2.jpg',
    updatedAt: '2026-05-02',
  },
  {
    id: 'ct_003',
    store: '_common',
    side: 'right',
    type: 'image',
    title: '의정부 지역소식 카드',
    duration: 12,
    status: '사용중',
    fileName: 'right_1.jpg',
    updatedAt: '2026-05-01',
  },
  {
    id: 'ct_004',
    store: '_common',
    side: 'right',
    type: 'video',
    title: 'LocalVision 공통 홍보',
    duration: 15,
    status: '사용중',
    fileName: 'right_2.mp4',
    updatedAt: '2026-05-01',
  },
]

const sampleDevices = [
  {
    id: 'tv_goobne',
    store: 'goobne',
    name: '굽네치킨 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '방금 전',
    app: 'Player Web v1.6',
    deviceCode: 'LV-GOOBNE-01',
  },
  {
    id: 'tv_sbflower',
    store: 'sbflower',
    name: '샛별플라워 TV 1',
    role: 'tv',
    online: false,
    lastSeen: '37분 전',
    app: 'Fully Kiosk',
    deviceCode: 'LV-SBFLOWER-01',
  },
  {
    id: 'tv_areumcafe',
    store: 'areumcafe',
    name: '아름드리 카페 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '1분 전',
    app: 'Android TV App v8.2',
    deviceCode: 'LV-AREUM-01',
  },
]


const sampleNotices = [
  {
    id: 'nt_001',
    store: 'goobne',
    title: '오늘 영업시간 안내',
    type: 'text',
    message: '오늘은 내부 사정으로 오후 9시에 영업을 종료합니다.',
    mediaUrl: '',
    linkUrl: '',
    fileName: '',
    startAt: '',
    endAt: '',
    displayMode: 'fullscreen',
    priority: 'normal',
    durationSec: 15,
    repeatMode: 'always',
    isActive: false,
    updatedAt: '2026-05-03',
  },
]

const initialData = {
  stores: sampleStores,
  contents: sampleContents,
  notices: sampleNotices,
  devices: sampleDevices,
  settings: {
    playerBase: PLAYER_BASE,
    apiBase: API_BASE,
    restart: '09:30',
    restartMode: 'reload',
    restartJitterSec: '0',
    cacheMax: '20',
    noticePollMs: '15000',
  },
}

const tabs = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'stores', label: '업체 관리', icon: Store },
  { id: 'contents', label: '콘텐츠 관리', icon: UploadCloud },
  { id: 'notices', label: '전체화면 공지', icon: FileText },
  { id: 'playlist', label: '플레이리스트', icon: ListVideo },
  { id: 'devices', label: '단말기 상태', icon: Monitor },
  { id: 'settings', label: '설정/백업', icon: Settings },
]

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function parseLastSeenTime(value) {
  const raw = String(value || '').trim()
  if (!raw || raw.includes('아직') || raw.includes('오프라인')) return 0
  if (raw.includes('방금')) return Date.now()

  const secondAgo = raw.match(/(\d+)\s*초\s*전/)
  if (secondAgo) return Date.now() - Number(secondAgo[1]) * 1000

  const minuteAgo = raw.match(/(\d+)\s*분\s*전/)
  if (minuteAgo) return Date.now() - Number(minuteAgo[1]) * 60 * 1000

  const hourAgo = raw.match(/(\d+)\s*시간\s*전/)
  if (hourAgo) return Date.now() - Number(hourAgo[1]) * 60 * 60 * 1000

  const ko = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (ko) {
    let hour = Number(ko[5])
    const ampm = ko[4]
    if (ampm === '오후' && hour < 12) hour += 12
    if (ampm === '오전' && hour === 12) hour = 0
    return new Date(Number(ko[1]), Number(ko[2]) - 1, Number(ko[3]), hour, Number(ko[6]), Number(ko[7] || 0)).getTime()
  }

  const sql = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (sql) {
    return new Date(`${sql[1]}-${sql[2]}-${sql[3]}T${sql[4]}:${sql[5]}:${sql[6] || '00'}`).getTime()
  }

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

function isDeviceOnline(device) {
  const lastSeenTime = parseLastSeenTime(device?.lastSeen)
  if (!lastSeenTime) return false
  return Date.now() - lastSeenTime <= DEVICE_ONLINE_TTL_MS
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`
}

function cleanSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(' ', '-')
    .replace(/[^a-z0-9-_]/g, '')
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialData
    const parsed = JSON.parse(raw)
    const parsedSettings = parsed.settings || {}
    const nextSettings = { ...initialData.settings, ...parsedSettings }

    if (!nextSettings.playerBase || OLD_PLAYER_BASES.includes(nextSettings.playerBase)) {
      nextSettings.playerBase = PLAYER_BASE
    }

    if (!nextSettings.apiBase || OLD_API_BASES.includes(nextSettings.apiBase)) {
      nextSettings.apiBase = API_BASE
    }

    return {
      stores: Array.isArray(parsed.stores) ? parsed.stores : sampleStores,
      contents: Array.isArray(parsed.contents) ? parsed.contents : sampleContents,
      notices: Array.isArray(parsed.notices) ? parsed.notices : sampleNotices,
      devices: Array.isArray(parsed.devices) ? parsed.devices : sampleDevices,
      settings: nextSettings,
    }
  } catch {
    return initialData
  }
}

function makePlayerUrl(slug, settings) {
  const params = new URLSearchParams({
    store: slug,
    apiBase: settings.apiBase,
    refresh: '3600000',
    heartbeat: '180000',
    commandPoll: '15000',
    restart: settings.restart,
    restartMode: settings.restartMode,
    restartJitterSec: settings.restartJitterSec,
    cacheMax: settings.cacheMax || '20',
    noticePollMs: settings.noticePollMs || '15000',
    bundleMode: 'cache',
    cacheAll: '1',
    videoMode: 'cache',
    cacheVia: 'api',
    activateWhenCached: '1',
    fit: 'cover',
    appCore: '1',
    appVersion: 'v8.2-store-based-final',
  })

  return `${settings.playerBase}/?${params.toString()}`
}

function deviceDataKey(device) {
  return device?.store || device?.id || ''
}

function getOrigin() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

function makePlaylistApiUrl(slug, side) {
  return `${getOrigin()}/api/playlist?store=${encodeURIComponent(slug)}&side=${encodeURIComponent(side)}`
}

function makePlayerConfigUrl(slug) {
  return `${getOrigin()}/api/player-config?store=${encodeURIComponent(slug)}`
}

function StatCard({ label, value, helper, tone = 'blue' }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </div>
  )
}

function SectionTitle({ title, desc, action }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  )
}

function StatusBadge({ status }) {
  const active = status === '운영중' || status === '사용중'
  return <span className={`badge ${active ? 'success' : 'muted'}`}>{status}</span>
}

function App() {
  const [isAuthed, setIsAuthed] = useState(() => {
    try { return localStorage.getItem(AUTH_STORAGE_KEY) === 'ok' } catch { return false }
  })
  const [passwordInput, setPasswordInput] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [data, setData] = useState(loadData)
  const [selectedStore, setSelectedStore] = useState(data.stores[0]?.slug || 'goobne')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [nowTick, setNowTick] = useState(0)
  const [contentTab, setContentTab] = useState('left')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [screenshots, setScreenshots] = useState({})
  const [playerErrors, setPlayerErrors] = useState({})
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false)
  const [serverStatus, setServerStatus] = useState('checking')

  const [newStore, setNewStore] = useState({
    name: '',
    slug: '',
    category: '',
    address: '',
    contact: '',
  })

  const [newContent, setNewContent] = useState({
    title: '',
    side: 'left',
    type: 'image',
    duration: 10,
    fileName: '',
  })
  const [uploadFile, setUploadFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  const [newNotice, setNewNotice] = useState({
    title: '',
    type: 'image',
    message: '',
    linkUrl: '',
    mediaUrl: '',
    startAt: '',
    endAt: '',
    priority: 'normal',
    durationSec: 15,
    isActive: true,
  })
  const [noticeFile, setNoticeFile] = useState(null)
  const [isNoticeUploading, setIsNoticeUploading] = useState(false)

  const [newDevice, setNewDevice] = useState({
    name: '',
    store: selectedStore,
    app: 'Player Web v1.6',
    deviceCode: '',
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    loadServerData(false)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick((value) => value + 1)
      loadServerData(false)
    }, 30000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setNewDevice((prev) => ({ ...prev, store: selectedStore }))
  }, [selectedStore])

  useEffect(() => {
    if (selectedDeviceId) {
      const device = data.devices.find((item) => item.id === selectedDeviceId || item.store === selectedDeviceId)
      if (device) {
        loadLatestScreenshot(device)
        loadPlayerErrors(device)
      }
    }
  }, [selectedDeviceId])

  function showToast(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleAdminLogin(event) {
    event?.preventDefault()
    if (passwordInput.trim() === ADMIN_PASSWORD) {
      try { localStorage.setItem(AUTH_STORAGE_KEY, 'ok') } catch {}
      setIsAuthed(true)
      setPasswordInput('')
      return
    }
    setPasswordInput('')
    showToast('비밀번호가 맞지 않습니다.')
  }

  const { stores, contents, notices = [], devices, settings } = data
  const currentStore = stores.find((store) => store.slug === selectedStore) || stores[0]

  const filteredStores = stores.filter((store) => {
    const target = `${store.name} ${store.slug} ${store.category} ${store.address}`.toLowerCase()
    return target.includes(search.toLowerCase())
  })

  const summary = useMemo(() => {
    const online = devices.filter((device) => isDeviceOnline(device)).length
    const left = contents.filter((content) => content.side === 'left').length
    const right = contents.filter((content) => content.side === 'right').length
    const activeNotices = notices.filter((notice) => notice.isActive).length

    return {
      stores: stores.length,
      devices: devices.length,
      online,
      offline: devices.length - online,
      left,
      right,
      activeNotices,
    }
  }, [stores, devices, contents, notices, nowTick])

  const leftContents = contents
    .filter((content) => content.side === 'left' && content.store === selectedStore)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const rightContents = contents
    .filter((content) => content.side === 'right')
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
  const contentManageContents = contentTab === 'left' ? leftContents : rightContents
  const storeNotices = notices
    .filter((notice) => notice.store === selectedStore || notice.store === '_all')
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  const activeNotice = storeNotices.find((notice) => notice.isActive)
  const offlineDevices = devices.filter((device) => !isDeviceOnline(device))

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) || devices[0]
  const selectedDeviceKey = selectedDevice ? deviceDataKey(selectedDevice) : ''
  const selectedScreenshot = selectedDeviceKey ? screenshots[selectedDeviceKey] : null
  const selectedPlayerErrors = selectedDeviceKey ? (playerErrors[selectedDeviceKey] || []) : []
  const selectedDeviceStore = stores.find((store) => store.slug === selectedDevice?.store)
  const selectedDeviceLeftContents = contents.filter(
    (content) => content.side === 'left' && content.store === selectedDevice?.store
  )
  const selectedDeviceRightContents = contents.filter((content) => content.side === 'right')
  const currentLeftContent = selectedDeviceLeftContents[0]
  const currentRightContent = selectedDeviceRightContents[0]

  async function apiRequest(path, options = {}) {
    const isFormData = options.body instanceof FormData
    const response = await fetch(path, {
      ...options,
      headers: isFormData
        ? (options.headers || {})
        : {
            'content-type': 'application/json',
            ...(options.headers || {}),
          },
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `API error: ${response.status}`)
    }

    return payload
  }

  async function loadServerData(showMessage = true) {
    try {
      const payload = await apiRequest('/api/backup')
      setData((prev) => ({
        ...prev,
        stores: Array.isArray(payload.stores) ? payload.stores : prev.stores,
        contents: Array.isArray(payload.contents) ? payload.contents : prev.contents,
        notices: Array.isArray(payload.notices) ? payload.notices : prev.notices,
        devices: Array.isArray(payload.devices) ? payload.devices : prev.devices,
      }))
      setServerStatus('connected')
      if (showMessage) showToast('D1 서버 데이터를 불러왔습니다.')
    } catch (error) {
      setServerStatus('local')
      if (showMessage) showToast('서버 연결 전입니다. 브라우저 샘플/로컬 저장 모드로 유지됩니다.')
    }
  }

  function sendToServer(path, options = {}) {
    apiRequest(path, options)
      .then(() => setServerStatus('connected'))
      .catch(() => setServerStatus('local'))
  }

  function updateData(patch) {
    setData((prev) => ({ ...prev, ...patch }))
  }

  function contentDurationText(content) {
    if (content.type === 'video') return '영상 길이대로 재생'
    return `재생 ${content.duration || 10}초`
  }

  function getContentLocation(content) {
    return content.side === 'right'
      ? 'stores/_common/right'
      : `stores/${content.store}/left`
  }

  function buildContentPreview(content) {
    if (content?.url) return content.url
    return ''
  }

  function handleToggleContentStatus(id) {
    const target = contents.find((content) => content.id === id)
    if (!target) return

    const nextStatus = target.status === '사용중' ? '중지' : '사용중'
    const updated = { ...target, status: nextStatus }

    updateData({
      contents: contents.map((content) => (content.id === id ? updated : content)),
    })

    sendToServer('/api/contents', {
      method: 'POST',
      body: JSON.stringify(updated),
    })

    showToast(`콘텐츠가 ${nextStatus} 상태로 변경되었습니다.`)
  }

  function handleMoveContent(id, direction) {
    const target = contents.find((content) => content.id === id)
    if (!target) return

    const group = contents
      .filter((content) =>
        target.side === 'right'
          ? content.side === 'right'
          : content.side === 'left' && content.store === target.store
      )
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))

    const index = group.findIndex((content) => content.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= group.length) return

    const a = group[index]
    const b = group[swapIndex]
    const aOrder = Number(a.sortOrder || index + 1)
    const bOrder = Number(b.sortOrder || swapIndex + 1)

    const updatedA = { ...a, sortOrder: bOrder }
    const updatedB = { ...b, sortOrder: aOrder }

    const nextContents = contents.map((content) => {
      if (content.id === updatedA.id) return updatedA
      if (content.id === updatedB.id) return updatedB
      return content
    })

    updateData({ contents: nextContents })
    sendToServer('/api/contents', { method: 'POST', body: JSON.stringify(updatedA) })
    sendToServer('/api/contents', { method: 'POST', body: JSON.stringify(updatedB) })
    showToast('콘텐츠 순서를 변경했습니다.')
  }

  function handleAddStore() {
    if (!newStore.name.trim() || !newStore.slug.trim()) {
      alert('업체명과 store 코드는 꼭 입력해주세요.')
      return
    }

    const slug = cleanSlug(newStore.slug)

    if (!slug) {
      alert('store 코드는 영어 소문자, 숫자, - 만 사용할 수 있습니다.')
      return
    }

    if (stores.some((store) => store.slug === slug)) {
      alert('이미 사용 중인 store 코드입니다.')
      return
    }

    const nextStore = {
      id: makeId('st'),
      name: newStore.name.trim(),
      slug,
      category: newStore.category.trim() || '미분류',
      address: newStore.address.trim() || '주소 미입력',
      contact: newStore.contact.trim() || '연락처 미입력',
      status: '준비중',
      plan: 'Local Basic',
      createdAt: getToday(),
    }

    const nextDevice = {
      id: `tv_${slug}`,
      store: slug,
      name: `${nextStore.name} TV 1`,
      role: 'tv',
      online: false,
      lastSeen: '아직 접속 없음',
      app: 'Player Web v1.6',
      deviceCode: `LV-${slug.toUpperCase()}-01`,
    }

    updateData({
      stores: [nextStore, ...stores],
      devices: [nextDevice, ...devices],
    })

    sendToServer('/api/stores', {
      method: 'POST',
      body: JSON.stringify(nextStore),
    })
    sendToServer('/api/devices', {
      method: 'POST',
      body: JSON.stringify(nextDevice),
    })

    setSelectedStore(slug)
    setNewStore({ name: '', slug: '', category: '', address: '', contact: '' })
    showToast('업체와 기본 TV 단말기가 저장되었습니다.')
  }

  function handleDeleteStore(slug) {
    if (slug === '_common') return
    if (!confirm('이 업체와 연결된 좌측 콘텐츠/단말기 샘플을 삭제할까요?')) return

    const nextStores = stores.filter((store) => store.slug !== slug)
    const nextContents = contents.filter((content) => content.store !== slug)
    const nextDevices = devices.filter((device) => device.store !== slug)

    updateData({
      stores: nextStores,
      contents: nextContents,
      devices: nextDevices,
    })

    sendToServer(`/api/stores?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    })

    setSelectedStore(nextStores[0]?.slug || '')
    showToast('업체가 삭제되었습니다.')
  }

  async function handleAddContent() {
    if (!newContent.title.trim()) {
      alert('콘텐츠 제목을 입력해주세요.')
      return
    }

    const side = newContent.side
    const store = side === 'right' ? '_common' : selectedStore

    if (uploadFile) {
      try {
        setIsUploading(true)
        const form = new FormData()
        form.append('file', uploadFile)
        form.append('title', newContent.title.trim())
        form.append('side', side)
        form.append('store', selectedStore)
        form.append('duration', newContent.type === 'video' ? '0' : String(Number(newContent.duration) || 10))

        const payload = await apiRequest('/api/upload', {
          method: 'POST',
          body: form,
          headers: {},
        })

        updateData({ contents: [payload.content, ...contents] })
        setServerStatus('connected')
        setNewContent({ title: '', side: 'left', type: 'image', duration: 10, fileName: '' })
        setUploadFile(null)
        showToast('R2 업로드와 D1 저장이 완료되었습니다.')
        return
      } catch (error) {
        console.error(error)
        setServerStatus('local')
        alert(`업로드 실패: ${error.message}`)
      } finally {
        setIsUploading(false)
      }

      return
    }

    const fileName =
      newContent.fileName.trim() ||
      `${side}_${contents.filter((item) => item.side === side && item.store === store).length + 1}.${newContent.type === 'video' ? 'mp4' : 'jpg'}`

    const nextContent = {
      id: makeId('ct'),
      store,
      side,
      type: newContent.type,
      title: newContent.title.trim(),
      duration: newContent.type === 'video' ? 0 : (Number(newContent.duration) || 10),
      status: '사용중',
      fileName,
      url: '',
      sortOrder: contents.filter((item) => item.side === side && item.store === store).length + 1,
      updatedAt: getToday(),
    }

    updateData({ contents: [nextContent, ...contents] })
    sendToServer('/api/contents', {
      method: 'POST',
      body: JSON.stringify(nextContent),
    })
    setNewContent({ title: '', side: 'left', type: 'image', duration: 10, fileName: '' })
    setUploadFile(null)
    showToast('콘텐츠 정보가 저장되었습니다.')
  }

  function handleDeleteContent(id) {
    const target = contents.find((content) => content.id === id)
    if (!target) return

    if (!confirm(`정말 삭제하시겠습니까?\n\n${target.title}\n이 콘텐츠는 TV 재생목록에서 제거됩니다.`)) {
      return
    }

    updateData({ contents: contents.filter((content) => content.id !== id) })
    sendToServer(`/api/contents?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    showToast('콘텐츠가 삭제되었습니다.')
  }


  async function handleAddNotice() {
    if (!selectedStore) {
      alert('공지 송출 업체를 선택해주세요.')
      return
    }
    if (!newNotice.title.trim()) {
      alert('공지 제목을 입력해주세요.')
      return
    }
    if ((newNotice.type === 'image' || newNotice.type === 'video') && !noticeFile && !newNotice.mediaUrl.trim()) {
      alert('이미지/영상 공지는 파일 업로드 또는 미디어 URL이 필요합니다.')
      return
    }
    if (newNotice.type === 'link' && !newNotice.linkUrl.trim()) {
      alert('링크 공지는 링크 URL을 입력해주세요.')
      return
    }

    let uploaded = null
    if (noticeFile) {
      try {
        setIsNoticeUploading(true)
        const form = new FormData()
        form.append('file', noticeFile)
        form.append('store', selectedStore)
        uploaded = await apiRequest('/api/notice-upload', { method: 'POST', body: form, headers: {} })
      } catch (error) {
        alert(`공지 파일 업로드 실패: ${error.message}`)
        setIsNoticeUploading(false)
        return
      }
    }

    const notice = {
      id: makeId('nt'),
      store: selectedStore,
      title: newNotice.title.trim(),
      type: uploaded?.type || newNotice.type,
      message: newNotice.message.trim(),
      mediaUrl: uploaded?.url || newNotice.mediaUrl.trim(),
      linkUrl: newNotice.linkUrl.trim(),
      fileName: uploaded?.fileName || '',
      startAt: newNotice.startAt,
      endAt: newNotice.endAt,
      displayMode: 'fullscreen',
      priority: newNotice.priority,
      durationSec: Number(newNotice.durationSec) || 15,
      repeatMode: 'always',
      isActive: Boolean(newNotice.isActive),
      updatedAt: new Date().toISOString(),
    }

    updateData({ notices: [notice, ...notices.filter((item) => item.id !== notice.id)] })
    sendToServer('/api/notices', { method: 'POST', body: JSON.stringify(notice) })
    setNewNotice({ title: '', type: 'image', message: '', linkUrl: '', mediaUrl: '', startAt: '', endAt: '', priority: 'normal', durationSec: 15, isActive: true })
    setNoticeFile(null)
    setIsNoticeUploading(false)
    showToast('전체화면 공지가 저장되었습니다.')
  }

  function handleToggleNotice(id) {
    const target = notices.find((notice) => notice.id === id)
    if (!target) return
    const updated = { ...target, isActive: !target.isActive, updatedAt: new Date().toISOString() }
    updateData({ notices: notices.map((notice) => (notice.id === id ? updated : notice)) })
    sendToServer('/api/notices', { method: 'POST', body: JSON.stringify(updated) })
  }

  function handleDeleteNotice(id) {
    const target = notices.find((notice) => notice.id === id)
    if (!target) return
    if (!confirm(`공지 삭제\n\n${target.title}\n정말 삭제하시겠습니까?`)) return
    updateData({ notices: notices.filter((notice) => notice.id !== id) })
    sendToServer(`/api/notices?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    showToast('공지가 삭제되었습니다.')
  }

  function handleAddDevice() {
    if (!newDevice.name.trim()) {
      alert('단말기 이름을 입력해주세요.')
      return
    }

    const nextDevice = {
      id: `tv_${newDevice.store}`,
      store: newDevice.store,
      name: newDevice.name.trim(),
      role: 'tv',
      online: false,
      lastSeen: '아직 접속 없음',
      app: newDevice.app,
      deviceCode: newDevice.deviceCode.trim() || `LV-${newDevice.store.toUpperCase()}-${devices.length + 1}`,
    }

    updateData({ devices: [nextDevice, ...devices] })
    sendToServer('/api/devices', {
      method: 'POST',
      body: JSON.stringify(nextDevice),
    })
    setNewDevice({ name: '', store: selectedStore, app: 'Player Web v1.6', deviceCode: '' })
    showToast('단말기가 저장되었습니다.')
  }

  function toggleDeviceOnline(id) {
    const target = devices.find((device) => device.id === id)
    if (!target) return

    const currentlyOnline = isDeviceOnline(target)
    const updated = {
      ...target,
      online: !currentlyOnline,
      lastSeen: !currentlyOnline ? new Date().toLocaleString('ko-KR') : '오프라인 전환',
    }

    updateData({
      devices: devices.map((device) => (device.id === id ? updated : device)),
    })

    sendToServer('/api/devices', {
      method: 'PATCH',
      body: JSON.stringify({
        store: target.store,
        online: updated.online,
        lastSeen: updated.lastSeen,
      }),
    })
  }

  async function sendDeviceCommand(target, command) {
    const targetDevice = typeof target === 'object'
      ? target
      : devices.find((device) => device.id === target || device.store === target)

    const targetStore = targetDevice?.store || String(target || '').trim()
    if (!targetStore) throw new Error('store 코드가 없습니다.')

    const now = new Date().toISOString()

    updateData({
      devices: devices.map((device) =>
        device.store === targetStore
          ? {
              ...device,
              lastCommand: command,
              commandAt: now,
            }
          : device
      ),
    })

    await apiRequest('/api/devices', {
      method: 'PATCH',
      body: JSON.stringify({
        store: targetStore,
        lastCommand: command,
        commandAt: now,
      }),
    })

    setServerStatus('connected')
    return now
  }

  async function handleRemoteRefresh(device) {
    try {
      await sendDeviceCommand(device, 'refresh')
      showToast('TV 새로고침 요청을 보냈습니다. 앱이 명령을 확인하면 화면을 다시 불러옵니다.')
    } catch (error) {
      showToast(`새로고침 요청 실패: ${error.message}`)
    }
  }

  async function handleRequestScreenshot() {
    if (!selectedDevice) return

    try {
      setIsScreenshotLoading(true)
      await sendDeviceCommand(selectedDevice, 'screenshot')
      showToast('TV 현재화면 캡처 요청을 보냈습니다. 10~20초 후 이미지가 갱신됩니다.')

      window.setTimeout(() => loadLatestScreenshot(selectedDevice), 12000)
      window.setTimeout(() => loadLatestScreenshot(selectedDevice), 22000)
    } catch (error) {
      showToast(`스크린샷 요청 실패: ${error.message}`)
      setIsScreenshotLoading(false)
    }
  }

  async function loadLatestScreenshot(target = selectedDevice) {
    const device = typeof target === 'object'
      ? target
      : devices.find((item) => item.id === target || item.store === target)
    const store = device?.store || String(target || '').trim()
    if (!store) return
    const key = store

    try {
      const payload = await apiRequest(`/api/screenshots?store=${encodeURIComponent(store)}`)
      setScreenshots((prev) => ({
        ...prev,
        [key]: payload.screenshot,
      }))
      setServerStatus('connected')
    } catch (error) {
      setServerStatus('local')
    } finally {
      setIsScreenshotLoading(false)
    }
  }

  async function loadPlayerErrors(target = selectedDevice) {
    const device = typeof target === 'object'
      ? target
      : devices.find((item) => item.id === target || item.store === target)
    const store = device?.store || String(target || '').trim()
    if (!store) return
    const key = store

    try {
      const payload = await apiRequest(`/api/player-errors?store=${encodeURIComponent(store)}&limit=20`)
      setPlayerErrors((prev) => ({
        ...prev,
        [key]: Array.isArray(payload.errors) ? payload.errors : [],
      }))
      setServerStatus('connected')
    } catch (error) {
      setPlayerErrors((prev) => ({ ...prev, [key]: [] }))
      setServerStatus('local')
    }
  }

  async function clearPlayerErrors(target = selectedDevice) {
    const device = typeof target === 'object'
      ? target
      : devices.find((item) => item.id === target || item.store === target)
    const store = device?.store || String(target || '').trim()
    if (!store) return
    const key = store

    try {
      await apiRequest(`/api/player-errors?store=${encodeURIComponent(store)}`, { method: 'DELETE' })
      setPlayerErrors((prev) => ({ ...prev, [key]: [] }))
      showToast('오류 로그를 정리했습니다.')
    } catch (error) {
      showToast('오류 로그 정리에 실패했습니다.')
    }
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(' ')
    let line = ''

    words.forEach((word) => {
      const testLine = `${line}${word} `
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, y)
        line = `${word} `
        y += lineHeight
      } else {
        line = testLine
      }
    })

    ctx.fillText(line, x, y)
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text)
    showToast('복사되었습니다.')
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `localvision-cms-backup-${getToday()}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('백업 파일을 다운로드했습니다.')
  }

  function handleResetSample() {
    if (!confirm('현재 브라우저에 저장된 CMS 데이터를 샘플 데이터로 초기화할까요?')) return
    setData(initialData)
    setSelectedStore(initialData.stores[0].slug)
    showToast('샘플 데이터로 초기화되었습니다.')
  }

  function handleUpdateSetting(key, value) {
    updateData({
      settings: {
        ...settings,
        [key]: value,
      },
    })
  }

  function handleResetTvUrlSettings() {
    updateData({
      settings: {
        ...settings,
        apiBase: API_BASE,
        playerBase: PLAYER_BASE,
      },
    })
    showToast('TV 설치용 URL 설정을 최신 주소로 변경했습니다.')
  }

  if (!isAuthed) {
    return (
      <div className="login-shell">
        {toast && <div className="toast">{toast}</div>}
        <form className="login-card" onSubmit={handleAdminLogin}>
          <div className="brand-mark login-mark">LV</div>
          <p className="eyebrow">LocalVision CMS v1.6</p>
          <h1>관리자 비밀번호 입력</h1>
          <p>실전 운영 CMS입니다. 비밀번호를 입력하면 업체·콘텐츠·TV 상태 관리 화면으로 이동합니다.</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="비밀번호 0213"
            value={passwordInput}
            onChange={(event) => setPasswordInput(event.target.value)}
          />
          <button className="primary-btn" type="submit">CMS 시작하기</button>
          <span className="login-helper">APP v8.2 · Player v1.6 · Store Heartbeat</span>
        </form>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LV</div>
          <div>
            <strong>LocalVision</strong>
            <span>CMS Console v1.6</span>
          </div>
        </div>

        <nav>
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="side-note">
          <p>현재 단계</p>
          <strong>Store Heartbeat v1.6</strong>
          <span>Player v1.6 store heartbeat</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">LocalVision CMS v1.6</p>
            <h1>업체 · 콘텐츠 · TV 상태를 한 화면에서 관리</h1>
          </div>
          <div className="top-actions">
            <span className={`server-chip ${serverStatus}`}>
              {serverStatus === 'connected' ? 'D1 서버 연결됨' : serverStatus === 'checking' ? '서버 확인중' : '브라우저 샘플/로컬 저장 모드'}
            </span>
            <button className="ghost-btn" onClick={() => loadServerData(true)}>
              <RefreshCw size={16} />
              서버 데이터 새로고침
            </button>
            <a className="primary-btn" href={makePlayerUrl(selectedStore, settings)} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              TV 화면 미리보기
            </a>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <section className="page">
            <SectionTitle
              title="대시보드"
              desc="로컬비전 운영 현황을 빠르게 확인하는 첫 화면입니다."
            />

            <div className="notice-card">
              <Database size={20} />
              <div>
                <strong>v1.6에서 store 기준 하트비트/명령/캡처/오류 로그를 TV 설치용 URL에 통일했습니다.</strong>
                <p>TV 설치용 URL에는 deviceId를 붙이지 않고, heartbeat=180000 / ONLINE_TTL_SEC=600 기준으로 운영합니다.</p>
              </div>
            </div>

            <div className="stats-grid">
              <StatCard label="전체 업체" value={summary.stores} helper="등록된 매장 수" />
              <StatCard label="전체 TV" value={summary.devices} helper="관리 중인 단말기" tone="purple" />
              <StatCard label="온라인" value={summary.online} helper="정상 접속 중" tone="green" />
              <StatCard label="오프라인" value={summary.offline} helper="확인 필요" tone="orange" />
            </div>

            <div className="dashboard-grid">
              <div className="panel">
                <h3>오늘의 운영 체크</h3>
                <div className="check-list">
                  <div><CheckCircle2 size={18} /> 업체 생성 후 서버/브라우저 저장</div>
                  <div><CheckCircle2 size={18} /> 콘텐츠 업로드 및 R2 저장</div>
                  <div><CheckCircle2 size={18} /> TV 단말기 상태 확인</div>
                  <div><CheckCircle2 size={18} /> JSON 백업 다운로드 지원</div>
                </div>
              </div>

              <div className="panel">
                <h3>현재 선택 업체</h3>
                <div className="selected-store">
                  <strong>{currentStore?.name}</strong>
                  <span>{currentStore?.category}</span>
                  <code>{currentStore?.slug}</code>
                  <button onClick={() => handleCopy(makePlayerUrl(currentStore?.slug, settings))}>
                    <Copy size={15} />
                    TV 설치용 URL 복사
                  </button>
                </div>
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="panel">
                <h3>오프라인 TV 확인</h3>
                {offlineDevices.length === 0 && <p className="empty-text">현재 오프라인 TV가 없습니다.</p>}
                {offlineDevices.map((device) => {
                  const store = stores.find((item) => item.slug === device.store)
                  return (
                    <div className="offline-row" key={device.id}>
                      <WifiOff size={18} />
                      <div>
                        <strong>{device.name}</strong>
                        <span>{store?.name || device.store} · 마지막 접속 {device.lastSeen}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="panel">
                <h3>선택 업체 요약</h3>
                <div className="store-summary-list">
                  <div><span>좌측 콘텐츠</span><strong>{leftContents.length}개</strong></div>
                  <div><span>공통 우측 콘텐츠</span><strong>{rightContents.length}개</strong></div>
                  <div><span>연결 TV</span><strong>{devices.filter((device) => device.store === selectedStore).length}대</strong></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'stores' && (
          <section className="page">
            <SectionTitle
              title="업체 관리"
              desc="매장을 만들고, 각 매장별 Player URL을 생성합니다."
              action={
                <div className="search-box">
                  <Search size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="업체명, 코드 검색"
                  />
                </div>
              }
            />

            <div className="form-card">
              <h3>새 업체 추가</h3>
              <div className="form-grid">
                <input
                  placeholder="업체명 예: 굽네치킨 고산점"
                  value={newStore.name}
                  onChange={(event) => setNewStore({ ...newStore, name: event.target.value })}
                />
                <input
                  placeholder="store 코드 예: goobne"
                  value={newStore.slug}
                  onChange={(event) => setNewStore({ ...newStore, slug: event.target.value })}
                />
                <input
                  placeholder="업종 예: 치킨 / 음식점"
                  value={newStore.category}
                  onChange={(event) => setNewStore({ ...newStore, category: event.target.value })}
                />
                <input
                  placeholder="주소 예: 의정부시 고산동"
                  value={newStore.address}
                  onChange={(event) => setNewStore({ ...newStore, address: event.target.value })}
                />
                <input
                  placeholder="연락처"
                  value={newStore.contact}
                  onChange={(event) => setNewStore({ ...newStore, contact: event.target.value })}
                />
              </div>
              <button className="primary-btn" onClick={handleAddStore}>
                <Plus size={16} />
                업체 저장
              </button>
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>업체명</th>
                    <th>store</th>
                    <th>업종</th>
                    <th>상태</th>
                    <th>Player URL</th>
                    <th>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((store) => (
                    <tr key={store.id} className={selectedStore === store.slug ? 'selected-row' : ''} onClick={() => setSelectedStore(store.slug)}>
                      <td>
                        <strong>{store.name}</strong>
                        <span>{store.address} · {store.contact}</span>
                      </td>
                      <td><code>{store.slug}</code></td>
                      <td>{store.category}</td>
                      <td><StatusBadge status={store.status} /></td>
                      <td>
                        <button className="mini-btn" onClick={(event) => {
                          event.stopPropagation()
                          handleCopy(makePlayerUrl(store.slug, settings))
                        }}>
                          <Copy size={14} />
                          복사
                        </button>
                      </td>
                      <td>
                        <button className="danger-btn" onClick={(event) => {
                          event.stopPropagation()
                          handleDeleteStore(store.slug)
                        }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'contents' && (
          <section className="page">
            <SectionTitle
              title="콘텐츠 관리"
              desc="좌측 70% 매장 콘텐츠와 우측 30% 공통 콘텐츠를 탭으로 나누어 관리합니다."
              action={
                <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.slug}>{store.name}</option>
                  ))}
                </select>
              }
            />

            <div className="notice-card content-rule-card">
              <UploadCloud size={20} />
              <div>
                <strong>현재 선택 업체: {currentStore?.name}</strong>
                <p>
                  좌측 70% 콘텐츠는 <b>{currentStore?.name}</b>에만 저장됩니다.
                  우측 30% 콘텐츠는 모든 매장에서 함께 쓰는 공통 콘텐츠입니다.
                  이미지는 재생시간이 필요하고, 영상은 영상 길이대로 재생됩니다.
                </p>
              </div>
            </div>

            <div className="content-summary-grid">
              <button className={`mini-summary left ${contentTab === 'left' ? 'active' : ''}`} onClick={() => setContentTab('left')}>
                <span>좌측 70% 매장 콘텐츠</span>
                <strong>{leftContents.length}개</strong>
                <p>{currentStore?.slug}/left</p>
              </button>
              <button className={`mini-summary right ${contentTab === 'right' ? 'active' : ''}`} onClick={() => setContentTab('right')}>
                <span>우측 30% 공통 콘텐츠</span>
                <strong>{rightContents.length}개</strong>
                <p>_common/right</p>
              </button>
            </div>

            <div className="form-card">
              <h3>새 콘텐츠 추가</h3>
              <div className="form-grid content-form upload-form labeled-form">
                <label>
                  <span>콘텐츠 제목</span>
                  <input
                    placeholder="예: 대표메뉴 영상"
                    value={newContent.title}
                    onChange={(event) => setNewContent({ ...newContent, title: event.target.value })}
                  />
                </label>

                <label>
                  <span>노출 위치</span>
                  <select
                    value={newContent.side}
                    onChange={(event) => {
                      setNewContent({ ...newContent, side: event.target.value })
                      setContentTab(event.target.value)
                    }}
                  >
                    <option value="left">좌측 70% - 현재 선택 업체</option>
                    <option value="right">우측 30% - 전체 공통</option>
                  </select>
                </label>

                <label>
                  <span>콘텐츠 종류</span>
                  <select
                    value={newContent.type}
                    onChange={(event) => setNewContent({ ...newContent, type: event.target.value })}
                  >
                    <option value="image">이미지</option>
                    <option value="video">영상</option>
                  </select>
                </label>

                {newContent.type === 'image' && (
                  <label>
                    <span>재생시간(초)</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="예: 10"
                      value={newContent.duration}
                      onChange={(event) => setNewContent({ ...newContent, duration: event.target.value })}
                    />
                  </label>
                )}

                <label>
                  <span>파일명 직접 입력 선택사항</span>
                  <input
                    placeholder="예: left_1.jpg"
                    value={newContent.fileName}
                    onChange={(event) => setNewContent({ ...newContent, fileName: event.target.value })}
                  />
                </label>

                <label>
                  <span>파일 선택</span>
                  <div className="file-picker">
                    <UploadCloud size={16} />
                    <span>{uploadFile ? uploadFile.name : '이미지/영상 파일 선택'}</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        setUploadFile(file || null)
                        if (file?.type?.startsWith('video/')) {
                          setNewContent((prev) => ({ ...prev, type: 'video' }))
                        }
                        if (file?.type?.startsWith('image/')) {
                          setNewContent((prev) => ({ ...prev, type: 'image' }))
                        }
                      }}
                    />
                  </div>
                </label>
              </div>

              <div className="upload-destination">
                저장 위치:
                <code>
                  {newContent.side === 'right'
                    ? 'stores/_common/right'
                    : `stores/${selectedStore}/left`}
                </code>
                <span>{newContent.type === 'video' ? '영상은 끝까지 재생됩니다.' : `이미지는 ${newContent.duration || 10}초 동안 재생됩니다.`}</span>
              </div>

              <button className="primary-btn" onClick={handleAddContent} disabled={isUploading}>
                <Save size={16} />
                {isUploading ? '업로드 중...' : uploadFile ? '파일 업로드 + 콘텐츠 저장' : '콘텐츠 정보 저장'}
              </button>
            </div>

            <div className="content-list-header">
              <div>
                <h3>
                  {contentTab === 'left'
                    ? `${currentStore?.name} 좌측 70% 콘텐츠`
                    : '우측 30% 공통 콘텐츠'}
                </h3>
                <p>
                  {contentTab === 'left'
                    ? '현재 선택 업체에만 나가는 콘텐츠입니다.'
                    : '모든 매장 TV 오른쪽 30%에 공통으로 나가는 콘텐츠입니다.'}
                </p>
              </div>
            </div>

            <div className="cards-grid">
              {contentManageContents.map((content, index) => {
                const Icon = content.type === 'video' ? Film : Image
                const preview = buildContentPreview(content)
                const storeName = content.store === '_common'
                  ? '공통 우측'
                  : stores.find((store) => store.slug === content.store)?.name || content.store
                const location = getContentLocation(content)

                return (
                  <article className={`content-card polished ${content.status === '중지' ? 'paused' : ''}`} key={content.id}>
                    <div className="media-thumb preview-thumb">
                      {preview ? (
                        content.type === 'video'
                          ? <video src={preview} muted playsInline preload="metadata" />
                          : <img src={preview} alt={content.title} />
                      ) : (
                        <Icon size={26} />
                      )}
                    </div>
                    <div>
                      <div className="card-row">
                        <span className={`side-pill ${content.side}`}>{content.side === 'left' ? '좌측 70%' : '우측 30%'}</span>
                        <StatusBadge status={content.status} />
                      </div>
                      <h3>{content.title}</h3>
                      <p>{storeName} · {content.type === 'video' ? '영상' : '이미지'} · {contentDurationText(content)} · {content.fileName}</p>
                      <p className="content-location">저장 위치: {location}</p>
                      {content.url && <a className="media-link" href={content.url} target="_blank" rel="noreferrer">미디어 열기</a>}
                    </div>

                    <div className="content-card-actions">
                      <button className="mini-icon-btn" title="위로" onClick={() => handleMoveContent(content.id, 'up')} disabled={index === 0}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="mini-icon-btn" title="아래로" onClick={() => handleMoveContent(content.id, 'down')} disabled={index === contentManageContents.length - 1}>
                        <ArrowDown size={14} />
                      </button>
                      <button className="mini-icon-btn" title={content.status === '사용중' ? '중지' : '사용'} onClick={() => handleToggleContentStatus(content.id)}>
                        {content.status === '사용중' ? <PauseCircle size={14} /> : <CheckCircle2 size={14} />}
                      </button>
                      <button className="mini-icon-btn danger" title="삭제" onClick={() => handleDeleteContent(content.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            {contentManageContents.length === 0 && (
              <div className="empty-panel">
                {contentTab === 'left'
                  ? '현재 선택 업체의 좌측 콘텐츠가 없습니다.'
                  : '공통 우측 콘텐츠가 없습니다.'}
              </div>
            )}
          </section>
        )}


        {activeTab === 'notices' && (
          <section className="page">
            <SectionTitle
              title="전체화면 공지"
              desc="업체별로 이미지·영상·링크·텍스트 공지를 등록하면 Player가 70:30 화면 위에 전체화면으로 송출합니다."
              action={
                <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.slug}>{store.name}</option>
                  ))}
                </select>
              }
            />

            <div className="notice-card content-rule-card">
              <FileText size={20} />
              <div>
                <strong>{currentStore?.name} 전체화면 공지 관리</strong>
                <p>
                  활성 공지가 있으면 TV는 기존 70:30 화면을 가리고 100% 전체화면 공지를 표시합니다.
                  링크 공지는 QR과 URL을 함께 보여주고, 이미지/영상 공지는 업로드 파일을 바로 송출합니다.
                </p>
              </div>
            </div>

            <div className="notice-mode-grid">
              <div className="panel notice-mode-card">
                <strong>현재 활성 공지</strong>
                {activeNotice ? (
                  <>
                    <h3>{activeNotice.title}</h3>
                    <p>{activeNotice.type} · {activeNotice.priority === 'urgent' ? '긴급' : '일반'} · {activeNotice.durationSec || 15}초</p>
                  </>
                ) : (
                  <p className="empty-text">현재 활성화된 공지가 없습니다.</p>
                )}
              </div>
              <div className="panel notice-mode-card">
                <strong>공지 송출 방식</strong>
                <p>Player가 {settings.noticePollMs || 15000}ms 주기로 공지를 확인합니다.</p>
                <p>긴급 공지는 종료 전까지 계속 표시됩니다.</p>
              </div>
            </div>

            <div className="form-card">
              <h3>새 전체화면 공지 등록</h3>
              <div className="form-grid content-form upload-form labeled-form notice-form">
                <label>
                  <span>공지 제목</span>
                  <input
                    placeholder="예: 오늘 영업시간 변경 안내"
                    value={newNotice.title}
                    onChange={(event) => setNewNotice({ ...newNotice, title: event.target.value })}
                  />
                </label>

                <label>
                  <span>공지 유형</span>
                  <select
                    value={newNotice.type}
                    onChange={(event) => setNewNotice({ ...newNotice, type: event.target.value })}
                  >
                    <option value="image">이미지 공지</option>
                    <option value="video">영상 공지</option>
                    <option value="link">링크/QR 공지</option>
                    <option value="text">텍스트 공지</option>
                  </select>
                </label>

                <label>
                  <span>우선순위</span>
                  <select
                    value={newNotice.priority}
                    onChange={(event) => setNewNotice({ ...newNotice, priority: event.target.value })}
                  >
                    <option value="normal">일반 공지</option>
                    <option value="urgent">긴급 공지</option>
                  </select>
                </label>

                <label>
                  <span>표시 시간(초)</span>
                  <input
                    type="number"
                    min="5"
                    value={newNotice.durationSec}
                    onChange={(event) => setNewNotice({ ...newNotice, durationSec: event.target.value })}
                  />
                </label>

                <label>
                  <span>시작 시간 선택사항</span>
                  <input
                    type="datetime-local"
                    value={newNotice.startAt}
                    onChange={(event) => setNewNotice({ ...newNotice, startAt: event.target.value })}
                  />
                </label>

                <label>
                  <span>종료 시간 선택사항</span>
                  <input
                    type="datetime-local"
                    value={newNotice.endAt}
                    onChange={(event) => setNewNotice({ ...newNotice, endAt: event.target.value })}
                  />
                </label>

                {(newNotice.type === 'image' || newNotice.type === 'video') && (
                  <label>
                    <span>공지 파일 업로드</span>
                    <div className="file-picker">
                      <UploadCloud size={16} />
                      <span>{noticeFile ? noticeFile.name : '공지 이미지/영상 파일 선택'}</span>
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          setNoticeFile(file || null)
                          if (file?.type?.startsWith('video/')) setNewNotice((prev) => ({ ...prev, type: 'video' }))
                          if (file?.type?.startsWith('image/')) setNewNotice((prev) => ({ ...prev, type: 'image' }))
                        }}
                      />
                    </div>
                  </label>
                )}

                {(newNotice.type === 'image' || newNotice.type === 'video') && (
                  <label>
                    <span>미디어 URL 선택사항</span>
                    <input
                      placeholder="파일 업로드 대신 외부 이미지/영상 URL"
                      value={newNotice.mediaUrl}
                      onChange={(event) => setNewNotice({ ...newNotice, mediaUrl: event.target.value })}
                    />
                  </label>
                )}

                <label className="wide-label">
                  <span>공지 문구</span>
                  <textarea
                    placeholder="TV에 함께 표시할 안내 문구를 입력하세요."
                    value={newNotice.message}
                    onChange={(event) => setNewNotice({ ...newNotice, message: event.target.value })}
                  />
                </label>

                <label>
                  <span>링크 URL</span>
                  <input
                    placeholder="예: https://localvision.imweb.me"
                    value={newNotice.linkUrl}
                    onChange={(event) => setNewNotice({ ...newNotice, linkUrl: event.target.value })}
                  />
                </label>

                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={newNotice.isActive}
                    onChange={(event) => setNewNotice({ ...newNotice, isActive: event.target.checked })}
                  />
                  <span>저장 즉시 활성화</span>
                </label>
              </div>
              <button className="primary-btn" onClick={handleAddNotice} disabled={isNoticeUploading}>
                <Send size={16} />
                {isNoticeUploading ? '공지 업로드 중...' : '전체화면 공지 저장'}
              </button>
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>공지</th>
                    <th>유형</th>
                    <th>상태</th>
                    <th>시간</th>
                    <th>파일/링크</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {storeNotices.map((notice) => (
                    <tr key={notice.id}>
                      <td>
                        <strong>{notice.title}</strong>
                        <span>{notice.message || '문구 없음'}</span>
                      </td>
                      <td>{notice.type === 'image' ? '이미지' : notice.type === 'video' ? '영상' : notice.type === 'link' ? '링크' : '텍스트'}</td>
                      <td><StatusBadge status={notice.isActive ? '사용중' : '중지'} /></td>
                      <td>
                        <span>{notice.startAt || '즉시'} ~ {notice.endAt || '해제 전'}</span>
                        <span>{notice.priority === 'urgent' ? '긴급' : `${notice.durationSec || 15}초 표시`}</span>
                      </td>
                      <td>
                        {notice.mediaUrl || notice.linkUrl ? (
                          <a className="mini-btn" href={notice.mediaUrl || notice.linkUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={14} />
                            열기
                          </a>
                        ) : <span className="muted-text">-</span>}
                      </td>
                      <td>
                        <div className="button-row">
                          <button className="mini-btn" onClick={() => handleToggleNotice(notice.id)}>
                            {notice.isActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                            {notice.isActive ? '중지' : '활성'}
                          </button>
                          <button className="danger-btn" onClick={() => handleDeleteNotice(notice.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {storeNotices.length === 0 && <div className="empty-panel">이 업체에 등록된 공지가 없습니다.</div>}
            </div>
          </section>
        )}

        {activeTab === 'playlist' && (
          <section className="page">
            <SectionTitle
              title="플레이리스트"
              desc="선택 업체 기준 좌측 콘텐츠와 공통 우측 콘텐츠를 확인하고, Player API를 테스트합니다."
              action={
                <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.slug}>{store.name}</option>
                  ))}
                </select>
              }
            />

            <div className="notice-card">
              <PlayCircle size={20} />
              <div>
                <strong>이제 Player가 CMS 데이터를 읽을 수 있는 API가 생겼습니다.</strong>
                <p>좌측 API는 업체별 콘텐츠, 우측 API는 공통 콘텐츠를 반환합니다. 다음 단계에서 실제 Player 화면과 연결합니다.</p>
              </div>
            </div>

            <div className="api-link-grid">
              <div className="panel api-panel">
                <h3>좌측 70% Playlist API</h3>
                <code>{makePlaylistApiUrl(selectedStore, 'left')}</code>
                <div className="button-row">
                  <button className="mini-btn" onClick={() => handleCopy(makePlaylistApiUrl(selectedStore, 'left'))}>
                    <Copy size={14} />
                    복사
                  </button>
                  <a className="mini-btn" href={makePlaylistApiUrl(selectedStore, 'left')} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    열기
                  </a>
                </div>
              </div>

              <div className="panel api-panel">
                <h3>우측 30% Playlist API</h3>
                <code>{makePlaylistApiUrl(selectedStore, 'right')}</code>
                <div className="button-row">
                  <button className="mini-btn" onClick={() => handleCopy(makePlaylistApiUrl(selectedStore, 'right'))}>
                    <Copy size={14} />
                    복사
                  </button>
                  <a className="mini-btn" href={makePlaylistApiUrl(selectedStore, 'right')} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    열기
                  </a>
                </div>
              </div>

              <div className="panel api-panel wide">
                <h3>TV 화면 연동 주소</h3>
                <code>{makePlayerConfigUrl(selectedStore)}</code>
                <div className="button-row">
                  <button className="mini-btn" onClick={() => handleCopy(makePlayerConfigUrl(selectedStore))}>
                    <Copy size={14} />
                    복사
                  </button>
                  <a className="mini-btn" href={makePlayerConfigUrl(selectedStore)} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    열기
                  </a>
                </div>
              </div>
            </div>

            <div className="playlist-layout">
              <div className="panel">
                <h3>좌측 70% - {currentStore?.name}</h3>
                {leftContents.length === 0 && <p className="empty-text">이 업체의 좌측 콘텐츠가 아직 없습니다.</p>}
                {leftContents.map((content, index) => (
                  <div className="playlist-item" key={content.id}>
                    <span>{index + 1}</span>
                    <PlayCircle size={18} />
                    <strong>{content.title}</strong>
                    <em>{content.type === 'video' ? '영상' : `${content.duration}초`}</em>
                  </div>
                ))}
              </div>

              <div className="panel">
                <h3>우측 30% - 공통 콘텐츠</h3>
                {rightContents.length === 0 && <p className="empty-text">공통 우측 콘텐츠가 아직 없습니다.</p>}
                {rightContents.map((content, index) => (
                  <div className="playlist-item" key={content.id}>
                    <span>{index + 1}</span>
                    <PlayCircle size={18} />
                    <strong>{content.title}</strong>
                    <em>{content.type === 'video' ? '영상' : `${content.duration}초`}</em>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'devices' && (
          <section className="page">
            <SectionTitle
              title="단말기 상태"
              desc="TV별 현재 편성 콘텐츠, 새로고침 요청, 현재 화면 미리보기를 확인합니다."
            />

            <div className="form-card">
              <h3>새 TV 단말기 추가</h3>
              <div className="form-grid">
                <input
                  placeholder="단말기 이름 예: 굽네치킨 TV 2"
                  value={newDevice.name}
                  onChange={(event) => setNewDevice({ ...newDevice, name: event.target.value })}
                />
                <select
                  value={newDevice.store}
                  onChange={(event) => setNewDevice({ ...newDevice, store: event.target.value })}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.slug}>{store.name}</option>
                  ))}
                </select>
                <select
                  value={newDevice.app}
                  onChange={(event) => setNewDevice({ ...newDevice, app: event.target.value })}
                >
                  <option value="Player Web v1.6">Player Web v1.6</option>
                  <option value="Fully Kiosk">Fully Kiosk</option>
                  <option value="Android TV App v8.2">Android TV App v8.2</option>
                </select>
                <input
                  placeholder="단말기 코드 예: LV-GOOBNE-02"
                  value={newDevice.deviceCode}
                  onChange={(event) => setNewDevice({ ...newDevice, deviceCode: event.target.value })}
                />
              </div>
              <button className="primary-btn" onClick={handleAddDevice}>
                <Tv size={16} />
                단말기 저장
              </button>
            </div>

            <div className="notice-card">
              <Eye size={20} />
              <div>
                <strong>TV 카드를 클릭하면 새로고침과 현재화면 캡처를 요청할 수 있습니다.</strong>
                <p>마지막 접속이 10분 이상 갱신되지 않으면 자동으로 OFFLINE 처리됩니다.</p>
              </div>
            </div>

            <div className="device-grid">
              {devices.map((device) => {
                const store = stores.find((item) => item.slug === device.store)
                return (
                  <article
                    className={`device-card clickable ${selectedDevice?.id === device.id ? 'selected-device' : ''}`}
                    key={device.id}
                    onClick={() => {
                      setSelectedDeviceId(device.id)
                      setSelectedStore(device.store)
                    }}
                  >
                    <div className={`device-icon ${isDeviceOnline(device) ? 'online' : 'offline'}`}>
                      {isDeviceOnline(device) ? <Wifi size={24} /> : <WifiOff size={24} />}
                    </div>
                    <div>
                      <h3>{device.name}</h3>
                      <p>{store?.name || device.store}</p>
                      <span>{device.app} · {device.deviceCode} · 마지막 접속 {device.lastSeen}</span>
                    </div>
                    <div className="device-actions">
                      <strong className={isDeviceOnline(device) ? 'online-text' : 'offline-text'}>
                        {isDeviceOnline(device) ? 'ONLINE' : 'OFFLINE'}
                      </strong>
                      <button
                        className="mini-btn"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleDeviceOnline(device.id)
                        }}
                      >
                        상태 전환
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            {selectedDevice && (
              <div className="device-detail">
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">Device Control Panel</p>
                    <h2>{selectedDeviceStore?.name || selectedDevice.store}</h2>
                    <span>{selectedDevice.name} · {selectedDevice.deviceCode}</span>
                  </div>
                  <div className="button-row">
                    <button className="ghost-btn" onClick={() => handleCopy(makePlayerUrl(selectedDevice.store, settings))}>
                      <Copy size={16} />
                      TV 설치용 URL 복사
                    </button>
                    <a className="ghost-btn" href={makePlayerUrl(selectedDevice.store, settings)} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      TV 화면 열기
                    </a>
                    <button className="primary-btn" onClick={() => handleRemoteRefresh(selectedDevice)}>
                      <Send size={16} />
                      TV 새로고침 요청
                    </button>
                    <button className="primary-btn camera-btn" onClick={handleRequestScreenshot}>
                      <Camera size={16} />
                      {isScreenshotLoading ? '캡처 요청 중...' : '현재화면 캡처 요청'}
                    </button>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="panel">
                    <h3>업체 정보</h3>
                    <div className="info-list">
                      <div><span>업체명</span><strong>{selectedDeviceStore?.name || '-'}</strong></div>
                      <div><span>store 코드</span><code>{selectedDevice.store}</code></div>
                      <div><span>업종</span><strong>{selectedDeviceStore?.category || '-'}</strong></div>
                      <div><span>주소</span><strong>{selectedDeviceStore?.address || '-'}</strong></div>
                    </div>
                  </div>

                  <div className="panel">
                    <h3>명령 상태</h3>
                    <div className="command-log">
                      <Clock3 size={18} />
                      <div>
                        <strong>{selectedDevice.lastCommand ? `최근 명령: ${selectedDevice.lastCommand}` : '최근 명령 없음'}</strong>
                        <span>{selectedDevice.commandAt || '아직 CMS에서 보낸 명령이 없습니다.'}</span>
                      </div>
                    </div>
                    <p className="muted-text">
                      TV 앱이 15초마다 명령을 확인합니다. refresh는 화면 새로고침, screenshot은 실제 TV 화면 캡처 업로드로 처리됩니다.
                    </p>
                  </div>
                </div>

                <div className="screen-preview-card">
                  <div className="screen-toolbar">
                    <div>
                      <h3>실제 TV 현재화면</h3>
                      <p>TV 앱이 업로드한 최신 스크린샷입니다.</p>
                    </div>
                    <div className="button-row">
                      <button className="mini-btn" onClick={() => loadLatestScreenshot(selectedDevice)}>
                        <RefreshCw size={14} />
                        캡처 새로고침
                      </button>
                      <span>{isDeviceOnline(selectedDevice) ? 'ONLINE DEVICE' : 'OFFLINE DEVICE'}</span>
                    </div>
                  </div>

                  {selectedScreenshot?.url ? (
                    <div className="real-screenshot-wrap">
                      <img src={`${selectedScreenshot.url}?v=${encodeURIComponent(selectedScreenshot.createdAt || '')}`} alt="TV 현재화면 스크린샷" />
                      <div className="screenshot-meta">
                        <span>캡처 시간: {selectedScreenshot.createdAt || '-'}</span>
                        <a href={selectedScreenshot.url} target="_blank" rel="noreferrer">원본 열기</a>
                      </div>
                    </div>
                  ) : (
                    <div className="screen-preview empty-screenshot">
                      <div className="preview-left">
                        <span>NO SCREENSHOT</span>
                        <strong>아직 실제 TV 캡처가 없습니다.</strong>
                        <p>상단의 현재화면 캡처 요청 버튼을 눌러주세요.</p>
                      </div>
                      <div className="preview-right">
                        <span>READY</span>
                        <strong>Android TV App v8.2 필요</strong>
                        <p>앱이 명령을 받으면 이곳에 최신 이미지가 표시됩니다.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="panel error-log-panel">
                  <div className="panel-head-row">
                    <div>
                      <h3>Player 오류 로그</h3>
                      <p className="muted-text">TV 화면에 표시된 오류코드와 Player가 CMS로 보고한 문제입니다.</p>
                    </div>
                    <div className="button-row">
                      <button className="mini-btn" onClick={() => loadPlayerErrors(selectedDevice)}>
                        <RefreshCw size={14} />
                        로그 새로고침
                      </button>
                      <button className="mini-btn" onClick={() => clearPlayerErrors(selectedDevice)}>
                        <Trash2 size={14} />
                        로그 정리
                      </button>
                    </div>
                  </div>

                  {selectedPlayerErrors.length === 0 ? (
                    <p className="empty-text">최근 보고된 Player 오류가 없습니다.</p>
                  ) : (
                    <div className="error-log-list">
                      {selectedPlayerErrors.map((error) => (
                        <div className={`error-log-item ${error.level || 'error'}`} key={error.id}>
                          <div>
                            <strong>{error.errorCode}</strong>
                            <span>{error.message}</span>
                            <em>{error.createdAt || '-'}</em>
                          </div>
                          <code>{error.extra?.fileName || error.extra?.url || error.href || '-'}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="detail-grid">
                  <div className="panel">
                    <h3>이 업체의 좌측 70% 콘텐츠</h3>
                    {selectedDeviceLeftContents.length === 0 && <p className="empty-text">등록된 좌측 콘텐츠가 없습니다.</p>}
                    {selectedDeviceLeftContents.map((content, index) => (
                      <div className="content-row" key={content.id}>
                        <span>{index + 1}</span>
                        {content.type === 'video' ? <Film size={16} /> : <Image size={16} />}
                        <strong>{content.title}</strong>
                        <em>{content.type === 'video' ? '영상' : `${content.duration}초`}</em>
                      </div>
                    ))}
                  </div>

                  <div className="panel">
                    <h3>공통 우측 30% 콘텐츠</h3>
                    {selectedDeviceRightContents.length === 0 && <p className="empty-text">등록된 우측 콘텐츠가 없습니다.</p>}
                    {selectedDeviceRightContents.map((content, index) => (
                      <div className="content-row" key={content.id}>
                        <span>{index + 1}</span>
                        {content.type === 'video' ? <Film size={16} /> : <Image size={16} />}
                        <strong>{content.title}</strong>
                        <em>{content.type === 'video' ? '영상' : `${content.duration}초`}</em>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="page">
            <SectionTitle
              title="설정/백업"
              desc="Cloudflare 연동 주소와 기본 플레이어 옵션을 관리합니다."
            />

            <div className="settings-grid">
              <div className="panel">
                <h3>기본 CMS API 주소</h3>
                <input
                  value={settings.apiBase}
                  onChange={(event) => handleUpdateSetting('apiBase', event.target.value)}
                />
              </div>
              <div className="panel">
                <h3>기본 TV 화면 주소</h3>
                <input
                  value={settings.playerBase}
                  onChange={(event) => handleUpdateSetting('playerBase', event.target.value)}
                />
                <p className="muted-text">현재 기준: https://localvision-player.pages.dev</p>
              </div>
              <div className="panel">
                <h3>플레이어 기본 옵션</h3>
                <div className="mini-form">
                  <label>매일 리로드 시간</label>
                  <input value={settings.restart} onChange={(event) => handleUpdateSetting('restart', event.target.value)} />
                  <label>캐시 개수</label>
                  <input value={settings.cacheMax} onChange={(event) => handleUpdateSetting('cacheMax', event.target.value)} />
                  <label>공지 확인 주기(ms)</label>
                  <input value={settings.noticePollMs || '15000'} onChange={(event) => handleUpdateSetting('noticePollMs', event.target.value)} />
                </div>
              </div>
              <div className="panel">
                <h3>데이터 백업</h3>
                <p className="muted-text">현재 브라우저에 저장된 CMS 데이터를 JSON 파일로 내려받습니다.</p>
                <div className="button-row">
                  <button className="primary-btn" onClick={handleExportJson}>
                    <Download size={16} />
                    JSON 백업 다운로드
                  </button>
                  <button className="ghost-btn" onClick={handleResetTvUrlSettings}>
                    <RefreshCw size={16} />
                    TV URL 최신화
                  </button>
                  <button className="ghost-btn" onClick={handleResetSample}>
                    <RotateCcw size={16} />
                    샘플 초기화
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
