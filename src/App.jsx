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
} from 'lucide-react'

const STORAGE_KEY = 'localvision-cms-v1-1'
const PLAYER_BASE = 'https://localvision-media-ujb-player.pages.dev'
const API_BASE = 'https://odd-glitter-4464localvision-api-ujb.1to75uni.workers.dev'

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
    id: 'dv_001',
    store: 'goobne',
    name: '굽네치킨 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '방금 전',
    app: 'Player Web',
    deviceCode: 'LV-GOOBNE-01',
  },
  {
    id: 'dv_002',
    store: 'sbflower',
    name: '샛별플라워 TV 1',
    role: 'tv',
    online: false,
    lastSeen: '37분 전',
    app: 'Fully Kiosk',
    deviceCode: 'LV-SBFLOWER-01',
  },
  {
    id: 'dv_003',
    store: 'areumcafe',
    name: '아름드리 카페 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '1분 전',
    app: 'Android TV App',
    deviceCode: 'LV-AREUM-01',
  },
]

const initialData = {
  stores: sampleStores,
  contents: sampleContents,
  devices: sampleDevices,
  settings: {
    playerBase: PLAYER_BASE,
    apiBase: API_BASE,
    restart: '09:30',
    restartMode: 'reload',
    restartJitterSec: '0',
    cacheMax: '20',
  },
}

const tabs = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'stores', label: '업체 관리', icon: Store },
  { id: 'contents', label: '콘텐츠 관리', icon: UploadCloud },
  { id: 'playlist', label: '플레이리스트', icon: ListVideo },
  { id: 'devices', label: '단말기 상태', icon: Monitor },
  { id: 'settings', label: '설정/백업', icon: Settings },
]

function getToday() {
  return new Date().toISOString().slice(0, 10)
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
    return {
      stores: Array.isArray(parsed.stores) ? parsed.stores : sampleStores,
      contents: Array.isArray(parsed.contents) ? parsed.contents : sampleContents,
      devices: Array.isArray(parsed.devices) ? parsed.devices : sampleDevices,
      settings: { ...initialData.settings, ...(parsed.settings || {}) },
    }
  } catch {
    return initialData
  }
}

