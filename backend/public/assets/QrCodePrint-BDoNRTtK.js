import{j as e}from"./charts-Bqlh1lA2.js";import{k as X,e as Y,r as s,L as d}from"./vendor-BZWwEm0I.js";import{Q as Z}from"./index-BdA-0iGM.js";import{u as ee,a as re}from"./index-CjCccciA.js";import{y as l,s as te}from"./icons-pA1gMG0B.js";function me(){var q,v,w,j,k,N,y,z,S,$,C,_;const{settings:r}=ee(),{id:n}=X(),{state:t}=Y(),[a,E]=s.useState(null),[O,p]=s.useState(!0),[x,h]=s.useState(""),[m,A]=s.useState(()=>{try{return localStorage.getItem("itech_qr_paper_width")||"80mm"}catch{return"80mm"}}),f=o=>{A(o);try{localStorage.setItem("itech_qr_paper_width",o)}catch{}},[u,I]=s.useState(()=>{if((t==null?void 0:t.orderId)===n&&(t!=null&&t.trackingUrl))return t.trackingUrl;try{return sessionStorage.getItem(`tracking_url_${n}`)||""}catch{return""}});if(s.useEffect(()=>{if(t!=null&&t.trackingUrl&&(t==null?void 0:t.orderId)===n){I(t.trackingUrl);try{sessionStorage.setItem(`tracking_url_${n}`,t.trackingUrl)}catch{}}},[t,n]),s.useEffect(()=>{let o=!0;return p(!0),re.get(`/service-orders/${n}`).then(i=>{o&&(E(i.data),h(""))}).catch(i=>{o&&(console.error("Erro ao carregar OS para impressão:",i),h("Não foi possível carregar os dados da ordem de serviço."))}).finally(()=>{o&&p(!1)}),()=>{o=!1}},[n]),s.useEffect(()=>{const o=(a==null?void 0:a.order_number)||n;return document.title=`Comprovante OS ${o}`,()=>{var i,P;document.title=`${((i=r==null?void 0:r.store)==null?void 0:i.trade_name)||((P=r==null?void 0:r.store)==null?void 0:P.name)||"iTech"} — Painel`}},[a==null?void 0:a.order_number,n,r]),O)return e.jsx("div",{className:"flex items-center justify-center min-h-[50vh]",children:e.jsx("p",{className:"text-slate-400 text-sm",children:"Carregando dados do comprovante..."})});if(x||!a)return e.jsxs("div",{className:"card max-w-md mx-auto p-6 text-center space-y-4",children:[e.jsx("p",{className:"text-slate-700 dark:text-slate-200 text-sm font-medium",children:x||"Ordem de serviço não encontrada."}),e.jsxs(d,{to:"/ordens",className:"btn-secondary inline-flex items-center gap-1.5 text-xs",children:[e.jsx(l,{size:15})," Voltar para Ordens"]})]});if(!u)return e.jsxs("div",{className:"card max-w-md mx-auto p-6 text-center space-y-4",children:[e.jsx("p",{className:"text-slate-700 dark:text-slate-200 text-sm font-medium",children:"Nenhum link de acompanhamento ativo para esta Ordem de Serviço."}),e.jsx("p",{className:"text-xs text-slate-500",children:'Abra os detalhes da OS e clique em "Gerar acompanhamento" antes de imprimir o comprovante.'}),e.jsxs(d,{to:`/ordens/${n}`,className:"btn-primary inline-flex items-center gap-1.5 text-xs font-semibold",children:[e.jsx(l,{size:15})," Voltar à OS e gerar acompanhamento"]})]});const L=((q=r==null?void 0:r.store)==null?void 0:q.trade_name)||"iTech Celular e Informática",T=((v=r==null?void 0:r.store)==null?void 0:v.cnpj)||"58.710.025/0001-69",U=((w=r==null?void 0:r.store)==null?void 0:w.street)||"Av. Ananias Fernandes dos Santos",B=(j=r==null?void 0:r.store)!=null&&j.number?`, ${r.store.number}`:(k=r==null?void 0:r.store)!=null&&k.street?"":", 231",R=(N=r==null?void 0:r.store)!=null&&N.district?` - ${r.store.district}`:(y=r==null?void 0:r.store)!=null&&y.street?"":" - Centro",D=`${U}${B}${R}`.trim(),H=((z=r==null?void 0:r.store)==null?void 0:z.city)||"Canindé de São Francisco",M=((S=r==null?void 0:r.store)==null?void 0:S.state)||"SE",Q=(($=r==null?void 0:r.store)==null?void 0:$.zip)||"49820-000",V=`${H}/${M} - CEP ${Q}`,b=o=>{if(!o)return"";const i=String(o).replace(/\D/g,"");return i.length===11?`(${i.slice(0,2)}) ${i.slice(2,7)}-${i.slice(7)}`:i.length===10?`(${i.slice(0,2)}) ${i.slice(2,6)}-${i.slice(6)}`:o},c=b((C=r==null?void 0:r.store)==null?void 0:C.phone)||"(79) 98135-1174",g=b((_=r==null?void 0:r.store)==null?void 0:_.secondary_phone)||"(79) 98140-9039",F=c!==g?`Telefones: ${c} | ${g}`:`Telefones: ${c}`,G=a.order_number||String(n),W=[a.first_name,a.last_name].filter(Boolean).join(" ").trim()||a.customer_name_snapshot||"Cliente não identificado",J=[a.brand,a.model].filter(Boolean).join(" ").trim()||"Aparelho não especificado",K=m==="58mm"?116:132;return e.jsxs("div",{className:"qr-receipt-page",children:[e.jsxs("div",{className:"no-print max-w-xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#1E1E1E] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm",children:[e.jsxs(d,{to:`/ordens/${n}`,className:"inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-zinc-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors",children:[e.jsx(l,{size:16})," Voltar à OS"]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-xs font-semibold text-slate-500 dark:text-zinc-400",children:"Bobina:"}),e.jsxs("div",{className:"inline-flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-1 border border-slate-200 dark:border-zinc-700",children:[e.jsx("button",{type:"button",onClick:()=>f("80mm"),className:`px-3 py-1 text-xs font-medium rounded-lg transition-all ${m==="80mm"?"bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold":"text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"}`,title:"Bobina padrão de 80mm (largura útil 72mm)",children:"80 mm (Padrão)"}),e.jsx("button",{type:"button",onClick:()=>f("58mm"),className:`px-3 py-1 text-xs font-medium rounded-lg transition-all ${m==="58mm"?"bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm font-semibold":"text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"}`,title:"Bobina estreita de 58mm (largura útil 48mm)",children:"58 mm"})]})]}),e.jsxs("button",{type:"button",className:"btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold shadow-sm",onClick:()=>window.print(),children:[e.jsx(te,{size:16})," Imprimir comprovante"]})]}),e.jsx("div",{className:"qr-thermal-preview-container",children:e.jsxs("div",{id:"qr-thermal-print-area",className:`qr-thermal-receipt ${m==="58mm"?"receipt-58mm":"receipt-80mm"}`,children:[e.jsxs("div",{className:"qr-receipt-header",children:[e.jsx("div",{className:"qr-receipt-store-name",children:L}),e.jsxs("div",{className:"qr-receipt-store-info",children:["CNPJ: ",T]}),e.jsx("div",{className:"qr-receipt-store-info",children:D}),e.jsx("div",{className:"qr-receipt-store-info",children:V}),e.jsx("div",{className:"qr-receipt-store-info",children:F})]}),e.jsx("div",{className:"qr-receipt-divider"}),e.jsxs("div",{className:"qr-receipt-body",children:[e.jsx("div",{className:"qr-receipt-title",children:"ACOMPANHAMENTO DO REPARO"}),e.jsxs("div",{className:"qr-receipt-os",children:["OS: ",e.jsx("strong",{children:G})]}),e.jsxs("div",{className:"qr-receipt-meta-line",children:[e.jsx("strong",{children:"Cliente:"})," ",W]}),e.jsxs("div",{className:"qr-receipt-meta-line",children:[e.jsx("strong",{children:"Aparelho:"})," ",J]})]}),e.jsxs("div",{className:"qr-receipt-qrcode-wrap",children:[e.jsx("div",{className:"qr-receipt-qrcode-box",children:e.jsx(Z,{value:u,size:K,level:"M",marginSize:2,fgColor:"#000000",bgColor:"#ffffff"})}),e.jsx("div",{className:"qr-receipt-caption",children:"Escaneie para acompanhar o status do seu reparo"})]}),e.jsx("div",{className:"qr-receipt-divider"}),e.jsxs("div",{className:"qr-receipt-footer",children:[e.jsx("p",{className:"qr-receipt-footer-line",children:"Guarde este comprovante para consultar o andamento do serviço."}),e.jsx("p",{className:"qr-receipt-footer-line",children:"Dúvidas? Entre em contato pelos telefones acima."})]})]})}),e.jsx("style",{children:`
        .qr-receipt-page {
          width: 100%;
        }

        .qr-thermal-preview-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 8px 0 32px;
          width: 100%;
        }

        /* Base receipt container (Screen preview) */
        .qr-thermal-receipt {
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
          text-align: center;
          box-sizing: border-box;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
          transition: width 0.2s ease;
        }

        .qr-thermal-receipt.receipt-80mm {
          width: 72mm;
          max-width: 72mm;
          padding: 5mm 3mm 6mm;
        }

        .qr-thermal-receipt.receipt-58mm {
          width: 48mm;
          max-width: 48mm;
          padding: 3mm 2mm 5mm;
        }

        /* 1. Header Typography */
        .qr-receipt-header {
          text-align: center;
          margin: 0;
          padding: 0;
        }

        .qr-receipt-store-name {
          font-size: 13.5px;
          font-weight: 800;
          line-height: 1.25;
          color: #000000;
          margin-bottom: 3px;
          word-break: break-word;
        }
        .receipt-58mm .qr-receipt-store-name {
          font-size: 11.5px;
          margin-bottom: 2px;
        }

        .qr-receipt-store-info {
          font-size: 9.5px;
          line-height: 1.35;
          color: #000000;
          margin: 1px 0;
          word-break: break-word;
        }
        .receipt-58mm .qr-receipt-store-info {
          font-size: 8.5px;
          line-height: 1.28;
        }

        /* Dividers */
        .qr-receipt-divider {
          border-top: 1px dashed #000000;
          margin: 6px 0;
          width: 100%;
        }
        .receipt-58mm .qr-receipt-divider {
          margin: 5px 0;
        }

        /* 2. OS Section */
        .qr-receipt-body {
          text-align: center;
        }

        .qr-receipt-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #000000;
          line-height: 1.3;
          margin-bottom: 3px;
        }
        .receipt-58mm .qr-receipt-title {
          font-size: 9.5px;
          letter-spacing: 0.02em;
        }

        .qr-receipt-os {
          font-size: 12px;
          font-weight: 600;
          color: #000000;
          margin-bottom: 3px;
        }
        .qr-receipt-os strong {
          font-size: 14px;
          font-weight: 800;
        }
        .receipt-58mm .qr-receipt-os {
          font-size: 11px;
        }
        .receipt-58mm .qr-receipt-os strong {
          font-size: 12.5px;
        }

        .qr-receipt-meta-line {
          font-size: 10px;
          line-height: 1.35;
          color: #000000;
          margin: 1px 0;
          word-break: break-word;
        }
        .qr-receipt-meta-line strong {
          font-weight: 700;
        }
        .receipt-58mm .qr-receipt-meta-line {
          font-size: 9px;
          line-height: 1.28;
        }

        /* 3. QR Code */
        .qr-receipt-qrcode-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 5px auto 3px;
          width: 100%;
        }

        .qr-receipt-qrcode-box {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px;
          background: #ffffff;
        }

        .qr-receipt-caption {
          font-size: 9.5px;
          line-height: 1.3;
          color: #000000;
          margin-top: 5px;
          max-width: 92%;
          word-break: break-word;
          font-weight: 500;
        }
        .receipt-58mm .qr-receipt-caption {
          font-size: 8.5px;
          line-height: 1.25;
          max-width: 96%;
        }

        /* 4. Footer */
        .qr-receipt-footer {
          font-size: 9px;
          line-height: 1.35;
          color: #000000;
          word-break: break-word;
          text-align: center;
        }
        .receipt-58mm .qr-receipt-footer {
          font-size: 8px;
          line-height: 1.28;
        }
        .qr-receipt-footer-line {
          margin: 2px 0;
        }

        /* 5. Requisitos de Impressão Térmica (@media print) */
        @media print {
          @page {
            size: ${m==="58mm"?"58mm auto":"80mm auto"};
            margin: 0mm !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            width: 100% !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide everything in page by default */
          body * {
            visibility: hidden !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Show only the thermal print area and its elements */
          #qr-thermal-print-area,
          #qr-thermal-print-area * {
            visibility: visible !important;
          }

          .qr-receipt-page,
          .qr-thermal-preview-container {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }

          #qr-thermal-print-area {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            margin: 0 auto !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          #qr-thermal-print-area.receipt-80mm {
            width: 72mm !important;
            max-width: 72mm !important;
            padding: 2mm 1mm 4mm 1mm !important;
          }

          #qr-thermal-print-area.receipt-58mm {
            width: 48mm !important;
            max-width: 48mm !important;
            padding: 2mm 1mm 3mm 1mm !important;
          }

          .qr-receipt-header,
          .qr-receipt-body,
          .qr-receipt-qrcode-wrap,
          .qr-receipt-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `})]})}export{me as default};
