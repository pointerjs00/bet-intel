export interface MetricInfo {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  formula?: string;
  formulaLabel?: string;
  example: string;
  /** When a value is available, replaces the static example with a personalised one computed from that value. */
  exampleFromValue?: (value: number) => string;
  tips: string[];
  icon: string; // Ionicons name
  /** Returns a personalised interpretation for the user's current value, or undefined if no value supplied. */
  interpret?: (value: number) => { text: string; sentiment: 'positive' | 'negative' | 'neutral' };
}

export const METRIC_INFO: Record<string, MetricInfo> = {
  roi: {
    id: 'roi',
    title: 'ROI',
    subtitle: 'Retorno sobre Investimento',
    icon: 'trending-up-outline',
    description:
      'O ROI mede a rentabilidade das tuas apostas em relação ao valor total apostado. É o indicador mais importante para avaliar se és um apostador lucrativo a longo prazo.',
    formulaLabel: 'Fórmula',
    formula: 'ROI = ((Retorno Total − Stake Total) ÷ Stake Total) × 100',
    example:
      'Apostaste €100 e recebeste €112. O teu ROI é ((112 − 100) ÷ 100) × 100 = +12%. Um ROI positivo significa que estás a ganhar dinheiro; negativo significa prejuízo.',
    exampleFromValue: (v) => {
      const sign = v >= 0 ? '+' : '';
      const perHundred = (100 * (1 + v / 100)).toFixed(2);
      const profitPer100 = (v).toFixed(1);
      return `No período selecionado, o teu ROI foi de ${sign}${profitPer100}%. Por cada €100 apostados, isso corresponde a um retorno de €${perHundred} — um ${v >= 0 ? 'lucro' : 'prejuízo'} de ${sign}€${Math.abs(v).toFixed(2)}.`;
    },
    tips: [
      'Um ROI sustentável acima de +5% a longo prazo é considerado excelente.',
      'Nunca avalie o ROI com menos de 50 apostas — a variância distorce o resultado.',
      'Compara o teu ROI por desporto e mercado para encontrar onde tens realmente vantagem.',
    ],
    interpret: (value) => {
      const sign = value >= 0 ? '+' : '';
      if (value >= 10) return { text: `O teu ROI de ${sign}${value.toFixed(1)}% é excelente. Mantém a estratégia com disciplina e considera aumentar o volume gradualmente.`, sentiment: 'positive' };
      if (value >= 0) return { text: `O teu ROI de ${sign}${value.toFixed(1)}% é positivo. Ainda é cedo para confirmar vantagem real — continua a registar apostas com consistência.`, sentiment: 'positive' };
      if (value >= -5) return { text: `O teu ROI de ${value.toFixed(1)}% está próximo de zero. Pequenas melhorias na seleção de apostas podem ser suficientes para tornar-te lucrativo.`, sentiment: 'neutral' };
      return { text: `O teu ROI de ${value.toFixed(1)}% está negativo. Analisa os padrões de perda antes de aumentar o volume — qualidade antes de quantidade.`, sentiment: 'negative' };
    },
  },

  'win-rate': {
    id: 'win-rate',
    title: 'Taxa de Vitória',
    subtitle: 'Percentagem de vitórias',
    icon: 'trophy-outline',
    description:
      'A taxa de vitória mostra a percentagem de apostas resolvidas que terminaram em vitória. Não inclui apostas pendentes nem apostas canceladas.',
    formulaLabel: 'Fórmula',
    formula: 'Win Rate = (Boletins Ganhos ÷ Boletins Resolvidos) × 100',
    example:
      'Tens 30 boletins ganhos e 70 perdidos (100 resolvidos). Win Rate = (30 ÷ 100) × 100 = 30%. Com odds médias de 3.5, um win rate de 29% já é suficiente para ter ROI positivo.',
    exampleFromValue: (v) => {
      if (v <= 0) return 'Ainda sem apostas resolvidas suficientes para calcular a taxa de vitória neste período.';
      const breakEven = v > 0 ? (100 / v).toFixed(2) : null;
      return `No período selecionado, ganhaste ${v.toFixed(0)}% das tuas apostas resolvidas.${breakEven ? ` Para atingires break-even com esta taxa de vitória precisas de odds médias de pelo menos ${breakEven} por aposta.` : ''}`;
    },
    tips: [
      'O win rate ideal depende das odds que jogas. Odds baixas (1.5) requerem ~70% win rate; odds altas (3.0) apenas ~34%.',
      'Um win rate alto com ROI negativo indica que perdes nas apostas com odds grandes.',
      'Analisa o win rate por mercado — podes ter 60% em 1X2 mas só 35% em Over/Under.',
    ],
    interpret: (value) => {
      if (value >= 60) return { text: `A tua taxa de vitória de ${value.toFixed(0)}% é alta. Garante que as tuas odds médias são suficientes para gerar ROI positivo — odds muito baixas não compensam mesmo com muitas vitórias.`, sentiment: 'positive' };
      if (value >= 40) return { text: `A tua taxa de vitória de ${value.toFixed(0)}% é razoável. O ROI final depende das odds que jogas — compara o teu win rate com o break-even das tuas odds médias.`, sentiment: 'neutral' };
      if (value > 0) return { text: `A tua taxa de vitória de ${value.toFixed(0)}% é baixa. Pode ser aceitável se jogares odds altas (>3.0), mas analisa as tuas seleções — precisas de mais valor por aposta.`, sentiment: 'negative' };
      return { text: 'Sem apostas resolvidas suficientes para calcular win rate.', sentiment: 'neutral' };
    },
  },

  streaks: {
    id: 'streaks',
    title: 'Sequências',
    subtitle: 'Séries de vitórias e derrotas',
    icon: 'flame-outline',
    description:
      'Regista a tua sequência atual de vitórias ou derrotas consecutivas, e as maiores séries de sempre. Ajuda a identificar períodos de boa/má forma e a controlar o "tilt" emocional.',
    example:
      'Se os teus últimos 5 boletins resolvidos foram GANHOU, GANHOU, PERDEU, GANHOU, GANHOU — a tua sequência atual é 2 vitórias consecutivas. A maior série de vitórias é 2.',
    exampleFromValue: (v) => {
      if (v > 0) return `Neste momento estás em sequência de ${v} vitória${v !== 1 ? 's' : ''} consecutiva${v !== 1 ? 's' : ''}. Mantém a disciplina e não aumentes o stake por euforia.`;
      if (v < 0) {
        const n = Math.abs(v);
        return `Neste momento estás em sequência de ${n} derrota${n !== 1 ? 's' : ''} consecutiva${n !== 1 ? 's' : ''}. Considera reduzir o stake até inverteres o rumo — cada aposta é independente das anteriores.`;
      }
      return 'Sem sequência ativa registada neste período.';
    },
    tips: [
      'Uma longa série de derrotas não significa que vais "recuperar" — cada aposta é independente.',
      'Numa série negativa, considera reduzir a stake para proteger o bankroll.',
      'Séries muito longas (>7) podem indicar período de variância extrema, não necessariamente falta de método.',
    ],
    interpret: (value) => {
      // positive = win streak count, negative = loss streak count, 0 = none
      if (value >= 7) return { text: `Estás em incrível sequência de ${value} vitórias consecutivas! Mantém a disciplina — não aumentes o stake por euforia.`, sentiment: 'positive' };
      if (value >= 3) return { text: `Estás com ${value} vitórias consecutivas! Boa forma. Continua a ser criterioso na seleção.`, sentiment: 'positive' };
      if (value > 0) return { text: `Estás com ${value} vitória${value !== 1 ? 's' : ''} consecutiva${value !== 1 ? 's' : ''}.`, sentiment: 'positive' };
      if (value === 0) return { text: 'Sem sequência ativa registada.', sentiment: 'neutral' };
      const count = Math.abs(value);
      if (count >= 7) return { text: `Série de ${count} derrotas consecutivas. Considera uma pausa para reavaliar a estratégia e proteger o bankroll.`, sentiment: 'negative' };
      if (count >= 3) return { text: `${count} derrotas consecutivas. A variância é normal, mas re-avalia se as tuas apostas ainda têm valor real.`, sentiment: 'negative' };
      return { text: `${count} derrota${count !== 1 ? 's' : ''} consecutiva${count !== 1 ? 's' : ''}. É cedo para preocupar — mantém a estratégia se as apostas têm valor.`, sentiment: 'negative' };
    },
  },

  pnl: {
    id: 'pnl',
    title: 'Evolução P&L',
    subtitle: 'Lucro e Prejuízo ao longo do tempo',
    icon: 'bar-chart-outline',
    description:
      'Mostra a evolução do teu lucro e prejuízo ao longo do tempo, agrupado por semana, mês ou dia. O modo "Acumulado" mostra o saldo corrente — quanto ganhas/perdes desde o início.',
    example:
      'Na semana de 1-7 Jan apostaste €80 e recebeste €96 (P&L = +€16). Na semana seguinte apostaste €120 e recebeste €90 (P&L = −€30). No modo acumulado, o valor final seria −€14.',
    exampleFromValue: (v) => {
      const sign = v >= 0 ? '+' : '';
      return `No período selecionado, o teu saldo P&L acumulado foi de ${sign}€${Math.abs(v).toFixed(2)}. ${v >= 0 ? 'O gráfico mostra como esse lucro se distribuiu ao longo do tempo.' : 'Usa o gráfico para identificar as semanas ou meses que mais pesaram no resultado.'}`;
    },
    tips: [
      'O modo acumulado revela tendências a longo prazo que o gráfico semanal esconde.',
      'Uma linha ascendente consistente é o sinal mais importante de um apostador sustentável.',
      'Períodos de P&L zero podem indicar semanas sem apostas ou múltiplas apostas que se cancelam.',
    ],
    interpret: (value) => {
      if (value > 0) return { text: `Lucro de €${value.toFixed(2)} neste período. O gráfico mostra como esse resultado se distribui ao longo do tempo.`, sentiment: 'positive' };
      if (value === 0) return { text: 'Sem lucro nem prejuízo neste período — empataste com a casa.', sentiment: 'neutral' };
      return { text: `Prejuízo de €${Math.abs(value).toFixed(2)} neste período. Usa o gráfico para identificar as semanas ou meses que mais pesaram.`, sentiment: 'negative' };
    },
  },

  'by-sport': {
    id: 'by-sport',
    title: 'Por Desporto',
    subtitle: 'Performance dividida por modalidade',
    icon: 'football-outline',
    description:
      'Compara o teu ROI, taxa de vitória e volume de apostas por cada desporto. Permite identificar em que modalidades tens realmente vantagem.',
    example:
      'No futebol tens 40 apostas com ROI de +8%, mas no ténis tens 10 apostas com ROI de −20%. Isto mostra que o futebol é o teu ponto forte — considera reduzir o ténis.',
    tips: [
      'Concentra o volume nos desportos com ROI positivo consistente.',
      'Desportos com menos de 20 apostas têm estatísticas pouco fiáveis.',
      'O ROI por desporto pode variar muito com a época desportiva — filtra por período.',
    ],
    interpret: (value) => {
      if (value >= 4) return { text: `Tens dados de ${value} desportos diferentes. Suficiente para identificar onde tens realmente vantagem — procura o desporto com ROI positivo e mais volume.`, sentiment: 'positive' };
      if (value === 1) return { text: 'Apostas num único desporto. Foco num nicho pode ser uma vantagem real se conheces bem essa modalidade.', sentiment: 'neutral' };
      if (value > 1) return { text: `Dados de ${value} desportos. Regista mais apostas em cada modalidade para tornar as comparações estatísticamente válidas.`, sentiment: 'neutral' };
      return { text: 'Sem dados por desporto ainda.', sentiment: 'neutral' };
    },
  },

  'by-team': {
    id: 'by-team',
    title: 'Por Equipa',
    subtitle: 'Performance por equipa apostada',
    icon: 'people-outline',
    description:
      'Mostra o teu historial em apostas que envolvem cada equipa ou jogador. Identifica se tens tendência para apostar favorecendo uma equipa em particular.',
    example:
      'Tens 15 apostas envolvendo o Benfica com ROI de +25% — és bom a ler os jogos do Benfica. No Porto tens 20 apostas com ROI de −15% — estás a sobrestimar o Porto sistematicamente.',
    tips: [
      'Bias emocional por uma equipa favorita é comum — os dados revelam se te afecta financeiramente.',
      'Equipas que jogas esporadicamente (<5 apostas) não têm amostra suficiente para conclusões.',
      'Cruza com "Por Mercado" para saber qual o tipo de aposta mais lucrativa por equipa.',
    ],
    interpret: (value) => {
      if (value >= 10) return { text: `Dados de ${value} equipas diferentes. Com este volume já consegues identificar se tens viés em relação a alguma equipa específica.`, sentiment: 'positive' };
      if (value > 0) return { text: `Dados de ${value} equipa${value !== 1 ? 's' : ''}. Continua a registar apostas — com mais dados por equipa vais conseguir identificar padrões de confiança e viés.`, sentiment: 'neutral' };
      return { text: 'Sem dados por equipa ainda.', sentiment: 'neutral' };
    },
  },

  'by-competition': {
    id: 'by-competition',
    title: 'Por Competição',
    subtitle: 'Performance por liga e torneio',
    icon: 'ribbon-outline',
    description:
      'Análise do teu desempenho por competição (Liga Portugal, UEFA Champions League, ATP Tour, etc.). Revela em que ligas tens mais conhecimento e melhores resultados.',
    example:
      'Na Liga Portugal tens ROI +12% (conheces os clubes). Na Premier League tens ROI −18% (menos familiaridade com os favoritismos locais e calendários congestionados).',
    tips: [
      'Evita apostar em ligas que não acompanhas regularmente — o conhecimento é vantagem real.',
      'Competições com mais apostas dão estatísticas mais fiáveis.',
      'Ligas menores podem ter mais ineficiências nas odds se as acompanhas de perto.',
    ],
    interpret: (value) => {
      if (value >= 5) return { text: `Apostas em ${value} competições. Alta diversidade — compara os ROIs para perceber em que ligas tens mais conhecimento e melhores resultados.`, sentiment: 'neutral' };
      if (value > 0) return { text: `Apostas em ${value} competiç${value === 1 ? 'ão' : 'ões'}. Foca nas competições que acompanhas mais de perto para maximizar a vantagem informativa.`, sentiment: 'neutral' };
      return { text: 'Sem dados por competição ainda.', sentiment: 'neutral' };
    },
  },

  'by-market': {
    id: 'by-market',
    title: 'Por Mercado',
    subtitle: 'Performance por tipo de aposta',
    icon: 'grid-outline',
    description:
      'Mostra o ROI e win rate para cada tipo de mercado que jogaste (1X2, Ambas Marcam, Mais/Menos Golos, Handicap, etc.). É onde a maioria dos apostadores descobre onde tem vantagem ou desvantagem.',
    example:
      'Em "1X2" tens ROI de +15% (bom a prever o resultado direto). Em "Mais de 2.5 Golos" tens ROI de −22% (não prevês bem o total de golos). Conclusão: foca-te em 1X2.',
    tips: [
      'Mercados de alta probabilidade (BTTS, 1X2) têm odds baixas mas podem ser mais previsíveis.',
      'Handicaps e totais dependem mais de análise estatística do que do resultado direto.',
      'Se tens ROI negativo em todos os mercados, o problema pode ser a gestão de bankroll, não a seleção.',
    ],
    interpret: (value) => {
      if (value >= 5) return { text: `Dados em ${value} tipos de mercado. Ótimo — compara os ROIs para encontrar o mercado onde tens mais vantagem consistente.`, sentiment: 'positive' };
      if (value >= 2) return { text: `Dados em ${value} mercados. Quando tiveres mais apostas em cada um, a comparação vai revelar o teu ponto forte.`, sentiment: 'neutral' };
      if (value > 0) return { text: 'Apostas num único tipo de mercado. Especialização pode ser vantagem — certifica-te que esse mercado é onde tens realmente edge.', sentiment: 'neutral' };
      return { text: 'Sem dados por mercado ainda.', sentiment: 'neutral' };
    },
  },

  'by-odds-range': {
    id: 'by-odds-range',
    title: 'Por Intervalo de Odds',
    subtitle: 'ROI agrupado por nível de risco',
    icon: 'options-outline',
    description:
      'Agrupa as tuas apostas por faixas de odds (<1.5, 1.5–2.0, 2.0–3.0, 3.0–5.0, >5.0) e calcula o ROI em cada faixa. Muito útil para perceber se preferes favoritos ou azarões.',
    example:
      'Odds de 1.5–2.0: ROI +18% (100 apostas). Odds de 3.0–5.0: ROI −35% (40 apostas). Claramente deves concentrar-te nas odds baixas e evitar as odds longas.',
    tips: [
      'Odds mais altas têm mais variância — precisas de muito mais apostas para ter significância estatística.',
      'Muitos apostadores perdem dinheiro em odds longas (>5) porque subestimam a probabilidade real do evento.',
      'As odds do mercado já descontam a margem da casa — vencer a longo prazo requer encontrar valor real.',
    ],
    interpret: (value) => {
      if (value >= 4) return { text: `Tens apostas distribuídas por ${value} faixas de odds. Analisa o gráfico para ver em que faixa o teu ROI é mais positivo — esse é o teu intervalo ideal.`, sentiment: 'positive' };
      if (value >= 2) return { text: `Dados em ${value} faixas de odds. À medida que registares mais apostas, o padrão por nível de risco vai ficar mais claro.`, sentiment: 'neutral' };
      if (value > 0) return { text: 'Apostas concentradas numa faixa de odds. Diversifica para perceber se o teu desempenho muda com o nível de risco.', sentiment: 'neutral' };
      return { text: 'Sem dados suficientes por faixa de odds.', sentiment: 'neutral' };
    },
  },

  'by-site': {
    id: 'by-site',
    title: 'Por Casa de Apostas',
    subtitle: 'ROI e tendência por plataforma',
    icon: 'business-outline',
    description:
      'Compara a tua performance em cada operador de apostas, com tendência mensal. Ajuda a detetar se num site específico tens sistematicamente piores resultados (pode indicar limitações de conta).',
    example:
      'Na Betclic tens ROI de +12%; no Bet365 tens ROI de −8%. Pode ser coincidência por amostra pequena, mas também pode indicar que as odds do Bet365 são menos competitivas nas linhas que jogas.',
    tips: [
      'Diferentes sites podem ter odds mais competitivas em desportos específicos.',
      'Se um site te limitar as stakes, o ROI histórico fica distorcido.',
      'Usa várias casas de apostas para sempre conseguir as melhores odds (line shopping).',
    ],
    interpret: (value) => {
      if (value >= 4) return { text: `Usas ${value} operadores — excelente! Com este número de casas tens sempre a oportunidade de encontrar as melhores odds para cada aposta.`, sentiment: 'positive' };
      if (value === 3) return { text: 'Usas 3 operadores. Boa diversificação — garante que comparas as odds entre eles antes de apostar.', sentiment: 'positive' };
      if (value === 2) return { text: 'Usas 2 operadores. Considera adicionar mais uma casa para ter mais opções de line shopping.', sentiment: 'neutral' };
      if (value === 1) return { text: 'Usas apenas 1 operador. Podes estar a perder valor real — diferentes casas têm odds melhores em diferentes mercados.', sentiment: 'negative' };
      return { text: 'Sem dados por casa de apostas ainda.', sentiment: 'neutral' };
    },
  },

  'by-weekday': {
    id: 'by-weekday',
    title: 'Por Dia da Semana',
    subtitle: 'P&L distribuído pelos dias',
    icon: 'calendar-outline',
    description:
      'Mostra o lucro/prejuízo e número de apostas por dia da semana. Muitos apostadores têm padrões inconscientes — apostam mais ao fim de semana e com menos análise.',
    example:
      'Sábado: 40 apostas, ROI de −25%. Terça-feira: 8 apostas, ROI de +30%. Resultado típico: mais apostas e mais impulsivas ao fim de semana quando há mais jogos.',
    tips: [
      'Se tens ROI negativo sábado/domingo, considera reduzir o volume nesses dias.',
      'Dias com poucas apostas mas ROI positivo são os teus dias "de qualidade".',
      'Apostas feitas de madrugada ou com pressão de tempo têm tipicamente piores resultados.',
    ],
    interpret: (value) => {
      if (value >= 7) return { text: 'Tens dados de todos os dias da semana. Ótimo — analisa a tabela para identificar os teus melhores e piores dias e ajusta o volume em conformidade.', sentiment: 'positive' };
      if (value >= 4) return { text: `Dados de ${value} dias da semana. Já consegues ver padrões — procura os dias com ROI positivo e concentra aí o volume.`, sentiment: 'neutral' };
      if (value > 0) return { text: `Dados de ${value} dia${value !== 1 ? 's' : ''} da semana — ainda poucos para padrões claros.`, sentiment: 'neutral' };
      return { text: 'Sem dados por dia da semana ainda.', sentiment: 'neutral' };
    },
  },

  'by-leg-count': {
    id: 'by-leg-count',
    title: 'Por Nº de Seleções',
    subtitle: 'Performance por nº de pernas no parlay',
    icon: 'layers-outline',
    description:
      'Analisa o ROI por número de seleções por boletim (singulares, duplas, triplas, 4+). Na maioria dos jogadores, o ROI piora drasticamente com o aumento de seleções.',
    formulaLabel: 'Porquê?',
    formula: 'Cada seleção aposta acumula a margem da casa: num parlay de 5 pernas com margem de 5% por seleção, a margem total chega a ~23%',
    example:
      'Singulares: ROI −2% (a casa tem pouca margem). Duplas: ROI −8%. Trebles: ROI −18%. Acumuladores de 5+: ROI −45%. A matemática é impiedosa com os parlays.',
    tips: [
      'Apostas singulares com valor identificado são mais lucrativas a longo prazo do que acumuladores.',
      'Acumuladores de odds longas são a fonte de lucro principal das casas de apostas.',
      'Se gostas de acumuladores pelo entretenimento, gere a stake como custo de lazer.',
    ],
    interpret: (value) => {
      if (value >= 4) return { text: `Dados de ${value} categorias de nº de seleções. Compara o ROI dos singulares com os acumuladores — a maioria dos apostadores perde mais nos parlays.`, sentiment: 'positive' };
      if (value >= 2) return { text: `Dados de ${value} categorias. Regista mais apostas em cada tipo para tornar a comparação válida.`, sentiment: 'neutral' };
      if (value > 0) return { text: 'Dados de apenas 1 categoria de seleções — sem comparação possível ainda.', sentiment: 'neutral' };
      return { text: 'Sem dados por número de seleções ainda.', sentiment: 'neutral' };
    },
  },

  freebet: {
    id: 'freebet',
    title: 'Freebets',
    subtitle: 'ROI separado de apostas gratuitas',
    icon: 'gift-outline',
    description:
      'Separa as tuas apostas com freebets (dinheiro de bónus) das apostas reais. Como numa freebet não arrisca dinheiro real, o ROI de freebets não reflete a tua habilidade — a tua estatística "limpa" exclui freebets.',
    example:
      'Sem freebets: 80 apostas, ROI −3% (desempenho real). Com freebets: 5 apostas ganhou 3, ROI aparente de +200%. Incluir freebets na estatística geral daria uma imagem falsa do desempenho.',
    tips: [
      'Usa as freebets em apostas de odds altas para maximizar o valor esperado.',
      'O teu ROI "real" (excluindo freebets) é o indicador mais honesto da tua capacidade.',
      'Algumas estratégias de matched betting usam freebets para garantir lucro — não conta como habilidade de apostas.',
    ],
    interpret: (value) => {
      if (value === 0) return { text: 'Sem freebets registadas. Quando usares bónus ou apostas gratuitas, marca-as como freebet para manter as estatísticas limpas.', sentiment: 'neutral' };
      if (value >= 10) return { text: `${value} freebets registadas. Bom aproveitamento de bónus — lembra-te que o ROI de freebets não reflete a tua habilidade real de apostador.`, sentiment: 'positive' };
      return { text: `${value} freebet${value !== 1 ? 's' : ''} registada${value !== 1 ? 's' : ''}. Continua a separar as freebets das apostas reais para manter o teu ROI real limpo.`, sentiment: 'neutral' };
    },
  },

  heatmap: {
    id: 'heatmap',
    title: 'Calendário de Apostas',
    subtitle: 'Mapa de frequência e resultado por dia',
    icon: 'grid-outline',
    description:
      'Visualização tipo "GitHub contributions" a mostrar cada dia das últimas 26 semanas. Verde indica dias lucrativos, vermelho dias com prejuízo, amarelo dias neutros/sem apostas resolvidas.',
    example:
      'Um padrão de vermelho intenso aos sábados revela que esse é o teu pior dia. Semanas quase vazias podem indicar período de férias ou break saudável das apostas.',
    tips: [
      'Usa o heatmap para identificar padrões sazonais — algumas ligas têm paragem em dezembro/janeiro.',
      'Semanas verdes consistentes são o sinal mais saudável — disciplina e consistência.',
      'Se vês clusters de vermelho após clusters de verde, pode ser "tilt" após uma boa série.',
    ],
    interpret: (value) => {
      if (value >= 100) return { text: `${value} apostas resolvidas registadas. Histórico excelente para análise — o heatmap já revela padrões sazonais e de consistência.`, sentiment: 'positive' };
      if (value >= 30) return { text: `${value} apostas resolvidas. O heatmap começa a ter valor — procura padrões de verde/vermelho por semana e mês.`, sentiment: 'positive' };
      if (value > 0) return { text: `${value} aposta${value !== 1 ? 's' : ''} resolvida${value !== 1 ? 's' : ''} visível${value !== 1 ? 'eis' : ''} no calendário. Continua a registar para o heatmap ganhar significado.`, sentiment: 'neutral' };
      return { text: 'Sem apostas resolvidas ainda.', sentiment: 'neutral' };
    },
  },

  'by-stake': {
    id: 'by-stake',
    title: 'Por Faixa de Stake',
    subtitle: 'Performance por montante apostado',
    icon: 'cash-outline',
    description:
      'Agrupa as apostas por faixa de valor apostado (€0–5, €5–10, €10–25, €25–50, €50+). Revela se gastas mais em apostas que perdes — um sinal de sobre-confiança ou inclinação emocional.',
    example:
      'Stakes €5–10: ROI +12% (apostas ponderadas). Stakes €50+: ROI −30% (apostas impulsivas de alto valor). Claramente as apostas grandes são feitas com menos análise.',
    tips: [
      'Um ROI que piora com o aumento do stake é sinal de apostas emocionais/impulsivas de maior valor.',
      'Define um stake máximo como regra de gestão de bankroll e segue-o.',
      'O Kelly Criterion sugere que o stake ideal é proporcional à vantagem que tens — raramente justifica stakes muito altas.',
    ],
    interpret: (value) => {
      if (value >= 4) return { text: `Apostas distribuídas por ${value} faixas de stake. Compara o ROI por faixa — se piora com stakes maiores é sinal de apostas impulsivas de alto valor.`, sentiment: 'positive' };
      if (value >= 2) return { text: `Dados em ${value} faixas de stake. Regista mais apostas para a análise de gestão de bankroll ser válida.`, sentiment: 'neutral' };
      if (value > 0) return { text: 'Stakes concentradas numa faixa. Sem comparação possível ainda.', sentiment: 'neutral' };
      return { text: 'Sem dados por faixa de stake ainda.', sentiment: 'neutral' };
    },
  },

  'sport-market-matrix': {
    id: 'sport-market-matrix',
    title: 'Matriz Desporto × Mercado',
    subtitle: 'Cruzamento de desporto com tipo de aposta',
    icon: 'stats-chart-outline',
    description:
      'Tabela cruzada que mostra o ROI para cada combinação de desporto e mercado. É a análise mais granular para encontrar o teu "nicho" — onde específicamente tens vantagem.',
    example:
      'Futebol 1X2: ROI +15% ✓. Futebol BTTS: ROI −10% ✗. Basquetebol Handicap: ROI +8% ✓. Ténis 1X2: ROI −25% ✗. Foca no futebol 1X2 e basquetebol handicap.',
    tips: [
      'Células com menos de 10 apostas (mostrado como contagem) têm pouca significância — não tires conclusões.',
      'Verde escuro = boa vantagem. Vermelho escuro = evita esta combinação.',
      'O teu "edge" real é a célula onde consistentemente tens ROI positivo com volume significativo.',
    ],
    interpret: (value) => {
      if (value >= 9) return { text: `${value} combinações desporto×mercado com dados. A matriz já tem espéssura suficiente — identifica as células verdes com mais apostas. Esse é o teu nicho real.`, sentiment: 'positive' };
      if (value >= 4) return { text: `${value} combinações com dados. O padrão começa a aparecer — foca nas células com mais apostas antes de tirar conclusões.`, sentiment: 'neutral' };
      if (value > 0) return { text: `Apenas ${value} combinaç${value === 1 ? 'ão' : 'ões'} com dados. Regista mais apostas em desportos e mercados variados para a matriz ter valor.`, sentiment: 'neutral' };
      return { text: 'Sem dados na matriz ainda.', sentiment: 'neutral' };
    },
  },

  'odds-efficiency': {
    id: 'odds-efficiency',
    title: 'Eficiência de Odds',
    subtitle: 'Retorno real vs retorno implícito das odds',
    icon: 'speedometer-outline',
    description:
      'Mede quão bem o teu retorno real se compara ao retorno "esperado" implícito nas odds. 100% = exatamente no mínimo esperado. >100% = estás a superar as probabilidades implícitas. <100% = estás abaixo do esperado.',
    formulaLabel: 'Fórmula',
    formula: 'Eficiência = (Retorno Real Total ÷ Retorno Implícito Total) × 100\nRetorno Implícito = Stake × Odd de cada aposta',
    example:
      'Apostaste €10 a odds 2.0 (retorno implícito €20). Ganhou: retorno real €20 → eficiência 100%. Se systematicamente ganhas menos que o esperado, a eficiência fica abaixo de 100%.',
    exampleFromValue: (v) => {
      if (v <= 0) return 'Ainda sem dados suficientes para calcular a eficiência de odds neste período.';
      return `No período selecionado, o teu retorno real correspondeu a ${v.toFixed(0)}% do valor implicitamente esperado pelas odds das tuas apostas. ${v >= 100 ? 'Estás a superar o retorno esperado — as tuas apostas têm valor real acima da margem da casa.' : 'Estás abaixo do retorno esperado — concentra-te em apostas onde identificas valor real e evita favoritos óbvios com margem alta.'}`;
    },
    tips: [
      'Eficiência >100% a longo prazo indica que estás a explorar ineficiências do mercado.',
      'Eficiência de exatamente 100% seria matematicamente perfeito — muito difícil de atingir com a margem da casa.',
      'Compara com o teu ROI: ROI mede lucro absoluto; eficiência mede performance relativa às odds.',
    ],
    interpret: (value) => {
      if (value <= 0) return { text: 'Sem dados suficientes para calcular eficiência.', sentiment: 'neutral' };
      if (value >= 105) return { text: `Eficiência de ${value.toFixed(0)}% — estás a superar as probabilidades implícitas! Sinal claro de que as tuas apostas têm valor real acima da margem da casa.`, sentiment: 'positive' };
      if (value >= 95) return { text: `Eficiência de ${value.toFixed(0)}% — dentro do esperado para o mercado. Nada a melhorar urgentemente, mas procura apostas com mais valor.`, sentiment: 'neutral' };
      return { text: `Eficiência de ${value.toFixed(0)}% — as tuas apostas ganhadoras têm odds mais baixas que as perdedoras. Procura mais valor antes de apostar — não aposta só pelo favorito.`, sentiment: 'negative' };
    },
  },

  'avg-stake-outcome': {
    id: 'avg-stake-outcome',
    title: 'Stake Média por Resultado',
    subtitle: 'Quanto apostas quando ganhas vs quando perdes',
    icon: 'analytics-outline',
    description:
      'Compara o valor médio apostado nas apostas que ganhaste versus nas que perdeste. Se a stake média nas perdas for sistematicamente maior do que nas vitórias, podes estar a apostar mais quando tens menos confiança justificada.',
    example:
      'Stake média ganhas: €8. Stake média perdidas: €18. Isto sugere que quando apostas mais (mais confiante ou mais impulsivo), tende a correr mal. Um sinal de viés de confiança.',
    exampleFromValue: (v) => {
      // v = averageWonStake - averageLostStake
      if (v < -0.5) return `No período, a tua stake média nas derrotas foi €${Math.abs(v).toFixed(2)} maior do que nas vitórias — podes estar a apostar mais nas situações que acabam por correr mal. Considera usar uma stake fixa.`;
      if (v > 0.5) return `No período, a tua stake média nas vitórias foi €${v.toFixed(2)} maior do que nas derrotas — apostaste mais nas seleções que acabaram por ganhar. Bom sinal de confiança calibrada.`;
      return 'No período, a tua stake média nas apostas ganhas e perdidas foi praticamente igual — boa consistência na gestão de bankroll.';
    },
    tips: [
      'Idealmente, a stake média deve ser semelhante em vitórias e derrotas — apostas sem enviesamento emocional.',
      'Se a stake perdida for muito maior, considera usar stakes fixas para eliminar o viés emocional.',
      'Esta métrica captura "tilt" — aumentar a stake após uma derrota para recuperar.',
    ],
    // value = averageWonStake - averageLostStake (negative means lost stake is bigger)
    interpret: (value) => {
      if (value < -5) return { text: `A tua stake média nas derrotas é €${Math.abs(value).toFixed(0)} maior do que nas vitórias. Possível sinal de apostas impulsivas de alto valor — considera usar stakes fixas para eliminar o viés emocional.`, sentiment: 'negative' };
      if (value > 5) return { text: `A tua stake média nas vitórias é €${value.toFixed(0)} maior do que nas derrotas. Podes estar a ser mais cauteloso em apostas que não confias tanto — analisa se esse padrão é intencional.`, sentiment: 'neutral' };
      return { text: 'As tuas stakes nas vitórias e derrotas são semelhantes. Boa consistência — estás a apostar sem viés emocional evidente.', sentiment: 'positive' };
    },
  },

  // ── Boletin detail metrics ───────────────────────────────────────────────

  'boletim-stake': {
    id: 'boletim-stake',
    title: 'Stake',
    subtitle: 'Montante apostado neste boletim',
    icon: 'cash-outline',
    description:
      'A stake é o valor que colocas em risco neste boletim. É o montante que pagas à casa de apostas para participar na aposta. Se o boletim perder, perdes toda a stake.',
    formulaLabel: 'Retorno se ganhar',
    formula: 'Retorno = Stake × Odd Total',
    example:
      'Se apostas €20 com odd total de 2.50, o teu retorno se ganhares será €50 (€20 × 2.50). O teu lucro líquido seria €30 (€50 − €20 de stake).',
    tips: [
      'Nunca apostes mais do que podes perder — a gestão de bankroll é mais importante do que a seleção de apostas.',
      'Uma regra comum é não arriscar mais de 1–5% do bankroll total por aposta.',
      'A stake deve refletir a tua confiança na aposta e o valor (edge) que acreditas ter.',
    ],
    interpret: (value) => {
      if (value <= 0) return { text: 'Valor de stake inválido.', sentiment: 'neutral' };
      return { text: `Apostaste €${value.toFixed(2)} neste boletim. Se ganhar, esse valor é incluído no retorno final.`, sentiment: 'neutral' };
    },
  },

  'boletim-odds': {
    id: 'boletim-odds',
    title: 'Odd Total',
    subtitle: 'Odd acumulada do boletim',
    icon: 'layers-outline',
    description:
      'A odd total é o produto de todas as odds das seleções no boletim. Num acumulador, representa o multiplicador aplicado à stake — quanto maior, maior o retorno potencial mas menor a probabilidade real de ganhar.',
    formulaLabel: 'Como se calcula',
    formula: 'Odd Total = Odd 1 × Odd 2 × Odd 3 × ...',
    example:
      'Num boletim com 3 seleções de odds 1.80, 2.10 e 1.50: Odd Total = 1.80 × 2.10 × 1.50 = 5.67. Com stake de €10, o retorno seria €56.70.',
    tips: [
      'Cada seleção extra multiplica a odd total mas também multiplica o risco — todas as seleções têm de ganhar.',
      'Odds muito altas em acumuladores parecem atrativas, mas a probabilidade real de ganhar cai drasticamente.',
      'Uma odd de 2.00 implica 50% de probabilidade — compara sempre com a probabilidade que tu estimas.',
    ],
    interpret: (value) => {
      if (value < 1.5) return { text: `Odd total de ${value.toFixed(2)} — muito baixa. Grande probabilidade implícita de ganhar, mas o retorno é modesto.`, sentiment: 'neutral' };
      if (value < 3.0) return { text: `Odd total de ${value.toFixed(2)} — moderada. Bom equilíbrio entre retorno potencial e probabilidade de ganhar.`, sentiment: 'positive' };
      if (value < 7.0) return { text: `Odd total de ${value.toFixed(2)} — alta. Retorno apelativo, mas a probabilidade de todas as seleções ganharem é mais baixa.`, sentiment: 'neutral' };
      return { text: `Odd total de ${value.toFixed(2)} — muito alta. O retorno potencial é grande, mas a probabilidade de ganhar tudo é muito reduzida.`, sentiment: 'negative' };
    },
  },

  'boletim-potential-return': {
    id: 'boletim-potential-return',
    title: 'Retorno',
    subtitle: 'Valor total a receber se ganhar',
    icon: 'wallet-outline',
    description:
      'O retorno é o valor total que recebes da casa de apostas se todas as seleções do boletim vencerem. Inclui sempre a stake original mais o lucro. Para boletins já resolvidos, mostra o valor efetivamente recebido.',
    formulaLabel: 'Fórmula',
    formula: 'Retorno Potencial = Stake × Odd Total',
    example:
      'Com stake de €25 e odd total de 3.20: Retorno = €25 × 3.20 = €80. Desses €80, €25 são a tua stake recuperada e €55 são lucro líquido.',
    tips: [
      'O retorno inclui sempre a stake — o teu lucro real é Retorno − Stake.',
      'Para boletins pendentes, este valor é apenas uma estimativa — só garantes o retorno se ganhar.',
      'Compara o retorno potencial com a stake para avaliar se o risco/recompensa faz sentido.',
    ],
    interpret: (value) => {
      if (value <= 0) return { text: 'Sem retorno calculado.', sentiment: 'neutral' };
      return { text: `Podes receber €${value.toFixed(2)} se todas as seleções ganharem. Lembra-te que este valor já inclui a tua stake.`, sentiment: 'positive' };
    },
  },

  'boletim-profit': {
    id: 'boletim-profit',
    title: 'Lucro / Prejuízo',
    subtitle: 'Ganho ou perda líquida',
    icon: 'trending-up-outline',
    description:
      'O lucro ou prejuízo é a diferença líquida entre o retorno recebido (ou potencial) e a stake apostada. Um valor positivo significa ganho real; zero significa que apenas recuperaste a stake; negativo significa perda.',
    formulaLabel: 'Fórmula',
    formula: 'Lucro = Retorno − Stake',
    example:
      'Apostaste €30 e recebeste €75 → Lucro = €75 − €30 = +€45. Apostaste €30 e perdeste → Prejuízo = €0 − €30 = −€30.',
    tips: [
      'O lucro é diferente do retorno — o retorno inclui a tua stake devolvida.',
      'Acompanha o lucro acumulado no histórico de estatísticas para perceber a tua tendência real a longo prazo.',
      'Um boletim com odd alta anula o impacto de muitos pequenos ganhos — diversifica a gestão de risco.',
    ],
    interpret: (value) => {
      if (value > 0) return { text: `Lucro de €${value.toFixed(2)} neste boletim. Excelente! Este é o valor que ganhas além da stake recuperada.`, sentiment: 'positive' };
      if (value === 0) return { text: 'Lucro de €0 — recuperaste exatamente a stake. Sem ganho nem perda.', sentiment: 'neutral' };
      return { text: `Prejuízo de €${Math.abs(value).toFixed(2)} neste boletim. Faz parte — analisa se havia valor real na aposta quando a fizeste.`, sentiment: 'negative' };
    },
  },

  'boletim-roi': {
    id: 'boletim-roi',
    title: 'ROI',
    subtitle: 'Retorno sobre o investimento',
    icon: 'trending-up-outline',
    description:
      'O ROI (Return on Investment) deste boletim mede a rentabilidade em relação à stake apostada, expresso em percentagem. Um ROI positivo significa que o retorno superou o investimento.',
    formulaLabel: 'Fórmula',
    formula: 'ROI = ((Retorno − Stake) ÷ Stake) × 100',
    example:
      'Apostaste €20 e recebeste €35. ROI = ((35 − 20) ÷ 20) × 100 = +75%. Apostaste €20 e perdeste. ROI = ((0 − 20) ÷ 20) × 100 = −100%.',
    tips: [
      'Um ROI de −100% significa que perdeste toda a stake — o pior resultado possível.',
      'Um ROI de 0% significa que só recuperaste a stake — sem lucro nem perda.',
      'O ROI de um único boletim tem pouco valor estatístico — analisa o ROI global na página de Estatísticas para uma visão real.',
    ],
    interpret: (value) => {
      const sign = value > 0 ? '+' : '';
      if (value > 0) return { text: `ROI de ${sign}${value.toFixed(1)}% — ganhaste mais do que arriscaste neste boletim.`, sentiment: 'positive' };
      if (value === 0) return { text: 'ROI de 0% — recuperaste exatamente a stake, sem ganho nem perda.', sentiment: 'neutral' };
      if (value <= -100) return { text: 'ROI de −100% — perdeste toda a stake neste boletim.', sentiment: 'negative' };
      return { text: `ROI de ${value.toFixed(1)}% — perdeste ${Math.abs(value).toFixed(1)}% do montante apostado.`, sentiment: 'negative' };
    },
  },

  'boletim-selections': {
    id: 'boletim-selections',
    title: 'Seleções',
    subtitle: 'Número de pernas do boletim',
    icon: 'list-outline',
    description:
      'O número de seleções indica quantos jogos ou eventos diferentes incluíste neste boletim. Num acumulador, todas as seleções têm de ganhar para o boletim ser vencedor.',
    formulaLabel: 'Impacto no risco',
    formula: 'P(ganhar) = P(sel.1) × P(sel.2) × ... × P(sel.N)',
    example:
      'Com 3 seleções de 60% de probabilidade cada: P(ganhar tudo) = 0.60 × 0.60 × 0.60 = 21.6%. Com 5 seleções de 60%: P = 0.60⁵ ≈ 7.8%. O risco aumenta exponencialmente.',
    tips: [
      'Cada seleção extra multiplica o risco — um acumulador de 5 seleções é muito mais difícil do que 5 apostas singulares.',
      'Boletins singulares (1 seleção) têm menor risco e permitem uma gestão de bankroll mais precisa.',
      'Uma única seleção errada num acumulador anula todas as seleções corretas — uma desvantagem crítica.',
    ],
    interpret: (value) => {
      if (value === 1) return { text: 'Boletim singular (1 seleção) — menor risco, mais fácil de gerir. Ideal para apostas de alta confiança.', sentiment: 'positive' };
      if (value === 2) return { text: 'Dupla (2 seleções) — risco moderado. Ambas têm de ganhar, mas o retorno é proporcionalmente maior.', sentiment: 'neutral' };
      if (value <= 4) return { text: `Acumulador de ${value} seleções — risco intermédio. Todas têm de ganhar para o boletim ser vencedor.`, sentiment: 'neutral' };
      return { text: `Acumulador de ${value} seleções — risco alto. A probabilidade de todas ganharem diminui drasticamente com cada seleção adicional.`, sentiment: 'negative' };
    },
  },
};