function makePlayerUrl(slug, settings) {
  const params = new URLSearchParams({
    store: slug,
    apiBase: settings.apiBase,
    restart: settings.restart,
    restartMode: settings.restartMode,
    restartJitterSec: settings.restartJitterSec,
    cacheMax: settings.cacheMax,
  })

  return `${settings.playerBase}/?${params.toString()}`
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
  const [activeTab, setActiveTab] = useState('dashboard')
  const [data, setData] = useState(loadData)
  const [selectedStore, setSelectedStore] = useState(data.stores[0]?.slug || 'goobne')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
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

  const [newDevice, setNewDevice] = useState({
    name: '',
    store: selectedStore,
    app: 'Player Web',
    deviceCode: '',
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    loadServerData(false)
  }, [])

  useEffect(() => {
    setNewDevice((prev) => ({ ...prev, store: selectedStore }))
  }, [selectedStore])

  function showToast(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  const { stores, contents, devices, settings } = data
  const currentStore = stores.find((store) => store.slug === selectedStore) || stores[0]

  const filteredStores = stores.filter((store) => {
    const target = `${store.name} ${store.slug} ${store.category} ${store.address}`.toLowerCase()
    return target.includes(search.toLowerCase())
  })

  const summary = useMemo(() => {
    const online = devices.filter((device) => device.online).length
    const left = contents.filter((content) => content.side === 'left').length
    const right = contents.filter((content) => content.side === 'right').length

    return {
      stores: stores.length,
      devices: devices.length,
      online,
      offline: devices.length - online,
      left,
      right,
    }
  }, [stores, devices, contents])

  const leftContents = contents.filter(
    (content) => content.side === 'left' && content.store === selectedStore
  )
  const rightContents = contents.filter((content) => content.side === 'right')

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) || devices[0]
  const selectedDeviceStore = stores.find((store) => store.slug === selectedDevice?.store)
  const selectedDeviceLeftContents = contents.filter(
    (content) => content.side === 'left' && content.store === selectedDevice?.store
  )
  const selectedDeviceRightContents = contents.filter((content) => content.side === 'right')
  const currentLeftContent = selectedDeviceLeftContents[0]
  const currentRightContent = selectedDeviceRightContents[0]

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
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
        devices: Array.isArray(payload.devices) ? payload.devices : prev.devices,
      }))
      setServerStatus('connected')
      if (showMessage) showToast('D1 서버 데이터를 불러왔습니다.')
    } catch (error) {
      setServerStatus('local')
      if (showMessage) showToast('서버 연결 전입니다. 브라우저 저장 모드로 유지됩니다.')
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
      id: makeId('dv'),
      store: slug,
      name: `${nextStore.name} TV 1`,
      role: 'tv',
      online: false,
      lastSeen: '아직 접속 없음',
      app: 'Player Web',
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

  function handleAddContent() {
    if (!newContent.title.trim()) {
      alert('콘텐츠 제목을 입력해주세요.')
      return
    }

    const side = newContent.side
    const store = side === 'right' ? '_common' : selectedStore
    const fileName =
      newContent.fileName.trim() ||
      `${side}_${contents.filter((item) => item.side === side && item.store === store).length + 1}.${newContent.type === 'video' ? 'mp4' : 'jpg'}`

    const nextContent = {
      id: makeId('ct'),
      store,
      side,
      type: newContent.type,
      title: newContent.title.trim(),
      duration: Number(newContent.duration) || 10,
      status: '사용중',
      fileName,
      updatedAt: getToday(),
    }

    updateData({ contents: [nextContent, ...contents] })
    sendToServer('/api/contents', {
      method: 'POST',
      body: JSON.stringify(nextContent),
    })
    setNewContent({ title: '', side: 'left', type: 'image', duration: 10, fileName: '' })
    showToast('콘텐츠가 저장되었습니다.')
  }

  function handleDeleteContent(id) {
    updateData({ contents: contents.filter((content) => content.id !== id) })
    sendToServer(`/api/contents?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    showToast('콘텐츠가 삭제되었습니다.')
  }

  function handleAddDevice() {
    if (!newDevice.name.trim()) {
      alert('단말기 이름을 입력해주세요.')
      return
    }

    const nextDevice = {
      id: makeId('dv'),
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
    setNewDevice({ name: '', store: selectedStore, app: 'Player Web', deviceCode: '' })
    showToast('단말기가 저장되었습니다.')
  }

  function toggleDeviceOnline(id) {
    const target = devices.find((device) => device.id === id)
    if (!target) return

    const updated = {
      ...target,
      online: !target.online,
      lastSeen: !target.online ? '방금 전' : '오프라인 전환',
    }

    updateData({
      devices: devices.map((device) => (device.id === id ? updated : device)),
    })

    sendToServer('/api/devices', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        online: updated.online,
        lastSeen: updated.lastSeen,
      }),
    })
  }

  function handleRemoteRefresh(deviceId) {
    const now = new Date().toLocaleString('ko-KR')
    updateData({
      devices: devices.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              lastCommand: 'refresh',
              commandAt: now,
            }
          : device
      ),
    })

    sendToServer('/api/devices', {
      method: 'PATCH',
      body: JSON.stringify({
        id: deviceId,
        lastCommand: 'refresh',
        commandAt: now,
      }),
    })

    showToast('새로고침 요청을 기록했습니다. 다음 단계에서 실제 TV 명령으로 연결합니다.')
  }

  function handlePreviewScreenshot() {
    if (!selectedDevice) return

    const canvas = document.createElement('canvas')
    canvas.width = 1344
    canvas.height = 1080
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = '#111827'
    ctx.fillRect(0, 0, 940, 1080)

    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(940, 0, 404, 1080)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 58px Arial'
    ctx.fillText(selectedDeviceStore?.name || selectedDevice.store, 64, 110)

    ctx.font = 'bold 42px Arial'
    ctx.fillText('LEFT 70% 매장 콘텐츠', 64, 210)

    ctx.font = '32px Arial'
    ctx.fillText(currentLeftContent?.title || '등록된 좌측 콘텐츠 없음', 64, 285)
    ctx.fillText(currentLeftContent?.fileName || '-', 64, 335)

    ctx.font = 'bold 34px Arial'
    ctx.fillText('RIGHT 30%', 982, 110)
    ctx.fillText('공통 콘텐츠', 982, 155)

    ctx.font = '28px Arial'
    wrapCanvasText(ctx, currentRightContent?.title || '등록된 우측 콘텐츠 없음', 982, 235, 300, 36)

    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    ctx.font = '24px Arial'
    ctx.fillText(`Device: ${selectedDevice.name}`, 64, 1010)
    ctx.fillText(`Captured Preview: ${new Date().toLocaleString('ko-KR')}`, 64, 1046)

    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `localvision-preview-${selectedDevice.store}-${getToday()}.png`
    a.click()
    showToast('현재화면 미리보기 스크린샷을 다운로드했습니다.')
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

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LV</div>
          <div>
            <strong>LocalVision</strong>
            <span>CMS Console v1.4</span>
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
          <strong>Player API 연결 준비</strong>
          <span>다음 단계: R2 업로드 연결</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">LocalVision CMS MVP</p>
            <h1>업체 · 콘텐츠 · TV 상태를 한 화면에서 관리</h1>
          </div>
          <div className="top-actions">
            <span className={`server-chip ${serverStatus}`}>
              {serverStatus === 'connected' ? 'D1 서버 연결됨' : serverStatus === 'checking' ? '서버 확인중' : '브라우저 저장 모드'}
            </span>
            <button className="ghost-btn" onClick={() => loadServerData(true)}>
              <RefreshCw size={16} />
              서버 데이터 새로고침
            </button>
            <a className="primary-btn" href={makePlayerUrl(selectedStore, settings)} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              플레이어 미리보기
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
                <strong>v1.4부터 Player용 playlist API가 추가되었습니다.</strong>
                <p>이제 TV Player가 /api/playlist와 /api/player-config를 통해 CMS의 D1 데이터를 읽을 수 있는 구조입니다.</p>
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
                  <div><CheckCircle2 size={18} /> 업체 생성 후 브라우저 저장</div>
                  <div><CheckCircle2 size={18} /> 콘텐츠 목록 브라우저 저장</div>
                  <div><CheckCircle2 size={18} /> TV 단말기 상태 샘플 관리</div>
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
                    Player URL 복사
                  </button>
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
              desc="좌측 70% 매장 콘텐츠와 우측 30% 공통 콘텐츠를 구분해서 관리합니다."
              action={
                <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.slug}>{store.name}</option>
                  ))}
                </select>
              }
            />

            <div className="form-card">
              <h3>새 콘텐츠 추가</h3>
              <div className="form-grid content-form">
                <input
                  placeholder="콘텐츠 제목 예: 대표메뉴 영상"
                  value={newContent.title}
                  onChange={(event) => setNewContent({ ...newContent, title: event.target.value })}
                />
                <select
                  value={newContent.side}
                  onChange={(event) => setNewContent({ ...newContent, side: event.target.value })}
                >
                  <option value="left">좌측 70% 매장 콘텐츠</option>
                  <option value="right">우측 30% 공통 콘텐츠</option>
                </select>
                <select
                  value={newContent.type}
                  onChange={(event) => setNewContent({ ...newContent, type: event.target.value })}
                >
                  <option value="image">이미지</option>
                  <option value="video">영상</option>
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="재생 시간"
                  value={newContent.duration}
                  onChange={(event) => setNewContent({ ...newContent, duration: event.target.value })}
                />
                <input
                  placeholder="파일명 예: left_1.mp4"
                  value={newContent.fileName}
                  onChange={(event) => setNewContent({ ...newContent, fileName: event.target.value })}
                />
              </div>
              <button className="primary-btn" onClick={handleAddContent}>
                <Save size={16} />
                콘텐츠 저장
              </button>
            </div>

            <div className="cards-grid">
              {contents.map((content) => {
                const Icon = content.type === 'video' ? Film : Image
                const storeName = content.store === '_common'
                  ? '공통 우측'
                  : stores.find((store) => store.slug === content.store)?.name || content.store

                return (
                  <article className="content-card" key={content.id}>
                    <div className="media-thumb">
                      <Icon size={26} />
                    </div>
                    <div>
                      <div className="card-row">
                        <span className={`side-pill ${content.side}`}>{content.side === 'left' ? '좌측 70%' : '우측 30%'}</span>
                        <StatusBadge status={content.status} />
                      </div>
                      <h3>{content.title}</h3>
                      <p>{storeName} · {content.duration}초 · {content.fileName} · {content.updatedAt}</p>
                    </div>
                    <button className="icon-btn" onClick={() => handleDeleteContent(content.id)}>
                      <Trash2 size={15} />
                    </button>
                  </article>
                )
              })}
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
                <h3>Player 전체 설정 API</h3>
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
                    <em>{content.duration}초</em>
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
                    <em>{content.duration}초</em>
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
                  <option value="Player Web">Player Web</option>
                  <option value="Fully Kiosk">Fully Kiosk</option>
                  <option value="Android TV App">Android TV App</option>
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
                <strong>TV 카드를 클릭하면 해당 업체의 현재 편성 콘텐츠를 볼 수 있습니다.</strong>
                <p>v1.2의 스크린샷은 CMS 미리보기 캡처입니다. 실제 TV 화면 캡처는 다음 단계에서 Player 앱과 서버를 연결합니다.</p>
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
                    <div className={`device-icon ${device.online ? 'online' : 'offline'}`}>
                      {device.online ? <Wifi size={24} /> : <WifiOff size={24} />}
                    </div>
                    <div>
                      <h3>{device.name}</h3>
                      <p>{store?.name || device.store}</p>
                      <span>{device.app} · {device.deviceCode} · 마지막 접속 {device.lastSeen}</span>
                    </div>
                    <div className="device-actions">
                      <strong className={device.online ? 'online-text' : 'offline-text'}>
                        {device.online ? 'ONLINE' : 'OFFLINE'}
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
                      Player URL 복사
                    </button>
                    <a className="ghost-btn" href={makePlayerUrl(selectedDevice.store, settings)} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      Player 열기
                    </a>
                    <button className="primary-btn" onClick={() => handleRemoteRefresh(selectedDevice.id)}>
                      <Send size={16} />
                      TV 새로고침 요청
                    </button>
                    <button className="primary-btn camera-btn" onClick={handlePreviewScreenshot}>
                      <Camera size={16} />
                      현재화면 스크린샷
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
                      현재는 명령을 CMS에 기록하는 단계입니다. 다음 단계에서 Player가 명령을 polling해서 실제 새로고침합니다.
                    </p>
                  </div>
                </div>

                <div className="screen-preview-card">
                  <div className="screen-toolbar">
                    <div>
                      <h3>현재 화면 미리보기</h3>
                      <p>좌측 70% 매장 콘텐츠 + 우측 30% 공통 콘텐츠 기준</p>
                    </div>
                    <span>{selectedDevice.online ? 'ONLINE PREVIEW' : 'OFFLINE PREVIEW'}</span>
                  </div>

                  <div className="screen-preview">
                    <div className="preview-left">
                      <span>LEFT 70%</span>
                      <strong>{currentLeftContent?.title || '좌측 콘텐츠 없음'}</strong>
                      <p>{currentLeftContent?.fileName || '콘텐츠를 추가해주세요.'}</p>
                    </div>
                    <div className="preview-right">
                      <span>RIGHT 30%</span>
                      <strong>{currentRightContent?.title || '우측 콘텐츠 없음'}</strong>
                      <p>{currentRightContent?.fileName || '공통 콘텐츠를 추가해주세요.'}</p>
                    </div>
                  </div>
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
                        <em>{content.duration}초</em>
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
                        <em>{content.duration}초</em>
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
                <h3>기본 API 주소</h3>
                <input
                  value={settings.apiBase}
                  onChange={(event) => handleUpdateSetting('apiBase', event.target.value)}
                />
              </div>
              <div className="panel">
                <h3>기본 Player 주소</h3>
                <input
                  value={settings.playerBase}
                  onChange={(event) => handleUpdateSetting('playerBase', event.target.value)}
                />
              </div>
              <div className="panel">
                <h3>플레이어 기본 옵션</h3>
                <div className="mini-form">
                  <label>매일 리로드 시간</label>
                  <input value={settings.restart} onChange={(event) => handleUpdateSetting('restart', event.target.value)} />
                  <label>캐시 개수</label>
                  <input value={settings.cacheMax} onChange={(event) => handleUpdateSetting('cacheMax', event.target.value)} />
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
