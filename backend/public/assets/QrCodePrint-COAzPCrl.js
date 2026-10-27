import{j as r}from"./charts-D31P4tdL.js";import{u as d,a as p}from"./index-BJEOvneB.js";import{h as c,c as h,r as i,L as o}from"./vendor-BV7iRXzh.js";import{Q as x}from"./index-CpJ4LJOr.js";import{y as f,s as u}from"./icons-BSaRxgXp.js";function v(){const{settings:n}=d(),{id:a}=c(),{state:t}=h(),[e,m]=i.useState(null);if(i.useEffect(()=>(document.title=`QR Code ${(e==null?void 0:e.order_number)||""}`.trim()||"QR Code",()=>{document.title=`${n.store.name} — Painel`}),[e==null?void 0:e.order_number]),i.useEffect(()=>{p.get(`/service-orders/${a}`).then(l=>m(l.data))},[a]),!e)return r.jsx("div",{className:"text-slate-400 text-sm",children:"Carregando..."});const s=(t==null?void 0:t.orderId)===a?t==null?void 0:t.trackingUrl:null;return s?r.jsxs("div",{children:[r.jsxs("div",{className:"no-print flex items-center justify-between mb-4 max-w-md mx-auto",children:[r.jsxs(o,{to:`/ordens/${a}`,className:"inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600",children:[r.jsx(f,{size:15})," Voltar"]}),r.jsxs("button",{className:"btn-primary",onClick:()=>window.print(),children:[r.jsx(u,{size:16})," Imprimir QR Code"]})]}),r.jsx("div",{className:"qr-thermal-print-wrapper no-print",children:r.jsxs("div",{id:"qr-thermal-print-area",className:"qr-thermal-print-area",children:[r.jsx("div",{className:"qr-thermal-header",children:n.store.name}),r.jsxs("div",{className:"qr-thermal-order",children:["OS: ",r.jsx("strong",{children:e.order_number})]}),r.jsx("div",{className:"qr-thermal-qrcode-wrap",children:r.jsx(x,{value:s,size:118})}),r.jsx("div",{className:"qr-thermal-caption",children:"Escaneie para acompanhar o status do seu reparo"}),r.jsxs("div",{className:"qr-thermal-meta",children:["Cliente: ",e.first_name," ",e.last_name]}),r.jsxs("div",{className:"qr-thermal-meta",children:["Aparelho: ",e.brand," ",e.model]})]})}),r.jsx("style",{children:`
        .qr-thermal-print-wrapper {
          display: flex;
          justify-content: center;
          padding: 16px 0;
        }

        .qr-thermal-print-area {
          width: min(76mm, 100%);
          background: #fff;
          color: #111827;
          padding: 10px 8px 12px;
          text-align: center;
          font-family: Arial, Helvetica, sans-serif;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        }

        .qr-thermal-header {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: lowercase;
          margin-bottom: 8px;
        }

        .qr-thermal-order {
          font-size: 12px;
          margin-bottom: 10px;
          font-weight: 600;
        }

        .qr-thermal-order strong {
          font-size: 14px;
        }

        .qr-thermal-qrcode-wrap {
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 0 auto 8px;
          width: 100%;
        }

        .qr-thermal-caption {
          font-size: 10px;
          line-height: 1.4;
          margin-bottom: 10px;
          color: #334155;
        }

        .qr-thermal-meta {
          font-size: 10px;
          line-height: 1.45;
          color: #1f2937;
          word-break: break-word;
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html, body {
            margin: 0 !important;
            background: #fff !important;
          }

          body * { visibility: hidden; }
          #qr-thermal-print-area, #qr-thermal-print-area * { visibility: visible; }
          #qr-thermal-print-area {
            position: static !important;
            width: 76mm !important;
            max-width: 76mm !important;
            margin: 0 auto !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .no-print { display: none !important; }
          .qr-thermal-print-wrapper {
            display: block !important;
            padding: 0 !important;
          }
        }
      `})]}):r.jsx(o,{to:`/ordens/${a}`,children:"Volte ? OS e gere um acompanhamento para imprimir."})}export{v as default};
