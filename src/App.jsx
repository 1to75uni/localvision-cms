import { useMemo, useState } from 'react'
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
} from 'lucide-react'

const PLAYER_BASE = 'https://localvision-media-ujb-player.pages.dev'
const API_BASE = 'https://odd-glitter-4464localvision-api-ujb.1to75uni.workers.dev'

const initialStores = [
  {
    id: 'st_001',
    name: '굽네치킨 고산점',
    slug: 'goobne',
    category: '치킨 / 음식점',
    address: '의정부시 고산동',
    status: '운영중',
    plan: 'Local Basic',
  },
  {
    id: 'st_002',
    name: '샛별플라워',
    slug: 'sbflower',
    category: '꽃집',
    address: '의정부시 민락동',
    status: '준비중',
    plan: 'Local Basic',
  },
  {
    id: 'st_003',
    name: '아름드리 카페',
    slug: 'areumcafe',
    category: '카페',
    address: '의정부시 금오동',
    status: '운영중',
    plan: 'Public Board',
  },
]

const initialContents = [
  {
    id: 'ct_001',
    store: 'goobne',
    side: 'left',
    type: 'video',
    title: '대표메뉴 치킨 영상',
    duration: 20,
    status: '사용중',
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
    updatedAt: '2026-05-01',
  },
]

const initialDevices = [
  {
    id: 'dv_001',
    store: 'goobne',
    name: '굽네치킨 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '방금 전',
    app: 'Player Web',
  },
  {
    id: 'dv_002',
    store: 'sbflower',
    name: '샛별플라워 TV 1',
    role: 'tv',
    online: false,
    lastSeen: '37분 전',
    app: 'Fully Kiosk',
  },
  {
    id: 'dv_003',
    store: 'areumcafe',
    name: '아름드리 카페 TV 1',
    role: 'tv',
    online: true,
    lastSeen: '1분 전',
    app: 'Android TV App',
  },
]

const tabs = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'stores', label: '업체 관리', icon: Store },
  { id: 'contents', label: '콘텐츠 관리', icon: UploadCloud },
  { id: 'playlist', label: '플레이리스트', icon: ListVideo },
  { id: 'devices', label: '단말기 상태', icon: Monitor },
  { id: 'settings', label: '설정', icon: Settings },
]

