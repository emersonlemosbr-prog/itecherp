import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './LandingPage.css'

/* ================================================================
   iTech ERP — Landing Page Institucional
   ================================================================ */

// ── Dados dos módulos ────────────────────────────────────────────
const MODULES = [
  { icon: '🛠️', name: 'Ordens de Serviço', desc: 'Abertura, acompanhamento e histórico completo de OS com QR Code.' },
  { icon: '👥', name: 'Clientes', desc: 'Cadastro, histórico de serviços e conta de pendências por cliente.' },
  { icon: '📦', name: 'Estoque', desc: 'Controle de entrada e saída de peças e acessórios com alertas.' },
  { icon: '💰', name: 'Financeiro', desc: 'Histórico financeiro mensal e visão completa das movimentações.' },
  { icon: '🛒', name: 'Venda de Caixa', desc: 'PDV rápido para venda de acessórios e produtos no balcão.' },
  { icon: '📱', name: 'Venda de Aparelho', desc: 'Registro completo da compra e venda de smartphones e tablets.' },
  { icon: '🛡️', name: 'Garantias', desc: 'Controle das garantias emitidas e alertas de vencimento.' },
  { icon: '🤝', name: 'Pendentes (Fiado)', desc: 'Gestão de contas a receber e controle de fiados por cliente.' },
  { icon: '📊', name: 'Dashboard', desc: 'Visão executiva em tempo real: receita, OS, estoque e metas.' },
  { icon: '🔗', name: 'Acompanhamento Público', desc: 'Link exclusivo para o cliente consultar o status da sua OS.' },
  { icon: '🧪', name: 'Removedor de Vírus', desc: 'Ferramenta ADB para limpeza de vírus e malware via USB.' },
  { icon: '🎬', name: 'Calculadora de Peças', desc: 'Calcula valor de frontais e peças com margem configurável.' },
]

// ── FAQ ──────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'O sistema funciona sem internet?',
    a: 'O iTech ERP é um sistema baseado em nuvem. Você precisa de conexão com a internet para acessá-lo, mas o acesso pode ser feito de qualquer dispositivo com navegador — celular, tablet ou computador.',
  },
  {
    q: 'Quantos usuários podem acessar simultaneamente?',
    a: 'Não há limite fixo de usuários simultâneos. Cada loja pode cadastrar múltiplos usuários com níveis de acesso individuais: administrador ou operador.',
  },
  {
    q: 'Os dados de cada loja são separados?',
    a: 'Sim. O sistema é multi-tenant: cada loja possui seu próprio banco de dados isolado. Nenhuma loja acessa dados de outra.',
  },
  {
    q: 'O cliente consegue ver o status da OS?',
    a: 'Sim. Cada OS gera um link de acompanhamento público com QR Code. O cliente pode consultar o andamento pelo celular, sem precisar de login.',
  },
  {
    q: 'Posso imprimir ordens de serviço?',
    a: 'Sim. O sistema gera um layout de impressão completo com todos os dados da OS, incluindo QR Code para acompanhamento e informações de garantia.',
  },
  {
    q: 'O sistema controla garantias?',
    a: 'Sim. Cada OS pode ter um prazo de garantia registrado. O sistema exibe uma listagem de garantias ativas e próximas do vencimento.',
  },
  {
    q: 'Posso acessar pelo celular?',
    a: 'Sim. O iTech ERP é totalmente responsivo e funciona em dispositivos móveis. A interface se adapta automaticamente à tela do smartphone.',
  },
  {
    q: 'Como funciona o controle financeiro?',
    a: 'O sistema registra automaticamente as receitas das vendas, OS e movimentações. O Histórico Financeiro apresenta um resumo mensal com detalhamento por categoria.',
  },
  {
    q: 'Existe suporte técnico?',
    a: 'O sistema é desenvolvido e mantido pela equipe iTech. Dúvidas e sugestões podem ser encaminhadas diretamente ao desenvolvedor responsável.',
  },
]

