/** Scoped BI visual vocabulary. Loaded into the global UI catalog for PT/EN/ZH. */
export const visualMessages: ReadonlyArray<readonly [string,string,string]> = [
  [
    "Tipo de gráfico",
    "Chart type",
    "圖表類型"
  ],
  [
    "Barras",
    "Bars",
    "長條圖"
  ],
  [
    "Linha",
    "Line",
    "折線圖"
  ],
  [
    "Área",
    "Area",
    "面積圖"
  ],
  [
    "Rosca",
    "Donut",
    "環圈圖"
  ],
  [
    "Disco",
    "Pie",
    "圓餅圖"
  ],
  [
    "Pareto",
    "Pareto",
    "柏拉圖"
  ],
  [
    "Valor observado",
    "Observed value",
    "觀察值"
  ],
  [
    "Participação acumulada",
    "Cumulative share",
    "累積占比"
  ],
  [
    "Selecione um ponto ou categoria para inspecionar seus valores.",
    "Select a point or category to inspect its values.",
    "選取資料點或分類查看其數值。"
  ],
  [
    "A linha conecta intervalos observados, não comprova evolução contínua. Os dias de borda podem ser parciais.",
    "The line connects observed intervals, not a continuous operating trend. Boundary days may be partial.",
    "折線僅連結觀測區間，不代表持續運作趨勢；首尾日期可能不完整。"
  ],
  [
    "Barras ordenadas por contribuição; curva acumulada e linha de referência de 80%.",
    "Bars sorted by contribution, cumulative curve and 80% reference line.",
    "長條依貢獻度排序，並顯示累積曲線及 80% 參考線。"
  ],
  [
    "Detalhar cobertura histórica",
    "Inspect historical coverage",
    "檢視歷史涵蓋率"
  ],
  [
    "Detalhar cobertura",
    "Coverage details",
    "涵蓋率詳情"
  ],
  [
    "Cobertura histórica por máquina",
    "Historical coverage by machine",
    "各設備歷史涵蓋率"
  ],
  [
    "Histórico completo não significa que a máquina está produzindo agora.",
    "Complete history does not mean the machine is producing now.",
    "歷史紀錄完整不代表設備目前正在生產。"
  ],
  [
    "na população",
    "in population",
    "納入母體"
  ],
  [
    "históricos completos",
    "complete histories",
    "歷史完整"
  ],
  [
    "históricos incompletos",
    "incomplete histories",
    "歷史不完整"
  ],
  [
    "Máquina atualmente produzindo pode ter lacunas no período. Máquina atualmente fora da produção pode ter histórico completo. Não inventar horas programadas.",
    "A currently producing machine may have history gaps, while an idle machine may have complete history. Never infer unrecorded scheduled hours.",
    "目前生產中的設備可能有歷史缺口，停產設備也可能歷史完整。不得推定未記錄的排程時數。"
  ],
  [
    "Estado",
    "Status",
    "狀態"
  ],
  [
    "Motivo",
    "Reason",
    "原因"
  ],
  [
    "Histórico completo com produção programada",
    "Complete history with scheduled production",
    "歷史完整且有排程生產"
  ],
  [
    "Histórico completo, sem produção programada",
    "Complete history without scheduled production",
    "歷史完整但無排程生產"
  ],
  [
    "Histórico incompleto",
    "Incomplete history",
    "歷史不完整"
  ],
  [
    "Fora da janela",
    "Outside period",
    "不在期間內"
  ],
  [
    "Minutos programados verificados",
    "Verified scheduled minutes",
    "已驗證排程分鐘數"
  ],
  [
    "Modo não programado verificado",
    "Verified unscheduled mode",
    "已驗證非排程模式"
  ],
  [
    "Sem registros de programação",
    "No schedule records",
    "無排程記錄"
  ],
  [
    "Lacuna ou modo desconhecido na janela",
    "Gap or unknown mode in period",
    "期間內有缺口或未知模式"
  ],
  [
    "Sem tempo observado",
    "No observation time",
    "無觀測時間"
  ],
  [
    "Histórico completo sem minutos programados conta na cobertura, mas não no tempo de disponibilidade.",
    "Complete history with no scheduled minutes counts toward coverage, but not availability exposure time.",
    "歷史完整但無排程分鐘數者計入涵蓋率，不計入可用率的時間分母。"
  ]
,
["Explorar gráficos","Explore charts","探索圖表"],
["Diagnósticos dos chamados concluídos; apenas as categorias exibidas participam da distribuição.","Diagnoses from finished calls; only displayed categories contribute to the distribution.","已完成呼叫的診斷；只有顯示的分類計入分布。"],
["Chamados abertos por setor; não representa tempo de parada nem esforço técnico.","Calls opened by department; not machine downtime or technician effort.","各部門建立的呼叫數；非設備停機時間或技術人員工時。"],
["Ranking de minutos de parada física nas máquinas exibidas","Ranked physical downtime minutes for displayed machines","所顯示設備的實際停機分鐘數排名"],
["Exibe apenas as máquinas listadas neste ranking. Minutos de parada são observações físicas; classificação ou atividade não equivalem a causalidade.","Only machines shown in this ranking are included. Downtime minutes are physical observations; classification or activity does not prove cause.","僅包含此排名內的設備。停機分鐘數是實際觀察值；分類或活動不代表已確認原因。"],
["Tempo de trabalho por técnico, com sobreposições da própria pessoa removidas","Technician work time, excluding overlapping intervals of the same person","各技術人員工作時間，已排除同一人重疊區間"],
["Horas técnicas são somas por pessoa e podem ocorrer simultaneamente. Não equivalem ao tempo físico de máquina parada.","Technician hours are summed per person and may overlap across people. They are not physical machine downtime.","技術工時按人員加總，不同人員可同時作業；不等於設備實際停機時間。"],
["Composição das finalizações por elegibilidade","Finished-call composition by eligibility","已結案呼叫的資格組成"],
["Categorias mutuamente exclusivas de chamados finalizados","Mutually exclusive categories of finished calls","已結案呼叫的互斥分類"],
["Corretivo de manutenção","Corrective maintenance","矯正維修"],
["Corretivo pendente","Pending corrective responsibility","矯正維修責任待確認"],
["Corretivo de outra área","Corrective assigned elsewhere","歸屬其他部門的矯正呼叫"],
["Não corretivo","Non-corrective","非矯正類"],
["Distribuição dos chamados finalizados. A elegibilidade não substitui a prova física e a programação do MTTR/MTBF.","Distribution of finished calls. Eligibility does not replace physical evidence or the MTTR/MTBF schedule requirements.","已結案呼叫的分布。資格不代表具備實際停機證據或 MTTR／MTBF 排程要求。"],
["Gráfico comparativo com escala e valores inspecionáveis","Comparative chart with axes and inspectable values","有刻度和可檢視數值的比較圖"],
["Pareto: curva acumulada e referência de 80% do total exibido.","Pareto: cumulative curve and an 80% reference for the displayed total.","柏拉圖：顯示總量的累積曲線及 80% 參考線。"],
["Escala em horas por pessoa","Scale: hours per person","刻度：每人小時數"],
["Escala em horas técnicas","Scale: technical hours","刻度：技術工時"],
["Comparativo empilhado de tempo de manutenção e acompanhamento por técnico ou área","Stacked comparison of maintenance and follow-up time by technician or area","依技術人員或部門堆疊比較維修及追蹤時間"],
["Horas técnicas são somadas por pessoa e podem ser simultâneas. Não representam horas de máquina parada.","Technical hours sum per person and can overlap. They do not represent machine downtime.","技術工時按個人加總，可能同時發生；不代表設備停機時數。"],
["Exibindo as oito maiores participações. A tabela contém todos os registros.","Showing the top eight contributions. The table contains all records.","僅顯示前八項，表格含所有紀錄。"],
["Atenção: {0} de {1} horas técnicas ({2}%) estão com responsabilidade pendente. Revise diagnósticos antes de atribuir os tempos à manutenção.","Warning: {0} of {1} technical hours ({2}%) have pending responsibility. Review diagnoses before attributing time to maintenance.","注意：技術工時 {1} 中有 {0}（{2}%）責任未確認。歸入維修前請複核診斷。"],
["Ver classificações detalhadas","View detailed classifications","查看詳細分類"],
["Ver setores detalhados","View department details","查看部門詳情"],
["Compare as horas físicas de parada e identifique a contribuição acumulada das máquinas.","Compare physical downtime hours and identify machines' cumulative contribution.","比較實際停機時數並辨識各設備的累積貢獻。"],
["Situação atual dos alertas","Current alerts status","目前警示狀態"],
["Alertas com referência ao estado atual. As categorias podem se sobrepor.","Alerts reflecting current state. Categories may overlap.","警示反映目前狀態，各分類可能重疊。"],
["Alertas no período selecionado","Alerts in selected period","所選期間的警示"],
["Classificações ausentes e eventos sem chamado não representam uma composição aditiva.","Missing classifications and unlinked events are not an additive composition.","缺少分類與未關聯事件不能直接相加為同一組成。"],
["Cobertura indica histórico verificável no período selecionado, não quantas máquinas estão produzindo agora.","Coverage means verifiable history in the selected period, not the number of machines currently producing.","涵蓋率表示所選期間內可驗證的歷史紀錄，非目前生產中的設備數。"],
["Máquinas na população","Machines in population","納入統計母體的設備"],
["Históricos completos","Complete histories","完整歷史紀錄"],
["Históricos incompletos","Incomplete histories","不完整歷史紀錄"],
["da população possui histórico completo.","of the population has complete history.","的統計設備具有完整歷史紀錄。"],
["{0} máquina(s) têm histórico completo sem horas programadas; não adicionam tempo ao denominador.","{0} machine(s) have complete history but no scheduled hours; they add no time to the denominator.","有 {0} 台設備歷史完整但沒有排程時數，不計入分母時數。"],
["Máquinas a verificar:","Machines to check:","待檢查設備："],
["Confira os registros de modo produtivo nessas máquinas; períodos desconhecidos não são preenchidos automaticamente.","Review production-mode records for these machines; unknown periods are not filled automatically.","請檢查這些設備的生產模式紀錄；未知時段不會自動補入。"],
["Situação por máquina","Status by machine","各設備狀態"],
["Filtrar máquinas pela cobertura","Filter machines by coverage","依涵蓋狀態篩選設備"],
["Incompletas","Incomplete","不完整"],
["Completas","Complete","完整"],
["Completo · produção programada","Complete · scheduled production","完整・排程生產"],
["Completo · sem produção programada","Complete · no scheduled production","完整・無排程生產"],
["Programação verificada","Verified schedule","已驗證排程"],
["Lacuna ou modo desconhecido","Gap or unknown mode","紀錄缺口或未知模式"],
["Nenhuma máquina neste grupo.","No machines in this group.","此群組沒有設備。"],
["Nenhum alerta neste grupo","No alerts in this group","此群組沒有警示"],
["Categorias","Categories","分類"],
];
