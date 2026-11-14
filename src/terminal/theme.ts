export function terminalTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    background: dark ? '#242427' : '#ffffff',
    foreground: dark ? '#f2f2f5' : '#1c1c1e',
    cursor: dark ? '#4aa0ff' : '#0a7aff',
    selectionBackground: dark ? '#4aa0ff40' : '#0a7aff30',
    black: dark ? '#98989f' : '#1c1c1e',
    brightBlack: dark ? '#b0b0b7' : '#6e6e73',
    red: dark ? '#ff7b72' : '#c52b25',
    brightRed: dark ? '#ff9d95' : '#c52b25',
    green: dark ? '#4cd27f' : '#1f9d55',
    brightGreen: dark ? '#6be499' : '#168347',
    yellow: dark ? '#e5b84a' : '#9a6b00',
    brightYellow: dark ? '#f4cf73' : '#9a6b00',
    blue: dark ? '#4aa0ff' : '#0a65cf',
    brightBlue: dark ? '#82bdff' : '#0a65cf',
    magenta: dark ? '#c69bff' : '#8a45c7',
    brightMagenta: dark ? '#ddbbff' : '#8a45c7',
    cyan: dark ? '#4cc3d6' : '#0f8a9d',
    brightCyan: dark ? '#7ddbea' : '#087386',
    white: dark ? '#d8d8df' : '#6e6e73',
    brightWhite: dark ? '#ffffff' : '#1c1c1e',
  };
}
