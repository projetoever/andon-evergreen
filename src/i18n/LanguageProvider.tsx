import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AndonLanguage = "pt-BR" | "en" | "zh-TW";

export const LANGUAGE_STORAGE_KEY = "andon.interfaceLanguage";
export const DEFAULT_LANGUAGE: AndonLanguage = "pt-BR";

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: AndonLanguage; label: string }> = [
  { value: "pt-BR", label: "Português" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
];

// UI labels only. Machine names, technician names, operator notes, diagnostics,
// and configured sector names remain exactly as stored in PostgreSQL.
const translations: Record<Exclude<AndonLanguage, "pt-BR">, Record<string, string>> = {
  en: {
    "Idioma": "Language",
    "Idioma da interface": "Interface language",
    "Máquinas": "Machines",
    "Máquina": "Machine",
    "Pronta para rodar": "Ready to run",
    "Máquina em falha": "Machine stopped",
    "Em falha": "Stopped",
    "Abertos": "Open calls",
    "Em atendimento": "In service",
    "Atendimento": "Service",
    "Aguardando": "Waiting",
    "Acompanhamento": "Follow-up",
    "Finalizados hoje": "Closed today",
    "Fora de produção": "Out of production",
    "Fora de Produção": "Out of production",
    "Programação": "Schedule",
    "Produção Programada": "Scheduled production",
    "Programação de Produção": "Production schedule",
    "Última alteração": "Last change",
    "Aberto": "Open",
    "Sem chamado": "No call",
    "Finalizado": "Closed",
    "Cancelado": "Cancelled",
    "Silenciar som": "Mute sound",
    "Som silenciado": "Sound muted",
    "Reativar som do dashboard": "Unmute dashboard",
    "Silenciar som do dashboard": "Mute dashboard",
    "Abrir ANDON BI": "Open ANDON BI",
    "Organizar prioridade de produção": "Set production priority",
    "Configurar sons do ANDON": "Configure ANDON sounds",
    "INICIAR PAINEL / ATIVAR SONS": "START DASHBOARD / ENABLE SOUND",
    "Toque em \"Iniciar Painel\" para liberar os sons dos chamados.": "Select Start Dashboard to enable call alerts.",
    "Ver Máquina": "View machine",
    "Nenhuma máquina cadastrada": "No machines registered",
    "Abra as configurações administrativas para cadastrar a primeira máquina do ANDON.": "Open admin settings to register the first ANDON machine.",
    "Voltar aos cards principais": "Back to main cards",
    "Última ocorrência": "Last occurrence",
    "Sem ocorrência": "No occurrence",
    "Duração": "Duration",
    "Encerrada em": "Ended at",
    "Chamado aberto em": "Call opened at",
    "Falha iniciada em": "Failure started at",
    "Nenhum chamado ou falha registrado": "No calls or failures registered",
    "Informação do operador": "Operator message",
    "Sem informação registrada.": "No message provided.",
    "Clique para ler a informação completa do operador": "Read the full operator message",
    "Registrada na abertura do chamado de": "Recorded when the call was opened for",
    "Prioridade de produção": "Production priority",
    "Status atual da máquina": "Current machine status",
    "Condição operacional": "Operating condition",
    "Última alteração de status": "Last status change",
    "Tempo total em falha": "Total downtime",
    "Sem falha ativa registrada.": "No active failure recorded.",
    "Tempo contado desde a parada real.": "Time counted from the physical stop.",
    "Tempo desde o último chamado ou falha.": "Time since the last call or failure.",
    "Mais informações": "More information",
    "O tempo usa a parada real da máquina. Ele pode ser maior que o tempo do ANDON quando a falha começou antes da abertura do chamado.": "This is the actual machine downtime. It may exceed the ANDON call duration if the failure started earlier.",
    "A máquina está sem falha ativa no momento. O painel continua monitorando chamados ANDON e mudanças de status.": "No active failure is recorded. ANDON calls and machine state changes remain monitored.",
    "Nenhum chamado ou falha foi registrado para esta máquina.": "No call or failure has been recorded for this machine.",
    "Voltar ao painel": "Back to dashboard",
    "Histórico da máquina": "Machine history",
    "Histórico": "History",
    "Tela fixada": "Screen locked",
    "Fixar tela": "Lock screen",
    "Tela fixada: clique para desbloquear": "Screen locked: click to unlock",
    "Fixar tela desta máquina": "Lock screen to this machine",
    "Som do ANDON: Ativo": "ANDON sound: On",
    "Som do ANDON: Silenciado": "ANDON sound: Muted",
    "Abrir novo chamado": "Open new call",
    "Máquina parada: setor livre abre chamado; setor ativo seleciona o chamado.": "Machine stopped: select a free sector to open a call or an active sector to view its call.",
    "Setor livre abre chamado; setor ativo seleciona o chamado.": "Select a free sector to open a call or an active sector to view its call.",
    "Selecionado": "Selected",
    "Selecionado: chamado": "Selected call:",
    "Selecionar chamado": "Select call",
    "Ativo": "Active",
    "Ativos": "Active",
    "Atender selecionado": "Attend selected",
    "Cancelar selecionado": "Cancel selected",
    "Concluir manutenção": "Complete maintenance",
    "Finalizar": "Finish",
    "Voltar à manutenção": "Return to maintenance",
    "Finalizar chamado": "Close call",
    "Chamado atual": "Current call",
    "Categoria": "Category",
    "Manutenção": "Maintenance",
    "Produção": "Production",
    "Subtipo": "Subcategory",
    "Status": "Status",
    "Criticidade": "Criticality",
    "Baixa": "Low",
    "Média": "Medium",
    "Alta": "High",
    "Aberto em": "Opened at",
    "Atendido em": "Attended at",
    "Conclusão da manutenção": "Maintenance completed",
    "Condição atual da máquina": "Current machine condition",
    "Condição ao abrir": "Condition when opened",
    "Descrição": "Description",
    "Total": "Total",
    "Sem chamado ativo": "No active call",
    "Selecione um dos setores abaixo para registrar um novo chamado.": "Select a sector below to open a new call.",
    "Elétrica": "Electrical",
    "Mecânica": "Mechanical",
    "Qualidade": "Quality",
    "Liderança": "Leadership",
    "Não informado": "Not specified",
    "Visão Geral": "Overview",
    "Confiabilidade": "Reliability",
    "Falhas": "Failures",
    "Qualidade dos Dados": "Data quality",
    "Período": "Period",
    "Todas as máquinas": "All machines",
    "Todos os setores": "All sectors",
    "Todas as classificações": "All classifications",
    "Setor": "Sector",
    "Classificação": "Classification",
    "Últimas 24h": "Last 24 hours",
    "Últimos 7 dias": "Last 7 days",
    "Últimos 30 dias": "Last 30 days",
    "Exportar PDF": "Export PDF",
    "Atualizar": "Refresh",
    "ANDON operacional": "Operational ANDON",
    "Visão executiva · falhas · equipe técnica": "Executive view · failures · technical team",
    "Inteligência em Manutenção e Confiabilidade": "Maintenance and reliability intelligence",
    "Disponibilidade": "Availability",
    "MTTA": "MTTA",
    "MTTR": "MTTR",
    "MTBF": "MTBF",
    "Tempo de parada": "Downtime",
    "Taxa de retorno": "Return rate",
    "Máquinas com maior parada": "Machines with highest downtime",
    "Disponibilidade por dia": "Daily availability",
    "Tempo de parada por dia": "Daily downtime",
    "Resumo executivo": "Executive summary",
  },
  "zh-TW": {
    "Idioma": "語言",
    "Idioma da interface": "介面語言",
    "Máquinas": "機台",
    "Máquina": "機台",
    "Pronta para rodar": "準備運轉",
    "Máquina em falha": "機台故障",
    "Em falha": "故障停機",
    "Abertos": "待處理叫修",
    "Em atendimento": "維修處理中",
    "Atendimento": "維修處理",
    "Aguardando": "等待處理",
    "Acompanhamento": "追蹤觀察",
    "Finalizados hoje": "今日已結案",
    "Fora de produção": "非生產時段",
    "Fora de Produção": "非生產時段",
    "Programação": "排程",
    "Produção Programada": "排定生產",
    "Programação de Produção": "生產排程",
    "Última alteração": "上次變更",
    "Aberto": "已開立",
    "Sem chamado": "無叫修",
    "Finalizado": "已結案",
    "Cancelado": "已取消",
    "Silenciar som": "靜音",
    "Som silenciado": "已靜音",
    "Reativar som do dashboard": "恢復看板音效",
    "Silenciar som do dashboard": "關閉看板音效",
    "Abrir ANDON BI": "開啟 ANDON BI",
    "Organizar prioridade de produção": "設定生產優先順序",
    "Configurar sons do ANDON": "設定 ANDON 音效",
    "INICIAR PAINEL / ATIVAR SONS": "啟動看板／開啟音效",
    "Toque em \"Iniciar Painel\" para liberar os sons dos chamados.": "請啟動看板以啟用叫修提示音。",
    "Ver Máquina": "查看機台",
    "Nenhuma máquina cadastrada": "尚未登錄機台",
    "Abra as configurações administrativas para cadastrar a primeira máquina do ANDON.": "請至管理設定新增第一台 ANDON 機台。",
    "Voltar aos cards principais": "返回主要機台卡片",
    "Última ocorrência": "最近事件",
    "Sem ocorrência": "無事件",
    "Duração": "持續時間",
    "Encerrada em": "結束時間",
    "Chamado aberto em": "叫修建立時間",
    "Falha iniciada em": "故障開始時間",
    "Nenhum chamado ou falha registrado": "無叫修或故障記錄",
    "Informação do operador": "操作員留言",
    "Sem informação registrada.": "沒有留言。",
    "Clique para ler a informação completa do operador": "查看完整操作員留言",
    "Registrada na abertura do chamado de": "叫修建立時記錄：",
    "Prioridade de produção": "生產優先順序",
    "Status atual da máquina": "機台目前狀態",
    "Condição operacional": "運轉狀態",
    "Última alteração de status": "最近狀態變更",
    "Tempo total em falha": "停機總時間",
    "Sem falha ativa registrada.": "目前無故障記錄。",
    "Tempo contado desde a parada real.": "自實際停機起算。",
    "Tempo desde o último chamado ou falha.": "距離最近叫修或故障的時間。",
    "Mais informações": "更多資訊",
    "O tempo usa a parada real da máquina. Ele pode ser maior que o tempo do ANDON quando a falha começou antes da abertura do chamado.": "依機台實際停機時間計算，若故障早於叫修建立，時間可能較長。",
    "A máquina está sem falha ativa no momento. O painel continua monitorando chamados ANDON e mudanças de status.": "目前無進行中的故障，系統仍持續監控叫修與狀態變更。",
    "Nenhum chamado ou falha foi registrado para esta máquina.": "此機台尚無叫修或故障記錄。",
    "Voltar ao painel": "返回看板",
    "Histórico da máquina": "機台歷史記錄",
    "Histórico": "歷史記錄",
    "Tela fixada": "畫面已鎖定",
    "Fixar tela": "鎖定畫面",
    "Tela fixada: clique para desbloquear": "畫面已鎖定：點選解鎖",
    "Fixar tela desta máquina": "將畫面鎖定至此機台",
    "Som do ANDON: Ativo": "ANDON 音效：開啟",
    "Som do ANDON: Silenciado": "ANDON 音效：靜音",
    "Abrir novo chamado": "建立新叫修",
    "Máquina parada: setor livre abre chamado; setor ativo seleciona o chamado.": "機台停機：選擇未啟用部門建立叫修，或選擇進行中部門查看叫修。",
    "Setor livre abre chamado; setor ativo seleciona o chamado.": "選擇未啟用部門建立叫修，或選擇進行中部門查看叫修。",
    "Selecionado": "已選取",
    "Selecionado: chamado": "已選取叫修：",
    "Selecionar chamado": "選擇叫修",
    "Ativo": "處理中",
    "Ativos": "處理中",
    "Atender selecionado": "開始處理",
    "Cancelar selecionado": "取消選定叫修",
    "Concluir manutenção": "完成維修",
    "Finalizar": "完成",
    "Voltar à manutenção": "返回維修",
    "Finalizar chamado": "結束叫修",
    "Chamado atual": "目前叫修",
    "Categoria": "類別",
    "Manutenção": "維修",
    "Produção": "生產",
    "Subtipo": "子類別",
    "Status": "狀態",
    "Criticidade": "緊急程度",
    "Baixa": "低",
    "Média": "中",
    "Alta": "高",
    "Aberto em": "建立時間",
    "Atendido em": "受理時間",
    "Conclusão da manutenção": "維修完成時間",
    "Condição atual da máquina": "機台目前狀態",
    "Condição ao abrir": "建立時狀態",
    "Descrição": "說明",
    "Total": "總計",
    "Sem chamado ativo": "目前沒有叫修",
    "Selecione um dos setores abaixo para registrar um novo chamado.": "請選擇下方部門以建立新叫修。",
    "Elétrica": "電氣",
    "Mecânica": "機械",
    "Qualidade": "品質",
    "Liderança": "主管",
    "Não informado": "未提供",
    "Visão Geral": "總覽",
    "Confiabilidade": "可靠度",
    "Falhas": "故障分析",
    "Qualidade dos Dados": "資料品質",
    "Período": "期間",
    "Todas as máquinas": "全部機台",
    "Todos os setores": "全部部門",
    "Todas as classificações": "全部分類",
    "Setor": "部門",
    "Classificação": "分類",
    "Últimas 24h": "最近 24 小時",
    "Últimos 7 dias": "最近 7 天",
    "Últimos 30 dias": "最近 30 天",
    "Exportar PDF": "匯出 PDF",
    "Atualizar": "重新整理",
    "ANDON operacional": "ANDON 操作介面",
    "Visão executiva · falhas · equipe técnica": "管理總覽 · 故障 · 維修團隊",
    "Inteligência em Manutenção e Confiabilidade": "維修與可靠度分析",
    "Disponibilidade": "可用率",
    "MTTA": "平均回應時間",
    "MTTR": "平均修復時間",
    "MTBF": "平均故障間隔",
    "Tempo de parada": "停機時間",
    "Taxa de retorno": "重返維修率",
    "Máquinas com maior parada": "停機時間最長機台",
    "Disponibilidade por dia": "每日可用率",
    "Tempo de parada por dia": "每日停機時間",
    "Resumo executivo": "管理摘要",
  },
};

export function translateLabel(language: AndonLanguage, source: string): string {
  return language === DEFAULT_LANGUAGE ? source : translations[language][source] ?? source;
}

export function isAndonLanguage(value: unknown): value is AndonLanguage {
  return value === "pt-BR" || value === "en" || value === "zh-TW";
}

type LanguageContextValue = {
  language: AndonLanguage;
  setLanguage: (language: AndonLanguage) => void;
  t: (source: string) => string;
};

// Reusable status cards can also be rendered in isolated tests and previews.
const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (source) => source,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start identically on server and client to avoid SSR hydration mismatch.
  const [language, updateLanguage] = useState<AndonLanguage>(DEFAULT_LANGUAGE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isAndonLanguage(saved)) updateLanguage(saved);
    } catch {
      // Locked-down kiosk browsers may deny localStorage; Portuguese still works.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.lang = language;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language remains usable for the current tab.
    }
  }, [language, hydrated]);

  const setLanguage = useCallback((next: AndonLanguage) => {
    if (isAndonLanguage(next)) updateLanguage(next);
  }, []);
  const t = useCallback((source: string) => translateLabel(language, source), [language]);
  const context = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={context}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
