import React from 'react'
import { Link } from 'react-router-dom'
import { Shield, ArrowLeft, Mail, Phone, MapPin, Building2, CheckCircle2, FileText } from 'lucide-react'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm tracking-wide uppercase">
              <Shield size={18} />
              <span>Privacidade e Proteção de Dados</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">POLÍTICA DE PRIVACIDADE</h1>
            <p className="text-xs text-slate-400">iTech ERP — Última atualização: 07 de novembro de 2026</p>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all self-start sm:self-center"
          >
            <ArrowLeft size={14} />
            Voltar ao Login
          </Link>
        </div>

        {/* Conteúdo Estruturado */}
        <div className="space-y-8 text-sm leading-relaxed text-slate-300">
          
          {/* Seção 1 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">1</span>
              QUEM SOMOS
            </h2>
            <p>
              O <strong>iTech ERP</strong> é uma plataforma de gestão empresarial desenvolvida e operada pela empresa <strong>iTech Celular e Informática</strong>, que também atua no segmento de manutenção de celulares, computadores e comercialização de acessórios.
            </p>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-amber-400">Responsável pela plataforma:</p>
              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                <div className="flex items-start gap-2">
                  <Building2 size={15} className="text-slate-500 shrink-0 mt-0.5" />
                  <span><strong>Nome fantasia:</strong> iTech Celular e Informática<br/><strong>CNPJ:</strong> 58.710.025/0001-69</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={15} className="text-slate-500 shrink-0 mt-0.5" />
                  <span>Avenida Ananias Fernandes dos Santos, nº 231, Centro, Canindé de São Francisco, Sergipe, CEP 49820-000.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={15} className="text-slate-500 shrink-0" />
                  <span><strong>E-mail:</strong> <a href="mailto:itechcelulareinformatica@gmail.com" className="text-amber-400 hover:underline">itechcelulareinformatica@gmail.com</a></span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={15} className="text-slate-500 shrink-0" />
                  <span><strong>Telefones:</strong> (79) 98135-1174 / (79) 98140-9039</span>
                </div>
              </div>
            </div>
            <p>
              Esta Política de Privacidade explica como tratamos dados pessoais de usuários, administradores, funcionários e demais pessoas que interagem com o iTech ERP. O tratamento de dados pessoais é realizado em conformidade com a <strong>Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD)</strong>, observadas as demais normas aplicáveis.
            </p>
          </section>

          {/* Seção 2 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">2</span>
              NOSSO COMPROMISSO COM A PRIVACIDADE
            </h2>
            <p>O iTech ERP busca respeitar a privacidade e proteger os dados pessoais tratados por meio da plataforma. Adotamos como princípios fundamentais:</p>
            <ul className="grid sm:grid-cols-2 gap-2 pt-2 text-xs">
              {[
                'Coletar somente os dados necessários para as finalidades informadas.',
                'Utilizar os dados de maneira transparente e legítima.',
                'Restringir o acesso às informações conforme as permissões de cada usuário.',
                'Adotar medidas técnicas e administrativas de segurança.',
                'Não comercializar dados pessoais dos usuários sob qualquer hipótese.',
                'Respeitar integralmente os direitos previstos na LGPD.',
              ].map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/50">
                  <CheckCircle2 size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Seção 3 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">3</span>
              QUAIS DADOS PODEMOS COLETAR
            </h2>
            <p>Os dados tratados variam conforme o tipo de utilização da plataforma:</p>
            
            <div className="space-y-3 text-xs">
              <div className="bg-slate-950/60 border border-slate-800/70 p-4 rounded-xl space-y-1.5">
                <h3 className="font-bold text-amber-400 text-sm">3.1. Dados dos responsáveis pelas lojas</h3>
                <p>Durante o cadastro e utilização do sistema, podemos tratar: Nome completo, E-mail, Telefone, Nome da empresa ou estabelecimento, CNPJ ou CPF (quando necessário), Informações de acesso à conta, Dados relacionados ao plano contratado e à assinatura, Histórico de pagamentos e cobranças, e Registros de acesso e atividades administrativas.</p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/70 p-4 rounded-xl space-y-1.5">
                <h3 className="font-bold text-amber-400 text-sm">3.2. Dados de funcionários e colaboradores</h3>
                <p>Quando uma loja cadastra seus funcionários, podem ser tratados: Nome, Nome de usuário, Informações de autenticação, Senha armazenada em formato protegido por hash, Permissões de acesso e Registros de atividades realizadas no sistema. <em>A loja contratante é responsável por assegurar que possui fundamento legal para cadastrar e utilizar os dados de seus colaboradores.</em></p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/70 p-4 rounded-xl space-y-1.5">
                <h3 className="font-bold text-amber-400 text-sm">3.3. Dados dos clientes das lojas</h3>
                <p>O iTech ERP permite que cada estabelecimento registre informações necessárias à prestação de seus serviços (Nome do cliente, Telefone/WhatsApp, CPF/CNPJ, Endereço, Aparelhos, Histórico de OS, Fotos e Garantias). A senha de desbloqueio de aparelhos, quando cadastrada, recebe tratamento especial com criptografia AES-256-GCM.</p>
                <p className="text-amber-300/90 pt-1"><strong>Importante:</strong> os dados dos clientes cadastrados pelas lojas pertencem ao contexto de atendimento e operação de cada estabelecimento. A loja é, em regra, responsável por definir as finalidades e os meios desse tratamento (Controladora), enquanto o iTech ERP atua como operador quando processa essas informações seguindo as instruções da loja.</p>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/70 p-4 rounded-xl space-y-1.5">
                <h3 className="font-bold text-amber-400 text-sm">3.4. Dados de navegação e utilização</h3>
                <p>Podemos tratar informações técnicas necessárias ao funcionamento e à segurança da plataforma (Endereço IP, data/hora, navegador/dispositivo, registros de erros e identificadores de sessão). <strong>Não utilizamos essas informações para criar perfis publicitários dos usuários.</strong></p>
              </div>
            </div>
          </section>

          {/* Seção 4 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">4</span>
              PARA QUE UTILIZAMOS OS DADOS
            </h2>
            <p>Os dados pessoais podem ser utilizados para:</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {[
                'Criar e administrar contas de usuários e estabelecimentos.',
                'Realizar autenticação e controle de acesso.',
                'Disponibilizar as funcionalidades do sistema.',
                'Gerenciar planos, assinaturas e pagamentos.',
                'Permitir o gerenciamento de clientes e ordens de serviço pelas lojas.',
                'Disponibilizar acompanhamento público de ordens de serviço por meio de links individuais.',
                'Enviar comunicações operacionais necessárias ao funcionamento do serviço.',
                'Recuperar senhas e proteger contas.',
                'Armazenar fotografias e documentos vinculados às operações.',
                'Prevenir fraudes, acessos indevidos e atividades não autorizadas.',
                'Realizar manutenção, diagnóstico e correção de falhas.',
                'Cumprir obrigações legais e regulatórias.',
                'Atender solicitações de titulares e autoridades competentes.',
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 pt-1">Os dados não serão utilizados para finalidades incompatíveis com aquelas informadas, respeitadas as hipóteses legais de tratamento.</p>
          </section>

          {/* Seção 5 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">5</span>
              BASES LEGAIS PARA O TRATAMENTO
            </h2>
            <p>O tratamento de dados pessoais poderá ocorrer com fundamento nas bases legais previstas na LGPD (Art. 7º e 11):</p>
            <ul className="space-y-2 text-xs">
              <li><strong>• Execução de contrato:</strong> para fornecer as funcionalidades contratadas e administrar a relação comercial.</li>
              <li><strong>• Cumprimento de obrigação legal ou regulatória:</strong> para atender exigências fiscais, contábeis e outras obrigações aplicáveis.</li>
              <li><strong>• Exercício regular de direitos:</strong> para preservar e exercer direitos em processos administrativos, judiciais ou arbitrais.</li>
              <li><strong>• Legítimo interesse:</strong> quando aplicável, mediante avaliação de necessidade, proporcionalidade e respeito aos direitos dos titulares.</li>
              <li><strong>• Consentimento:</strong> quando necessário e adequado à finalidade específica, mediante manifestação livre, informada e inequívoca.</li>
            </ul>
            <p className="text-xs text-slate-400">Nem toda operação depende de consentimento. Quando outra base legal for aplicável, o tratamento poderá ocorrer independentemente de uma caixa de autorização.</p>
          </section>

          {/* Seção 6 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">6</span>
              COMPARTILHAMENTO DE DADOS
            </h2>
            <p><strong>O iTech ERP não comercializa dados pessoais.</strong> Entretanto, poderá compartilhar informações estritamente necessárias com fornecedores e prestadores de serviços envolvidos na operação da plataforma:</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <strong className="text-amber-400">Google Identity Services</strong>
                <p className="text-slate-400 mt-1">Utilizado para autenticação por conta Google, quando essa funcionalidade estiver disponível e for utilizada pelo usuário.</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <strong className="text-amber-400">Cloudinary</strong>
                <p className="text-slate-400 mt-1">Serviço utilizado para armazenamento e gerenciamento de fotografias e imagens vinculadas às operações do sistema.</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <strong className="text-amber-400">Cloudflare e Armazenamento S3</strong>
                <p className="text-slate-400 mt-1">Utilizados na infraestrutura, segurança, túneis reversos, distribuição e armazenamento de arquivos.</p>
              </div>
              <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                <strong className="text-amber-400">Serviços de Banco de Dados e E-mail</strong>
                <p className="text-slate-400 mt-1">Utilizados para manter a aplicação, processar requisições, recuperação de senha e notificações operacionais.</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">Também poderá ocorrer compartilhamento quando exigido por lei, para proteger direitos/segurança ou prevenir fraudes.</p>
          </section>

          {/* Seções 7 a 10 */}
          <div className="grid sm:grid-cols-2 gap-4">
            <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">7</span>
                TRANSFERÊNCIA INTERNACIONAL
              </h2>
              <p className="text-xs">Quando houver transferência internacional decorrente de fornecedores em nuvem (ex: Google, Cloudflare, Cloudinary), ela observará as diretrizes da LGPD e regulamentações da ANPD, garantindo salvaguardas contratuais adequadas de segurança.</p>
            </section>

            <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">8</span>
                ARMAZENAMENTO E SEGURANÇA
              </h2>
              <p className="text-xs">Adotamos criptografia AES-256-GCM para senhas de aparelhos, hash seguro em senhas de usuários, isolamento multi-tenant por loja, tokens de 256 bits para links públicos de OS e controle estrito de permissões.</p>
            </section>

            <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">9</span>
                ACOMPANHAMENTO PÚBLICO
              </h2>
              <p className="text-xs">Permite ao cliente acompanhar sua OS por link individual com identificador opaco sem login. Informações sensíveis (como senhas de tela e valores financeiros confidenciais) nunca são expostas nesta página.</p>
            </section>

            <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">10</span>
                COOKIES E ARMAZENAMENTO
              </h2>
              <p className="text-xs">O sistema utiliza tokens no <code>localStorage</code> do navegador para manter sessões técnicas de login. Não utilizamos cookies HTTP de rastreamento publicitário nem ferramentas de perfilamento.</p>
            </section>
          </div>

          {/* Seção 11 e 12 */}
          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">11</span>
              PRAZO DE ARMAZENAMENTO E DESCARTE
            </h2>
            <p className="text-xs">
              Os dados pessoais serão mantidos pelo período necessário ao cumprimento de suas finalidades. O armazenamento poderá continuar após o encerramento do contrato quando houver necessidade de cumprimento de obrigações legais/fiscais (ex: prazos de garantia e guarda documental do CDC e Código Civil), exercício regular de direitos e prevenção a fraudes.
            </p>
          </section>

          <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs">12</span>
              DIREITOS DOS TITULARES (LGPD)
            </h2>
            <p className="text-xs">Nos termos do artigo 18 da LGPD, você poderá solicitar:</p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {[
                'Confirmação da existência de tratamento.',
                'Acesso aos seus dados pessoais.',
                'Correção de dados incompletos ou desatualizados.',
                'Anonimização, bloqueio ou eliminação de dados excessivos.',
                'Portabilidade dos dados a outro fornecedor.',
                'Eliminação dos dados tratados com base em consentimento.',
                'Informação sobre entidades com as quais houve compartilhamento.',
                'Revogação do consentimento concedido.',
              ].map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                  <CheckCircle2 size={13} className="text-amber-400 shrink-0" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Seção 13: Exercício dos Direitos */}
          <section className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">13</span>
              COMO EXERCER SEUS DIREITOS
            </h2>
            <p className="text-xs text-slate-200">
              Para exercer seus direitos de confirmação, acesso, correção, anonimização ou exclusão, entre em contato direto pelo canal:
            </p>
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-white">Canal de Atendimento ao Titular de Dados:</p>
                <a href="mailto:itechcelulareinformatica@gmail.com?subject=Solicitação%20LGPD%20—%20Dados%20pessoais" className="text-amber-400 hover:underline">
                  itechcelulareinformatica@gmail.com
                </a>
                <p className="text-[11px] text-slate-400 mt-0.5">Assunto sugerido: <em>Solicitação LGPD — Dados pessoais</em></p>
              </div>
              <a
                href="mailto:itechcelulareinformatica@gmail.com?subject=Solicitação%20LGPD%20—%20Dados%20pessoais"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all"
              >
                Enviar Solicitação
              </a>
            </div>
            <p className="text-[11px] text-slate-400">
              <strong>Nota aos clientes das lojas:</strong> Caso você seja cliente final de uma assistência técnica usuária do iTech ERP, procure inicialmente a loja responsável pelo seu atendimento (Controladora). O iTech ERP atua como operador e prestará todo o suporte técnico necessário à loja para viabilizar o atendimento.
            </p>
          </section>

          {/* Seções 14 a 18 */}
          <div className="space-y-4 text-xs">
            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-1">
              <h3 className="font-bold text-white text-sm">14. Responsabilidades das Lojas Contratantes</h3>
              <p>Cada loja usuária do iTech ERP é autônoma e responsável pela regularidade dos dados que cadastra de seus clientes e colaboradores, devendo utilizar bases legais idôneas e atender seus respectivos clientes.</p>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-1">
              <h3 className="font-bold text-white text-sm">15. Dados de Crianças e Adolescentes</h3>
              <p>O iTech ERP destina-se ao ambiente corporativo. Caso a loja registre dados de menores em ordens de serviço, deverá observar as regras de representação/assistência e o melhor interesse do menor conforme a legislação brasileira.</p>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-1">
              <h3 className="font-bold text-white text-sm">16. Incidentes de Segurança</h3>
              <p>Em caso de incidentes que acarretem risco relevante, serão adotadas medidas imediatas de contenção e as comunicações regulamentares aos titulares e à ANPD serão formalizadas nos termos da lei.</p>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-1">
              <h3 className="font-bold text-white text-sm">17. Alterações e Atualizações</h3>
              <p>Esta Política de Privacidade poderá ser alterada a qualquer momento para refletir novos aprimoramentos técnicos ou regulatórios, mantendo sempre a data de revisão visível no topo da página.</p>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-1">
              <h3 className="font-bold text-white text-sm">18. Contato e Disposições Finais</h3>
              <p>Dúvidas e solicitações: <strong>iTech Celular e Informática</strong> (CNPJ 58.710.025/0001-69) — E-mail: <a href="mailto:itechcelulareinformatica@gmail.com" className="text-amber-400 hover:underline">itechcelulareinformatica@gmail.com</a> — Tel: (79) 98135-1174 / (79) 98140-9039.</p>
            </div>
          </div>

        </div>

        {/* Rodapé da página */}
        <div className="pt-6 border-t border-slate-800 text-center text-xs text-slate-500 space-y-2">
          <p>© 2026 iTech Celular e Informática • CNPJ: 58.710.025/0001-69 • Todos os direitos reservados.</p>
          <div className="flex justify-center gap-4">
            <Link to="/login" className="text-amber-400 hover:underline">Login no ERP</Link>
            <span>•</span>
            <Link to="/cadastro" className="text-amber-400 hover:underline">Cadastrar Nova Loja</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