// ── Navbar ───────────────────────────────────────────────────────
function LandingNav({ onSectionClick }) {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLink = (id) => {
    setMobileOpen(false)
    onSectionClick(id)
  }

  const destination = user ? '/dashboard' : '/login'
  const buttonLabel = user ? 'Dashboard →' : 'Acessar sistema →'

  return (
    <>
      <nav className={`lp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a href="#inicio" className="lp-nav-logo" onClick={(e) => { e.preventDefault(); onSectionClick('inicio') }}>
            <div className="lp-nav-logo-mark">iT</div>
            <div className="lp-nav-logo-text">iTech <span>ERP</span></div>
          </a>

          <ul className="lp-nav-links">
            {[['modulos','Módulos'],['funcionalidades','Funcionalidades'],['como-funciona','Como Funciona'],['seguranca','Segurança'],['faq','FAQ']].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} onClick={(e) => { e.preventDefault(); handleLink(id) }}>{label}</a>
              </li>
            ))}
            <li>
              <Link to={destination}>Dashboard</Link>
            </li>
          </ul>

          <div className="lp-nav-cta">
            <Link to={destination} className="lp-btn-ghost">
              {user ? 'Dashboard' : 'Entrar'}
            </Link>
            <Link to={destination} className="lp-btn-primary">
              {buttonLabel}
            </Link>
          </div>

          <button
            className={`lp-hamburger${mobileOpen ? ' open' : ''}`}
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Menu"
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      <div className={`lp-mobile-menu${mobileOpen ? ' open' : ''}`}>
        {[['modulos','Módulos'],['funcionalidades','Funcionalidades'],['como-funciona','Como Funciona'],['seguranca','Segurança'],['faq','FAQ']].map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); handleLink(id) }}>{label}</a>
        ))}
        <Link to={destination} onClick={() => setMobileOpen(false)}>
          Dashboard
        </Link>
        <Link to={destination} className="lp-btn-primary" style={{ textAlign: 'center', marginTop: 8 }} onClick={() => setMobileOpen(false)}>
          {buttonLabel}
        </Link>
      </div>
    </>
  )
}

// ── Hero ─────────────────────────────────────────────────────────
function LandingHero({ scrollTo }) {
  const { user } = useAuth()
  const destination = user ? '/dashboard' : '/login'
  const buttonLabel = user ? 'Acessar Dashboard →' : 'Acessar sistema →'

  return (
    <section id="inicio" className="lp-hero">
      <div className="lp-container">
        <div className="lp-hero-inner">
          <div>
            <div className="lp-hero-badge">
              <span>🚀</span> Sistema completo para assistência técnica
            </div>
            <h1 className="lp-hero-title">
              Gestão profissional para sua <span className="accent">loja de celulares</span>
            </h1>
            <p className="lp-hero-sub">
              Controle ordens de serviço, estoque, clientes, financeiro e muito mais em um sistema feito especialmente para lojas de celulares e assistência técnica.
            </p>
            <div className="lp-hero-actions">
              <Link to={destination} className="lp-btn-primary">
                {buttonLabel}
              </Link>
              <button
                className="lp-btn-secondary"
                onClick={() => scrollTo('modulos')}
              >
                Conhecer módulos
              </button>
            </div>

            <div className="lp-hero-stats">
              <div className="lp-stat">
                <span className="lp-stat-value">12+</span>
                <span className="lp-stat-label">Módulos integrados</span>
              </div>
              <div className="lp-stat">
                <span className="lp-stat-value">100%</span>
                <span className="lp-stat-label">Web & responsivo</span>
              </div>
              <div className="lp-stat">
                <span className="lp-stat-value">Multi</span>
                <span className="lp-stat-label">Tenant isolado</span>
              </div>
            </div>
          </div>

          {/* Mockup visual */}
          <div className="lp-hero-visual">
            <div className="lp-mockup">
              <div className="lp-mockup-bar">
                <div className="lp-mockup-dots">
                  <span /><span /><span />
                </div>
                <div className="lp-mockup-url">erp.itechcelulareinformatica.com.br</div>
              </div>
              <div className="lp-mockup-body">
                <div className="lp-mockup-header">
                  <span className="lp-mockup-title">Dashboard</span>
                  <span className="lp-mockup-badge">Ao vivo</span>
                </div>
                <div className="lp-mockup-cards">
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-label">OS Abertas</div>
                    <div className="lp-mockup-card-value yellow">24</div>
                  </div>
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-label">Faturamento</div>
                    <div className="lp-mockup-card-value green">R$8.420</div>
                  </div>
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-label">Clientes</div>
                    <div className="lp-mockup-card-value">341</div>
                  </div>
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-label">Estoque</div>
                    <div className="lp-mockup-card-value">187 itens</div>
                  </div>
                </div>
                <div className="lp-mockup-list">
                  {[
                    { text: 'iPhone 13 — Troca de tela', status: 'Em andamento', cls: 'inprogress', color: '#818cf8' },
                    { text: 'Samsung A54 — Placa queimada', status: 'Aguardando', cls: 'pending', color: '#f59e0b' },
                    { text: 'Motorola G84 — Troca de bateria', status: 'Concluído', cls: 'done', color: '#22c55e' },
                  ].map((row, i) => (
                    <div key={i} className="lp-mockup-row">
                      <span className="lp-mockup-row-dot" style={{ background: row.color }} />
                      <span className="lp-mockup-row-text">{row.text}</span>
                      <span className={`lp-mockup-row-status ${row.cls}`}>{row.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Modules ──────────────────────────────────────────────────────
function LandingModules() {
  return (
    <section id="modulos" className="lp-section lp-modules">
      <div className="lp-container">
        <div className="lp-modules-head">
          <span className="lp-section-label">Módulos do sistema</span>
          <h2 className="lp-section-title">Tudo que sua loja precisa, integrado</h2>
          <p className="lp-section-sub">
            Cada módulo foi desenvolvido com base nas necessidades reais de lojas de celulares e assistência técnica.
          </p>
        </div>
        <div className="lp-modules-grid">
          {MODULES.map((m) => (
            <Link
              key={m.name}
              to="/dashboard"
              className="lp-module-card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div className="lp-module-icon">{m.icon}</div>
              <p className="lp-module-name">{m.name}</p>
              <p className="lp-module-desc">{m.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ─────────────────────────────────────────────────────
function LandingFeatures() {
  const features = [
    {
      label: 'Ordens de Serviço',
      title: 'OS completa do início ao fim',
      desc: 'Abra, acompanhe e finalize ordens de serviço com histórico detalhado, peças utilizadas, fotos e status em tempo real.',
      bullets: [
        'Status personalizados: Orçamento, Aguardando, Em andamento, Pronto, Entregue',
        'QR Code único por OS para acompanhamento do cliente',
        'Impressão de ordem de serviço completa com garantia',
        'Histórico completo de movimentações e alterações',
      ],
      visual: (
        <div className="lp-feature-visual">
          <div className="lp-feature-visual-title">📋 Ordens de Serviço — Hoje</div>
          {[
            { label: 'Em andamento', pct: 75, val: '18' },
            { label: 'Aguardando', pct: 40, val: '9' },
            { label: 'Concluídas', pct: 90, val: '22' },
          ].map((b) => (
            <div key={b.label} className="lp-fv-bar-row">
              <span className="lp-fv-bar-label">{b.label}</span>
              <div className="lp-fv-bar-track">
                <div className="lp-fv-bar-fill" style={{ width: `${b.pct}%` }} />
              </div>
              <span className="lp-fv-bar-value">{b.val}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="lp-fv-pill green">✓ Garantia ativa</span>
            <span className="lp-fv-pill yellow">⏳ Peça aguardada</span>
            <span className="lp-fv-pill blue">🔧 Em reparo</span>
          </div>
        </div>
      ),
    },
    {
      label: 'Estoque',
      title: 'Controle de estoque inteligente',
      desc: 'Gerencie entradas e saídas de peças, acessórios e produtos com histórico completo e alertas de estoque mínimo.',
      bullets: [
        'Entrada e saída com movimentação registrada',
        'Alertas de estoque baixo configuráveis',
        'Vinculação de peças com as OS abertas',
        'Histórico de movimentações por produto',
      ],
      reverse: true,
      visual: (
        <div className="lp-feature-visual">
          <div className="lp-feature-visual-title">📦 Estoque — Situação atual</div>
          {[
            { label: 'Tela iPhone 13', status: 'Normal', cls: 'green', qty: '12 un.' },
            { label: 'Bateria Samsung A54', status: 'Baixo', cls: 'red', qty: '2 un.' },
            { label: 'Película 3D', status: 'Normal', cls: 'green', qty: '45 un.' },
            { label: 'Conector iPhone', status: 'Crítico', cls: 'red', qty: '0 un.' },
            { label: 'Capinha Universal', status: 'Normal', cls: 'green', qty: '28 un.' },
          ].map((r) => (
            <div key={r.label} className="lp-fv-status-row">
              <span className="lp-fv-status-label">{r.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="lp-fv-status-val" style={{ fontSize: 12, color: '#9ca3af' }}>{r.qty}</span>
                <span className={`lp-fv-pill ${r.cls}`}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: 'Financeiro',
      title: 'Visão financeira completa',
      desc: 'Acompanhe o faturamento da sua loja por mês, categorizado por tipo de receita e despesa, com gráficos e histórico.',
      bullets: [
        'Histórico financeiro mensal detalhado',
        'Separação por categorias: OS, vendas, despesas',
        'Controle de retiradas de caixa',
        'Dashboard executivo com indicadores principais',
      ],
      visual: (
        <div className="lp-feature-visual">
          <div className="lp-feature-visual-title">💰 Resumo Financeiro — Novembro</div>
          {[
            { label: 'Receita OS', pct: 80, val: 'R$6.200', color: '#22c55e' },
            { label: 'Venda Caixa', pct: 45, val: 'R$3.400', color: '#FFBE0B' },
            { label: 'Venda Aparelho', pct: 30, val: 'R$2.300', color: '#818cf8' },
          ].map((b) => (
            <div key={b.label} className="lp-fv-bar-row">
              <span className="lp-fv-bar-label">{b.label}</span>
              <div className="lp-fv-bar-track">
                <div className="lp-fv-bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
              </div>
              <span className="lp-fv-bar-value">{b.val}</span>
            </div>
          ))}
          <div className="lp-fv-status-row" style={{ marginTop: 8 }}>
            <span className="lp-fv-status-label">Total do mês</span>
            <span className="lp-fv-status-val">R$11.900</span>
          </div>
        </div>
      ),
    },
    {
      label: 'Acompanhamento Público',
      title: 'Cliente acompanha a OS pelo celular',
      desc: 'Cada ordem de serviço gera um link exclusivo com QR Code. O cliente consulta o andamento do reparo sem precisar ligar ou ir à loja.',
      bullets: [
        'Link exclusivo gerado automaticamente por OS',
        'QR Code para impressão na ordem de serviço',
        'Exibe status, equipamento e prazo estimado',
        'Dados da empresa personalizados por loja',
      ],
      reverse: true,
      visual: (
        <div className="lp-feature-visual" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📲</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Acompanhamento da OS #1042</div>
            <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
              acompanhar.itechcelulareinformatica.com.br/os/1042
            </div>
          </div>
          <div className="lp-fv-status-row">
            <span className="lp-fv-status-label">Aparelho</span>
            <span className="lp-fv-status-val" style={{ fontSize: 13 }}>iPhone 13 Pro</span>
          </div>
          <div className="lp-fv-status-row">
            <span className="lp-fv-status-label">Problema</span>
            <span className="lp-fv-status-val" style={{ fontSize: 13 }}>Troca de tela</span>
          </div>
          <div className="lp-fv-status-row">
            <span className="lp-fv-status-label">Status</span>
            <span className="lp-fv-pill blue">Em andamento</span>
          </div>
          <div className="lp-fv-status-row">
            <span className="lp-fv-status-label">Previsão</span>
            <span className="lp-fv-status-val" style={{ fontSize: 13 }}>Hoje às 17h</span>
          </div>
        </div>
      ),
    },
  ]

  return (
    <section id="funcionalidades" className="lp-section">
      <div className="lp-container">
        <span className="lp-section-label">Funcionalidades</span>
        <h2 className="lp-section-title">Feito para o dia a dia da sua loja</h2>
        <p className="lp-section-sub">
          Cada funcionalidade foi pensada para resolver problemas reais, economizar tempo e dar mais controle sobre o seu negócio.
        </p>

        <div className="lp-features-list">
          {features.map((f) => (
            <div key={f.label} className={`lp-feature-item${f.reverse ? ' reverse' : ''}`}>
              <div>
                <div className="lp-feature-label">{f.label}</div>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-desc">{f.desc}</p>
                <ul className="lp-feature-bullets">
                  {f.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
              {f.visual}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How It Works ──────────────────────────────────────────────────
function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="lp-section lp-how">
      <div className="lp-container">
        <div className="lp-how-head">
          <span className="lp-section-label">Como funciona</span>
          <h2 className="lp-section-title">Simples de usar, poderoso por dentro</h2>
          <p className="lp-section-sub">
            Em três passos você já tem o sistema funcionando e organizando sua loja.
          </p>
        </div>
        <div className="lp-steps">
          {[
            {
              num: '1',
              title: 'Cadastre sua loja',
              desc: 'Crie sua conta, configure os dados da empresa, logo e informações de contato. Pronto para usar em minutos.',
            },
            {
              num: '2',
              title: 'Registre suas OS',
              desc: 'Abra ordens de serviço, cadastre clientes e equipamentos. O sistema organiza tudo automaticamente.',
            },
            {
              num: '3',
              title: 'Gerencie e fature',
              desc: 'Acompanhe o status de cada reparo, controle o estoque e visualize o financeiro da sua loja em tempo real.',
            },
          ].map((s) => (
            <div key={s.num} className="lp-step">
              <div className="lp-step-num">{s.num}</div>
              <div>
                <p className="lp-step-title">{s.title}</p>
                <p className="lp-step-desc">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Benefits ─────────────────────────────────────────────────────
function LandingBenefits() {
  return (
    <section id="beneficios" className="lp-section">
      <div className="lp-container">
        <div className="lp-benefits-grid">
          <div className="lp-benefits-left">
            <span className="lp-section-label">Benefícios</span>
            <h2 className="lp-section-title">Chega de planilha e papel</h2>
            <p className="lp-section-sub">
              Veja a diferença entre gerenciar sua loja no modo antigo e com o iTech ERP.
            </p>
            <table className="lp-compare-table" style={{ marginTop: 32 }}>
              <thead>
                <tr>
                  <th>Situação</th>
                  <th className="bad">Sem sistema</th>
                  <th className="good">Com iTech ERP</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Controle de OS', 'Cadernos e papéis', 'Sistema digital organizado'],
                  ['Histórico de cliente', 'Difícil de localizar', 'Acesso em segundos'],
                  ['Estoque', 'Sem controle real', 'Entradas e saídas registradas'],
                  ['Financeiro', 'Planilhas manuais', 'Relatórios automáticos'],
                  ['Cliente consulta OS', 'Precisa ligar', 'Link e QR Code exclusivo'],
                  ['Acesso remoto', 'Impossível', 'De qualquer dispositivo'],
                ].map(([sit, bad, good]) => (
                  <tr key={sit}>
                    <td>{sit}</td>
                    <td className="bad">✗ {bad}</td>
                    <td className="good">✓ {good}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lp-benefit-cards">
            {[
              { icon: '⚡', title: 'Mais agilidade no atendimento', desc: 'Abra uma OS em segundos. Encontre qualquer cliente ou aparelho com uma busca rápida.' },
              { icon: '📈', title: 'Visão clara do seu negócio', desc: 'Dashboard com faturamento, OS abertas e indicadores do mês. Decisões baseadas em dados.' },
              { icon: '🔗', title: 'Cliente sempre informado', desc: 'O cliente recebe um QR Code para acompanhar a OS. Menos ligações, mais satisfação.' },
              { icon: '🏪', title: 'Isolamento por loja', desc: 'Cada loja possui seus próprios dados, usuários e configurações completamente isolados.' },
              { icon: '📲', title: 'Acesso de qualquer lugar', desc: 'Sistema 100% web. Acesse do celular, tablet ou computador, de qualquer lugar com internet.' },
            ].map((b) => (
              <div key={b.title} className="lp-benefit-card">
                <span className="lp-benefit-icon">{b.icon}</span>
                <div>
                  <p className="lp-benefit-card-title">{b.title}</p>
                  <p className="lp-benefit-card-desc">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Security ──────────────────────────────────────────────────────
function LandingSecurity() {
  return (
    <section id="seguranca" className="lp-section lp-security">
      <div className="lp-container">
        <div className="lp-security-inner">
          <div>
            <span className="lp-section-label">Segurança</span>
            <h2 className="lp-section-title">Seus dados protegidos e isolados</h2>
            <p className="lp-section-sub">
              O iTech ERP foi construído com segurança como prioridade, garantindo que os dados de cada loja fiquem completamente isolados.
            </p>
            <div className="lp-security-features">
              {[
                {
                  title: 'Isolamento multi-tenant',
                  desc: 'Cada loja possui seu próprio contexto de dados. Nenhum usuário acessa informações de outra empresa.',
                },
                {
                  title: 'Autenticação por token JWT',
                  desc: 'Sessões protegidas com tokens de autenticação. Sem dados sensíveis expostos no cliente.',
                },
                {
                  title: 'Controle de acesso por função',
                  desc: 'Defina permissões individuais: administrador com acesso total ou operador com acesso restrito.',
                },
                {
                  title: 'Banco de dados em nuvem',
                  desc: 'Dados armazenados em infraestrutura de nuvem segura com backups automáticos.',
                },
                {
                  title: 'HTTPS em todos os ambientes',
                  desc: 'Toda a comunicação entre navegador e servidor é criptografada via HTTPS.',
                },
              ].map((s) => (
                <div key={s.title} className="lp-security-item">
                  <div className="lp-security-dot" />
                  <div>
                    <p className="lp-security-item-title">{s.title}</p>
                    <p className="lp-security-item-desc">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-security-visual">
            <div className="lp-security-shield">🛡️</div>
            <p className="lp-security-visual-title">Verificações de segurança</p>
            <div className="lp-security-checks">
              {[
                'Autenticação obrigatória em todas as rotas',
                'Token validado a cada requisição',
                'Dados isolados por tenant',
                'Acesso por função (admin / operador)',
                'HTTPS em todos os ambientes',
                'Sessão expirada automaticamente',
              ].map((c) => (
                <div key={c} className="lp-security-check">
                  <div className="lp-security-check-icon">✓</div>
                  <span className="lp-security-check-text">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────
function LandingFAQ() {
  const [openIdx, setOpenIdx] = useState(null)

  return (
    <section id="faq" className="lp-section">
      <div className="lp-container">
        <div className="lp-faq-inner">
          <div>
            <span className="lp-section-label">Perguntas frequentes</span>
            <h2 className="lp-section-title">Dúvidas comuns</h2>
            <p className="lp-section-sub">
              Encontre respostas para as perguntas mais comuns sobre o iTech ERP.
            </p>
          </div>

          <div className="lp-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div
                key={i}
                className={`lp-faq-item${openIdx === i ? ' open' : ''}`}
              >
                <div
                  className="lp-faq-question"
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                >
                  {item.q}
                  <div className="lp-faq-chevron">▾</div>
                </div>
                <div className="lp-faq-answer">
                  <div className="lp-faq-answer-inner">{item.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────
function LandingCTA() {
  const { user } = useAuth()
  const destination = user ? '/dashboard' : '/login'
  const buttonLabel = user ? 'Acessar o Dashboard →' : 'Acessar o sistema →'

  return (
    <section className="lp-section lp-cta">
      <div className="lp-container">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">
            Sua loja merece um sistema profissional
          </h2>
          <p className="lp-cta-sub">
            Comece a organizar suas ordens de serviço, clientes e financeiro com o iTech ERP. Acesso imediato, sem complicação.
          </p>
          <div className="lp-cta-actions">
            <Link to={destination} className="lp-btn-primary">
              {buttonLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────
function LandingFooter({ scrollTo }) {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-top">
          <div>
            <div className="lp-nav-logo" style={{ display: 'inline-flex', marginBottom: 0 }}>
              <div className="lp-nav-logo-mark">iT</div>
              <div className="lp-nav-logo-text">iTech <span>ERP</span></div>
            </div>
            <p className="lp-footer-brand-desc">
              Sistema de gestão desenvolvido especialmente para lojas de celulares, informática e assistência técnica. Organização, controle e profissionalismo em um só lugar.
            </p>
          </div>

          <div>
            <p className="lp-footer-col-title">Sistema</p>
            <ul className="lp-footer-links">
              <li><a href="#modulos" onClick={(e) => { e.preventDefault(); scrollTo('modulos') }}>Módulos</a></li>
              <li><a href="#funcionalidades" onClick={(e) => { e.preventDefault(); scrollTo('funcionalidades') }}>Funcionalidades</a></li>
              <li><a href="#como-funciona" onClick={(e) => { e.preventDefault(); scrollTo('como-funciona') }}>Como Funciona</a></li>
              <li><a href="#seguranca" onClick={(e) => { e.preventDefault(); scrollTo('seguranca') }}>Segurança</a></li>
              <li><a href="#faq" onClick={(e) => { e.preventDefault(); scrollTo('faq') }}>FAQ</a></li>
            </ul>
          </div>

          <div>
            <p className="lp-footer-col-title">Acesso</p>
            <ul className="lp-footer-links">
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><Link to="/login">Entrar no sistema</Link></li>
              <li><Link to="/cadastro">Cadastrar loja</Link></li>
              <li><Link to="/politica-privacidade">Política de Privacidade</Link></li>
            </ul>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span className="lp-footer-copy">
            © {new Date().getFullYear()} iTech Celular e Informática. Todos os direitos reservados.
          </span>
          <span className="lp-footer-badge">
            Desenvolvido por <span>iTech</span> desde 2020
          </span>
        </div>
      </div>
    </footer>
  )
}

// ── Root Component ────────────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Usuário autenticado → redireciona ao dashboard
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  if (user) return null

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) {
      const offset = 76
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <div className="lp-root">
      <LandingNav onSectionClick={scrollTo} />
      <LandingHero scrollTo={scrollTo} />
      <LandingModules />
      <LandingFeatures />
      <LandingHowItWorks />
      <LandingBenefits />
      <LandingSecurity />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter scrollTo={scrollTo} />
    </div>
  )
}
