// Pink / purple dark theme.
export const colors = {
  bg: '#140D1A', // deep plum
  card: '#1E1527',
  cardAlt: '#2A1E36',
  border: '#3B2A4A',
  text: '#F7ECF8',
  muted: '#B9A3C6',
  accent: '#F27BC0', // pink
  accentDim: '#5E2D52',
  onAccent: '#24061A', // text on pink buttons
  purple: '#B48CFF',
  good: '#7EE0B5', // contact quality keeps traffic-light colors so it reads at a glance
  fair: '#F5C46E',
  bad: '#FF5F6D',
  calm: '#C39BFF', // lavender
  neutral: '#8EA6FF', // periwinkle
  active: '#FF7EB6', // hot pink
  record: '#FF5F6D',
};

export const channelColors = ['#F27BC0', '#B48CFF', '#8EA6FF', '#FFAFD2'];

export const bandColors: Record<string, string> = {
  delta: '#7C6CF0',
  theta: '#A47BF7',
  alpha: '#C39BFF',
  beta: '#F27BC0',
  gamma: '#FFAFD2',
};

export const labelColor = (label?: string) =>
  label === 'Calm' ? colors.calm : label === 'Active' ? colors.active : label === 'Neutral' ? colors.neutral : colors.muted;

export const qualityColor = (q: string) => (q === 'good' ? colors.good : q === 'fair' ? colors.fair : colors.bad);

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = 14;
