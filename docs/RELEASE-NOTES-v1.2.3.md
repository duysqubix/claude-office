**Graphics presets, and a much faster office on Windows (WSL).**

## New in v1.2.3

**Graphics in Help:** choose **Potato, Low, Medium, High or Ultra**. It changes right away, with no reload, and your browser remembers it. High is the default and keeps the look the office has always had.

| Preset | What changes |
|---|---|
| Potato | Lower resolution, no shadows and no effects: the lightest it gets |
| Low | Full resolution, simple shadows, no glow or soft shading |
| Medium | Softer shadows and shading, with glow |
| High | The full look (the default) |
| Ultra | Sharper shadows and finer shading, at the highest resolution your screen has |

For screenshots and tests, `?gfx=potato` (or any preset name) picks one for a single visit.

## Fixed in v1.2.3
- **No more ghost sessions on WSL:** every time WSL restarted, the sessions it cut off came back as employees. On one machine that was 1,348 people, only 4 to 6 of them real, and the office became too slow to use. Sessions from before the machine started are now left out, so only your live sessions show and the office is fast again.

## Upgrade
```bash
git pull && npm install && npm start
```
