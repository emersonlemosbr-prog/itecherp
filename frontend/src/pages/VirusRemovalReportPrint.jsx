import { useSettings } from '../context/SettingsContext'
import React from 'react'


export function buildVirusRemovalReportHtml(reportData, settings) {
  if (!reportData || !settings) return ''
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const logo = settings.documents.logo ? settings.store.logo : ''

  const rows = Array.isArray(reportData.removedApps) ? reportData.removedApps : []

  const renderRows = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${row.appName || '—'}</td>
          <td>${row.packageName || '—'}</td>
          <td>${row.riskLevel || '—'}</td>
          <td>${row.removedAt || '—'}</td>
          <td>${row.result || '—'}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="5" style="text-align:center; color:#64748b; padding: 16px;">Nenhum aplicativo removido neste relatório.</td>
      </tr>
    `

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>Relatório de Remoção de Vírus</title>
        <style>
          body {
            margin: 0;
            padding: 24px;
            font-family: "Segoe UI", Arial, sans-serif;
            background: #fff;
            color: #0f172a;
          }
          .report-shell {
            max-width: 1000px;
            margin: 0 auto;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            border-bottom: 2px solid #1e293b;
            padding-bottom: 18px;
            margin-bottom: 20px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 20px;
          }
          .brand img {
            width: 120px;
            height: auto;
          }
          .company h1 {
            margin: 0 0 4px;
            font-size: 22px;
            letter-spacing: -0.04em;
            text-transform: lowercase;
          }
          .company p {
            margin: 2px 0;
            font-size: 12px;
            color: #475569;
          }
          .title-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 12px 16px;
            text-align: right;
            min-width: 180px;
          }
          .label {
            display: block;
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.14em;
          }
          .report-number {
            margin-top: 6px;
            font-size: 28px;
            font-weight: 800;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px 24px;
            margin: 18px 0 16px;
          }
          .info-box {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px 14px;
            background: #f8fafc;
          }
          .info-box strong {
            display: block;
            font-size: 11px;
            color: #64748b;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 6px;
          }
          .info-box span {
            font-size: 15px;
            font-weight: 600;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin: 20px 0;
          }
          .stat {
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            background: #ffffff;
            padding: 12px;
          }
          .stat label {
            display: block;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #64748b;
            margin-bottom: 6px;
          }
          .stat strong {
            font-size: 24px;
            color: #0f172a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 18px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 10px 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f8fafc;
            color: #334155;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 10px;
          }
          .muted {
            color: #64748b;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="report-shell">
          <header class="header">
            <div class="brand">
              <img src="${logo}" alt="iTech Celular e Informática" />
              <div class="company">
                <h1>${settings.documents.name ? escape(settings.store.name) : ""}</h1>
                <p>Relatório de remoção de vírus / aplicativos</p>
                <p>Atendimento técnico e diagnostico Android</p>
              </div>
            </div>
            <div class="title-box">
              <span class="label">Relatório</span>
              <div class="report-number">#${reportData.orderNumber || 'OS'}</div>
            </div>
          </header>

          <div class="summary-grid">
            <div class="info-box">
              <strong>Ordem de Serviço</strong>
              <span>${reportData.orderNumber || 'Sem vínculo'}</span>
            </div>
            <div class="info-box">
              <strong>Cliente</strong>
              <span>${reportData.customerName || 'Não informado'}</span>
            </div>
            <div class="info-box">
              <strong>Aparelho</strong>
              <span>${reportData.deviceModel || 'Não informado'}</span>
            </div>
            <div class="info-box">
              <strong>Android</strong>
              <span>${reportData.androidVersion || 'N/D'}</span>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <label>Analisados</label>
              <strong>${reportData.totalApps ?? 0}</strong>
            </div>
            <div class="stat">
              <label>Selecionados</label>
              <strong>${reportData.selectedCount ?? 0}</strong>
            </div>
            <div class="stat">
              <label>Removidos</label>
              <strong>${reportData.removedCount ?? 0}</strong>
            </div>
            <div class="stat">
              <label>Falhas</label>
              <strong>${reportData.failedCount ?? 0}</strong>
            </div>
          </div>

          <div class="info-box" style="margin-top: 12px; margin-bottom: 12px;">
            <strong>Dados do aparelho</strong>
            <span>Fabricante: ${reportData.deviceManufacturer || 'N/D'} · Modelo: ${reportData.deviceModel || 'N/D'} · Android: ${reportData.androidVersion || 'N/D'} · Data da análise: ${reportData.analysisDate || 'N/D'}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Aplicativo</th>
                <th>Package</th>
                <th>Nível de risco</th>
                <th>Data/hora da remoção</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              ${renderRows}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `
}

export default function VirusRemovalReportPrint({ reportData }) {
  const { settings } = useSettings()
  const logo = settings.documents.logo ? settings.store.logo : ""
  if (!reportData) return null

  const rows = Array.isArray(reportData.removedApps) ? reportData.removedApps : []

  return (
    <div className="virus-removal-report-print hidden print:block">
      <div className="virus-removal-report-sheet">
        <header className="virus-removal-report-header">
          <div className="virus-removal-report-brand">
            <img src={logo} alt="iTech Celular e Informática" />
            <div>
              <h1>{settings.documents.name && settings.store.name}</h1>
              <p>Relatório de remoção de vírus / aplicativos</p>
            </div>
          </div>
          <div className="virus-removal-report-number-box">
            <span>Relatório</span>
            <strong>#{reportData.orderNumber || 'OS'}</strong>
          </div>
        </header>

        <div className="virus-removal-report-grid">
          <div><strong>Ordem de Serviço</strong><p>{reportData.orderNumber || 'Sem vínculo'}</p></div>
          <div><strong>Cliente</strong><p>{reportData.customerName || 'Não informado'}</p></div>
          <div><strong>Aparelho</strong><p>{reportData.deviceModel || 'Não informado'}</p></div>
          <div><strong>Android</strong><p>{reportData.androidVersion || 'N/D'}</p></div>
        </div>

        <div className="virus-removal-report-stats">
          <div><label>Analisados</label><strong>{reportData.totalApps ?? 0}</strong></div>
          <div><label>Selecionados</label><strong>{reportData.selectedCount ?? 0}</strong></div>
          <div><label>Removidos</label><strong>{reportData.removedCount ?? 0}</strong></div>
          <div><label>Falhas</label><strong>{reportData.failedCount ?? 0}</strong></div>
        </div>

        <div className="virus-removal-report-device">
          Fabricante: {reportData.deviceManufacturer || 'N/D'} · Modelo: {reportData.deviceModel || 'N/D'} · Android: {reportData.androidVersion || 'N/D'} · Data da análise: {reportData.analysisDate || 'N/D'}
        </div>

        <table className="virus-removal-report-table">
          <thead>
            <tr>
              <th>Aplicativo</th>
              <th>Package</th>
              <th>Nível de risco</th>
              <th>Data/hora da remoção</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`${row.packageName}-${row.removedAt}`}>
                <td>{row.appName || '—'}</td>
                <td>{row.packageName || '—'}</td>
                <td>{row.riskLevel || '—'}</td>
                <td>{row.removedAt || '—'}</td>
                <td>{row.result || '—'}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="5" className="virus-removal-report-empty">Nenhum aplicativo removido.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
