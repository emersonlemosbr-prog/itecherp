// data/checklistDefinition.js
// Estrutura completa de categorias e itens do checklist de entrada do aparelho

export const CHECKLIST_CATEGORIES = [
  {
    id: 'screen',
    title: 'Tela / Display',
    icon: 'Smartphone',
    items: [
      { id: 'tela_trincada', label: 'Tela trincada', type: 'boolean', isDefect: true },
      { id: 'tela_quebrada', label: 'Tela quebrada', type: 'boolean', isDefect: true },
      { id: 'tela_riscada', label: 'Tela riscada', type: 'boolean', isDefect: true },
      { id: 'tela_manchada', label: 'Tela manchada', type: 'boolean', isDefect: true },
      { id: 'tela_linhas', label: 'Tela com linhas', type: 'boolean', isDefect: true },
      { id: 'tela_piscando', label: 'Tela piscando', type: 'boolean', isDefect: true },
      { id: 'tela_apagada', label: 'Tela apagada', type: 'boolean', isDefect: true },
      { id: 'display_sem_imagem', label: 'Display sem imagem', type: 'boolean', isDefect: true },
      { id: 'touch_falhando', label: 'Touch falhando', type: 'boolean', isDefect: true },
      { id: 'touch_nao_funciona', label: 'Touch não funciona', type: 'boolean', isDefect: true },
      { id: 'touch_quebrado', label: 'Touch quebrado', type: 'boolean', isDefect: true },
      { id: 'ghost_touch', label: 'Ghost touch / toque fantasma', type: 'boolean', isDefect: true },
      { id: 'burn_in', label: 'Burn-in', type: 'boolean', isDefect: true },
      { id: 'vazamento_lcd', label: 'Vazamento de LCD', type: 'boolean', isDefect: true },
      { id: 'brilho_irregular', label: 'Brilho irregular', type: 'boolean', isDefect: true },
      { id: 'tela_descolando', label: 'Tela descolando', type: 'boolean', isDefect: true },
      { id: 'tela_substituida', label: 'Tela já substituída anteriormente', type: 'boolean' },
      { id: 'tela_sem_defeito', label: 'Sem defeito aparente', type: 'boolean', isOk: true },
    ],
  },
  {
    id: 'housing',
    title: 'Carcaça / Estrutura',
    icon: 'Shield',
    items: [
      { id: 'carcaca_riscada', label: 'Carcaça riscada', type: 'boolean', isDefect: true },
      { id: 'carcaca_quebrada', label: 'Carcaça quebrada', type: 'boolean', isDefect: true },
      { id: 'carcaca_trincada', label: 'Carcaça trincada', type: 'boolean', isDefect: true },
      { id: 'carcaca_amassada', label: 'Carcaça amassada', type: 'boolean', isDefect: true },
      { id: 'carcaca_empenada', label: 'Carcaça empenada', type: 'boolean', isDefect: true },
      { id: 'tampa_quebrada', label: 'Tampa traseira quebrada', type: 'boolean', isDefect: true },
      { id: 'tampa_trincada', label: 'Tampa traseira trincada', type: 'boolean', isDefect: true },
      { id: 'tampa_riscada', label: 'Tampa traseira riscada', type: 'boolean', isDefect: true },
      { id: 'tampa_descolando', label: 'Tampa traseira descolando', type: 'boolean', isDefect: true },
      { id: 'aro_danificado', label: 'Aro danificado', type: 'boolean', isDefect: true },
      { id: 'chassi_danificado', label: 'Chassi danificado', type: 'boolean', isDefect: true },
      { id: 'parafusos_faltando', label: 'Parafusos faltando', type: 'boolean', isDefect: true },
      { id: 'parafusos_espanados', label: 'Parafusos espanados', type: 'boolean', isDefect: true },
      { id: 'marcas_abertura', label: 'Marcas de abertura anterior', type: 'boolean' },
      { id: 'aparelho_aberto', label: 'Aparelho já foi aberto', type: 'boolean' },
      { id: 'carcaca_sem_defeito', label: 'Sem defeito aparente', type: 'boolean', isOk: true },
    ],
  },
  {
    id: 'buttons',
    title: 'Botões',
    icon: 'Sliders',
    items: [
      {
        id: 'botao_power',
        label: 'Botão Power',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Power funcionando', isOk: true },
          { value: 'defeito', label: 'Power com defeito', isDefect: true },
        ],
      },
      {
        id: 'botao_volume_mais',
        label: 'Volume +',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Volume + funcionando', isOk: true },
          { value: 'defeito', label: 'Volume + com defeito', isDefect: true },
        ],
      },
      {
        id: 'botao_volume_menos',
        label: 'Volume -',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Volume - funcionando', isOk: true },
          { value: 'defeito', label: 'Volume - com defeito', isDefect: true },
        ],
      },
      {
        id: 'botao_home',
        label: 'Botão Home',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Botão Home funcionando', isOk: true },
          { value: 'defeito', label: 'Botão Home com defeito', isDefect: true },
        ],
      },
      {
        id: 'botao_silencioso',
        label: 'Botão Silencioso',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Botão silencioso funcionando', isOk: true },
          { value: 'defeito', label: 'Botão silencioso com defeito', isDefect: true },
        ],
      },
      { id: 'botoes_afundados', label: 'Botões afundados', type: 'boolean', isDefect: true },
      { id: 'botoes_faltando', label: 'Botões faltando', type: 'boolean', isDefect: true },
    ],
  },
  {
    id: 'cameras',
    title: 'Câmeras',
    icon: 'Camera',
    items: [
      {
        id: 'camera_traseira',
        label: 'Câmera Traseira',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Câmera traseira funcionando', isOk: true },
          { value: 'defeito', label: 'Câmera traseira com defeito', isDefect: true },
        ],
      },
      {
        id: 'camera_frontal',
        label: 'Câmera Frontal',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Câmera frontal funcionando', isOk: true },
          { value: 'defeito', label: 'Câmera frontal com defeito', isDefect: true },
        ],
      },
      {
        id: 'flash',
        label: 'Flash',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Flash funcionando', isOk: true },
          { value: 'defeito', label: 'Flash com defeito', isDefect: true },
        ],
      },
      { id: 'camera_nao_foca', label: 'Câmera não foca', type: 'boolean', isDefect: true, requiresPower: true },
      { id: 'camera_tremendo', label: 'Câmera tremendo', type: 'boolean', isDefect: true, requiresPower: true },
      { id: 'camera_manchas', label: 'Câmera com manchas', type: 'boolean', isDefect: true, requiresPower: true },
      { id: 'camera_embacada', label: 'Câmera embaçada', type: 'boolean', isDefect: true, requiresPower: true },
      { id: 'lente_quebrada', label: 'Lente quebrada', type: 'boolean', isDefect: true },
      { id: 'lente_riscada', label: 'Lente riscada', type: 'boolean', isDefect: true },
    ],
  },
  {
    id: 'audio',
    title: 'Áudio',
    icon: 'Volume2',
    items: [
      {
        id: 'alto_falante',
        label: 'Alto-falante',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Alto-falante funcionando', isOk: true },
          { value: 'baixo', label: 'Alto-falante baixo', isDefect: true },
          { value: 'chiando', label: 'Alto-falante chiando', isDefect: true },
          { value: 'sem_som', label: 'Alto-falante sem som', isDefect: true },
        ],
      },
      {
        id: 'auricular',
        label: 'Auricular',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Auricular funcionando', isOk: true },
          { value: 'baixo', label: 'Auricular baixo', isDefect: true },
          { value: 'sem_som', label: 'Auricular sem som', isDefect: true },
        ],
      },
      {
        id: 'microfone',
        label: 'Microfone',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Microfone funcionando', isOk: true },
          { value: 'baixo', label: 'Microfone baixo', isDefect: true },
          { value: 'defeito', label: 'Microfone com defeito', isDefect: true },
          { value: 'nao_funciona', label: 'Microfone não funciona', isDefect: true },
        ],
      },
      { id: 'audio_distorcido', label: 'Áudio distorcido', type: 'boolean', isDefect: true, requiresPower: true },
    ],
  },
  {
    id: 'charging',
    title: 'Carga / Conector',
    icon: 'Zap',
    items: [
      {
        id: 'conector_carga',
        label: 'Conector de Carga',
        type: 'state',
        options: [
          { value: 'carregando', label: 'Conector carregando normalmente', isOk: true },
          { value: 'nao_carrega', label: 'Não carrega', isDefect: true },
          { value: 'intermitente', label: 'Carregamento intermitente', isDefect: true },
          { value: 'lento', label: 'Carregamento lento', isDefect: true },
        ],
      },
      {
        id: 'carga_sem_fio',
        label: 'Carregamento Sem Fio',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'Carregamento sem fio funcionando', isOk: true },
          { value: 'defeito', label: 'Carregamento sem fio com defeito', isDefect: true },
        ],
      },
      { id: 'conector_folgado', label: 'Conector folgado', type: 'boolean', isDefect: true },
      { id: 'conector_danificado', label: 'Conector danificado', type: 'boolean', isDefect: true },
      { id: 'cabo_posicao_especifica', label: 'Cabo precisa ficar em posição específica', type: 'boolean', isDefect: true },
      { id: 'nao_reconhece_usb', label: 'Não reconhece USB', type: 'boolean', isDefect: true },
      { id: 'nao_reconhece_carregador', label: 'Não reconhece carregador', type: 'boolean', isDefect: true },
    ],
  },
  {
    id: 'battery',
    title: 'Bateria',
    icon: 'Battery',
    items: [
      {
        id: 'bateria_condicao',
        label: 'Condição da Bateria',
        type: 'state',
        options: [
          { value: 'normal', label: 'Bateria normal', isOk: true },
          { value: 'descarregando_rapido', label: 'Bateria descarregando rápido', isDefect: true },
          { value: 'viciada', label: 'Bateria viciada', isDefect: true },
          { value: 'nao_segura_carga', label: 'Bateria não segura carga', isDefect: true },
          { value: 'nao_carrega', label: 'Bateria não carrega', isDefect: true },
          { value: 'inchada', label: 'Bateria inchada', isDefect: true },
        ],
      },
      { id: 'aparelho_desligando_sozinho', label: 'Aparelho desligando sozinho', type: 'boolean', isDefect: true },
      { id: 'bateria_porcentagem_oscilando', label: 'Porcentagem da bateria oscilando', type: 'boolean', isDefect: true },
      { id: 'bateria_saude_baixa', label: 'Saúde da bateria baixa', type: 'boolean', isDefect: true },
    ],
  },
  {
    id: 'connectivity',
    title: 'Conectividade',
    icon: 'Wifi',
    items: [
      {
        id: 'wifi',
        label: 'Wi-Fi',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Wi-Fi funcionando', isOk: true },
          { value: 'defeito', label: 'Wi-Fi com defeito', isDefect: true },
        ],
      },
      {
        id: 'bluetooth',
        label: 'Bluetooth',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Bluetooth funcionando', isOk: true },
          { value: 'defeito', label: 'Bluetooth com defeito', isDefect: true },
        ],
      },
      {
        id: 'rede_movel',
        label: 'Rede Móvel',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Rede móvel funcionando', isOk: true },
          { value: 'sem_sinal', label: 'Sem sinal', isDefect: true },
          { value: 'sinal_fraco', label: 'Sinal fraco', isDefect: true },
          { value: 'nao_reconhece_chip', label: 'Não reconhece chip', isDefect: true },
        ],
      },
      {
        id: 'gps',
        label: 'GPS',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'GPS funcionando', isOk: true },
          { value: 'defeito', label: 'GPS com defeito', isDefect: true },
        ],
      },
      {
        id: 'nfc',
        label: 'NFC',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'NFC funcionando', isOk: true },
          { value: 'defeito', label: 'NFC com defeito', isDefect: true },
        ],
      },
      {
        id: 'hotspot',
        label: 'Hotspot / Roteador',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Hotspot funcionando', isOk: true },
          { value: 'defeito', label: 'Hotspot com defeito', isDefect: true },
        ],
      },
    ],
  },
  {
    id: 'sensors',
    title: 'Sensores / Biometria',
    icon: 'Fingerprint',
    items: [
      {
        id: 'proximidade',
        label: 'Sensor de Proximidade',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Proximidade funcionando', isOk: true },
          { value: 'defeito', label: 'Proximidade com defeito', isDefect: true },
        ],
      },
      {
        id: 'sensor_luz',
        label: 'Sensor de Luz',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Sensor de luz funcionando', isOk: true },
          { value: 'defeito', label: 'Sensor de luz com defeito', isDefect: true },
        ],
      },
      {
        id: 'acelerometro',
        label: 'Acelerômetro',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Acelerômetro funcionando', isOk: true },
          { value: 'defeito', label: 'Acelerômetro com defeito', isDefect: true },
        ],
      },
      {
        id: 'giroscopio',
        label: 'Giroscópio',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Giroscópio funcionando', isOk: true },
          { value: 'defeito', label: 'Giroscópio com defeito', isDefect: true },
        ],
      },
      {
        id: 'digital',
        label: 'Leitor Digital',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Digital funcionando', isOk: true },
          { value: 'defeito', label: 'Digital com defeito', isDefect: true },
        ],
      },
      {
        id: 'face_id',
        label: 'Face ID / Facial',
        type: 'state',
        requiresPower: true,
        options: [
          { value: 'funcionando', label: 'Face ID / reconhecimento facial funcionando', isOk: true },
          { value: 'defeito', label: 'Face ID / reconhecimento facial com defeito', isDefect: true },
        ],
      },
      { id: 'biometria_nao_disponivel', label: 'Biometria não disponível para teste', type: 'boolean' },
    ],
  },
  {
    id: 'system',
    title: 'Sistema',
    icon: 'Cpu',
    items: [
      {
        id: 'sistema_estado',
        label: 'Estado do Sistema',
        type: 'state',
        options: [
          { value: 'liga_normalmente', label: 'Liga normalmente', isOk: true },
          { value: 'nao_liga', label: 'Não liga', isDefect: true, isNoPower: true },
          { value: 'travando', label: 'Travando', isDefect: true },
          { value: 'reiniciando', label: 'Reiniciando', isDefect: true },
          { value: 'loop_infinito', label: 'Reiniciando em loop', isDefect: true },
          { value: 'preso_logo', label: 'Preso na logo', isDefect: true },
          { value: 'sistema_lento', label: 'Sistema lento', isDefect: true },
          { value: 'apps_fechando', label: 'Aplicativos fechando', isDefect: true },
          { value: 'erro_sistema', label: 'Erro no sistema', isDefect: true },
          { value: 'sem_so', label: 'Sem sistema operacional', isDefect: true },
          { value: 'sistema_modificado', label: 'Sistema modificado', isDefect: true },
          { value: 'aparelho_formatado', label: 'Aparelho formatado' },
          { value: 'nao_testado', label: 'Não foi possível testar' },
        ],
      },
    ],
  },
  {
    id: 'moisture',
    title: 'Umidade / Oxidação',
    icon: 'Droplets',
    items: [
      { id: 'sem_sinais_liquido', label: 'Sem sinais aparentes de líquido', type: 'boolean', isOk: true },
      { id: 'marcas_liquido', label: 'Marcas de líquido', type: 'boolean', isDefect: true },
      { id: 'possivel_contato_agua', label: 'Possível contato com água', type: 'boolean', isDefect: true },
      { id: 'cliente_informou_agua', label: 'Cliente informou contato com água', type: 'boolean', isDefect: true },
      { id: 'indicador_liquido_ativado', label: 'Indicador de líquido ativado', type: 'boolean', isDefect: true },
      { id: 'oxidacao_aparente', label: 'Oxidação aparente', type: 'boolean', isDefect: true },
      {
        id: 'oxidacao_grau',
        label: 'Grau de Oxidação',
        type: 'state',
        options: [
          { value: 'leve', label: 'Oxidação leve', isDefect: true },
          { value: 'moderada', label: 'Oxidação moderada', isDefect: true },
          { value: 'severa', label: 'Oxidação severa', isDefect: true },
        ],
      },
    ],
  },
  {
    id: 'external_components',
    title: 'Conectores / Componentes Externos',
    icon: 'HardDrive',
    items: [
      {
        id: 'entrada_chip',
        label: 'Entrada de Chip',
        type: 'state',
        options: [
          { value: 'normal', label: 'Entrada de chip normal', isOk: true },
          { value: 'danificada', label: 'Entrada de chip danificada', isDefect: true },
        ],
      },
      {
        id: 'bandeja_chip',
        label: 'Bandeja de Chip',
        type: 'state',
        options: [
          { value: 'presente', label: 'Bandeja de chip presente', isOk: true },
          { value: 'ausente', label: 'Bandeja de chip ausente', isDefect: true },
          { value: 'quebrada', label: 'Bandeja de chip quebrada', isDefect: true },
        ],
      },
      {
        id: 'entrada_sd',
        label: 'Entrada de Cartão SD',
        type: 'state',
        options: [
          { value: 'normal', label: 'Entrada de cartão SD normal', isOk: true },
          { value: 'danificada', label: 'Entrada de cartão SD danificada', isDefect: true },
        ],
      },
      {
        id: 'conector_p2',
        label: 'Conector P2 / Fone',
        type: 'state',
        options: [
          { value: 'funcionando', label: 'P2 funcionando', isOk: true },
          { value: 'defeito', label: 'P2 com defeito', isDefect: true },
        ],
      },
    ],
  },
];

