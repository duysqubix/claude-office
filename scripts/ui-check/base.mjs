// Which office a ui-check suite drives: the first of the variables it names that's set
// (GAME_BASE, UI_KIT_BASE), else the dev office on 4778. Never your own game on 4777, even
// when a variable names it: some suites open its live page, and a test tab there is one more
// viewer of your real sessions. UI_CHECK_ALLOW_4777=1 lifts that, for the read-only GAME_LIVE
// screenshots of your own office.
//   const BASE = (await import('./base.mjs')).officeBase('GAME_BASE', 'UI_KIT_BASE');
export const DEV_OFFICE = 'http://127.0.0.1:4778';
const YOUR_GAME = '4777';

export function officeBase(...names) {
  const name = names.find((n) => process.env[n]);
  const base = name ? process.env[name] : DEV_OFFICE;
  let url;
  try {
    url = new URL(base);
  } catch {
    refuse(`${name}=${base} isn't a URL`);
  }
  if (url.port === YOUR_GAME && process.env.UI_CHECK_ALLOW_4777 !== '1') {
    refuse(`${name}=${base} is your own game. Point it at a dev office (e.g. ${DEV_OFFICE}), or set UI_CHECK_ALLOW_4777=1 if you mean it.`);
  }
  return base.replace(/\/+$/, '');
}

function refuse(why) {
  console.error(`Refusing: ${why}`);
  process.exit(2);
}