function makePlayerUrl(slug) {
  const params = new URLSearchParams({
    store: slug,
    apiBase: API_BASE,
    restart: '09:30',
    restartMode: 'reload',
    restartJitterSec: '0',
    cacheMax: '20',
  })

  return `${PLAYER_BASE}/?${params.toString()}`
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
  const [stores, setStores] = useState(initialStores)
  const [contents, setContents] = useState(initialContents)
  const [devices] = useState(initialDevices)
  const [selectedStore, setSelectedStore] = useState('goobne')
  const [search, setSearch] = useState('')
  const [newStore, setNewStore] = useState({
    name: '',
    slug: '',
    category: '',
    address: '',
  })

  const currentStore = stores.find((store) => store.slug === selectedStore) || stores[0]

  const filteredStores = stores.filter((store) => {
    const target = `${store.name} ${store.slug} ${store.category}`.toLowerCase()
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

  function handleAddStore() {
    if (!newStore.name || !newStore.slug) {
      alert('업체명과 store 코드는 꼭 입력해주세요.')
      return
    }

    const cleanSlug = newStore.slug
      .toLowerCase()
      .trim()
      .replaceAll(' ', '-')
      .replace(/[^a-z0-9-_]/g, '')

    if (stores.some((store) => store.slug === cleanSlug)) {
      alert('이미 사용 중인 store 코드입니다.')
      return
    }

    const nextStore = {
      id: `st_${Date.now()}`,
      name: newStore.name,
      slug: cleanSlug,
      category: newStore.category || '미분류',
      address: newStore.address || '주소 미입력',
      status: '준비중',
      plan: 'Local Basic',
    }

    setStores((prev) => [nextStore, ...prev])
    setSelectedStore(cleanSlug)
    setNewStore({ name: '', slug: '', category: '', address: '' })
  }

  function handleAddMockContent(side) {
    const item = {
      id: `ct_${Date.now()}`,
      store: side === 'right' ? '_common' : selectedStore,
      side,
      type: side === 'right' ? 'image' : 'video',
      title: side === 'right' ? '공통 우측 콘텐츠 예시' : `${currentStore?.name || '업체'} 신규 콘텐츠`,
      duration: side === 'right' ? 12 : 20,
      status: '사용중',
      updatedAt: '2026-05-02',
    }

    setContents((prev) => [item, ...prev])
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text)
    alert('복사되었습니다.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LV</div>
          <div>
            <strong>LocalVision</strong>
            <span>CMS Console</span>
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
          <strong>CMS UI 1차 뼈대</strong>
          <span>다음 단계: Cloudflare Pages 배포</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">LocalVision CMS MVP</p>
            <h1>업체 · 콘텐츠 · TV 상태를 한 화면에서 관리</h1>
          </div>
          <div className="top-actions">
            <button className="ghost-btn">
              <RefreshCw size={16} />
              상태 새로고침
            </button>
            <a className="primary-btn" href={makePlayerUrl(selectedStore)} target="_blank">
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
                  <div><CheckCircle2 size={18} /> 업체 생성 기능 준비</div>
                  <div><CheckCircle2 size={18} /> 콘텐츠 목록 UI 준비</div>
                  <div><CheckCircle2 size={18} /> TV 온라인 상태 UI 준비</div>
                  <div><CheckCircle2 size={18} /> 플레이어 URL 자동 생성</div>
                </div>
              </div>

              <div className="panel">
                <h3>현재 선택 업체</h3>
                <div className="selected-store">
                  <strong>{currentStore?.name}</strong>
                  <span>{currentStore?.category}</span>
                  <code>{currentStore?.slug}</code>
                  <button onClick={() => handleCopy(makePlayerUrl(currentStore?.slug))}>
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
              </div>
              <button className="primary-btn" onClick={handleAddStore}>
                <Plus size={16} />
                업체 추가
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
                  </tr>
                </thead>
                <tbody>
                  {filteredStores.map((store) => (
                    <tr key={store.id} onClick={() => setSelectedStore(store.slug)}>
                      <td>
                        <strong>{store.name}</strong>
                        <span>{store.address}</span>
                      </td>
                      <td><code>{store.slug}</code></td>
                      <td>{store.category}</td>
                      <td><StatusBadge status={store.status} /></td>
                      <td>
                        <button className="mini-btn" onClick={(event) => {
                          event.stopPropagation()
                          handleCopy(makePlayerUrl(store.slug))
                        }}>
                          <Copy size={14} />
                          복사
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

            <div className="content-actions">
              <button className="primary-btn" onClick={() => handleAddMockContent('left')}>
                <UploadCloud size={16} />
                좌측 콘텐츠 예시 추가
              </button>
              <button className="ghost-btn" onClick={() => handleAddMockContent('right')}>
                <UploadCloud size={16} />
                우측 공통 콘텐츠 예시 추가
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
                      <p>{storeName} · {content.duration}초 · {content.updatedAt}</p>
                    </div>
                    <button className="icon-btn">
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
              desc="현재는 UI 뼈대 단계입니다. 다음 단계에서 R2 playlist.json과 연결합니다."
            />

            <div className="playlist-layout">
              <div className="panel">
                <h3>좌측 70% - {currentStore?.name}</h3>
                {contents.filter((content) => content.side === 'left' && content.store === selectedStore).map((content, index) => (
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
                {contents.filter((content) => content.side === 'right').map((content, index) => (
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
              desc="TV가 현재 켜져 있는지, 마지막 접속이 언제인지 확인하는 화면입니다."
            />

            <div className="device-grid">
              {devices.map((device) => {
                const store = stores.find((item) => item.slug === device.store)
                return (
                  <article className="device-card" key={device.id}>
                    <div className={`device-icon ${device.online ? 'online' : 'offline'}`}>
                      {device.online ? <Wifi size={24} /> : <WifiOff size={24} />}
                    </div>
                    <div>
                      <h3>{device.name}</h3>
                      <p>{store?.name || device.store}</p>
                      <span>{device.app} · 마지막 접속 {device.lastSeen}</span>
                    </div>
                    <strong className={device.online ? 'online-text' : 'offline-text'}>
                      {device.online ? 'ONLINE' : 'OFFLINE'}
                    </strong>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="page">
            <SectionTitle
              title="설정"
              desc="Cloudflare 연동 주소와 기본 플레이어 옵션을 관리하는 영역입니다."
            />

            <div className="settings-grid">
              <div className="panel">
                <h3>기본 API 주소</h3>
                <code className="block-code">{API_BASE}</code>
              </div>
              <div className="panel">
                <h3>기본 Player 주소</h3>
                <code className="block-code">{PLAYER_BASE}</code>
              </div>
              <div className="panel">
                <h3>Cloudflare Pages 배포 설정</h3>
                <p>Build command</p>
                <code>npm run build</code>
                <p>Build output directory</p>
                <code>dist</code>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