export const ACCESSORY_OPTIONS = [
  { id: 'somente_aparelho', label: 'Somente aparelho' },
  { id: 'capa', label: 'Capa' },
  { id: 'pelicula', label: 'Película' },
  { id: 'carregador', label: 'Carregador' },
  { id: 'fonte', label: 'Fonte' },
  { id: 'cabo_usb', label: 'Cabo USB' },
  { id: 'fone_ouvido', label: 'Fone de ouvido' },
  { id: 'caixa_original', label: 'Caixa original' },
  { id: 'chip', label: 'Chip' },
  { id: 'cartao_memoria', label: 'Cartão de memória' },
  { id: 'bandeja_chip_acessorio', label: 'Bandeja de chip' },
  { id: 'caneta_spen', label: 'Caneta / S Pen' },
  { id: 'outro', label: 'Outro' },
];

export const GENERAL_CONDITION_OPTIONS = [
  { id: 'excelente', label: 'Excelente', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' },
  { id: 'bom', label: 'Bom', badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300' },
  { id: 'regular', label: 'Regular', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  { id: 'ruim', label: 'Ruim', badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300' },
  { id: 'muito_danificado', label: 'Muito danificado', badgeClass: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300' },
  { id: 'nao_avaliado', label: 'Não foi possível avaliar', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
];

/**
 * Retorna uma lista de strings legíveis com todos os itens marcados no checklist.
 * Usado para resumo na visualização interna e na impressão da OS.
 */
export function formatChecklistSummary(checklistData = {}) {
  if (!checklistData || typeof checklistData !== 'object') return [];

  const summary = [];

  CHECKLIST_CATEGORIES.forEach((cat) => {
    cat.items.forEach((item) => {
      const val = checklistData[item.id];
      if (item.type === 'boolean' && val) {
        summary.push(item.label);
      } else if (item.type === 'state' && val) {
        const matched = item.options.find((o) => o.value === val);
        if (matched) {
          summary.push(matched.label);
        }
      }
    });
  });

  return summary;
}

/**
 * Retorna os acessórios formatados em texto
 */
export function formatAccessoriesSummary(accessoriesData = {}) {
  if (!accessoriesData) return [];
  const items = Array.isArray(accessoriesData.items) ? accessoriesData.items : [];
  const result = [];

  items.forEach((id) => {
    if (id === 'outro') {
      const otherText = (accessoriesData.other || '').trim();
      result.push(otherText ? `Outro (${otherText})` : 'Outro');
    } else {
      const opt = ACCESSORY_OPTIONS.find((o) => o.id === id);
      if (opt) result.push(opt.label);
    }
  });

  return result;
}
