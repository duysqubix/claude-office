**No more strangers: helper sessions stay out of the office.**

## Fixed in v1.2.6
- **No random walk-ins:** sessions a program starts in the background (a plugin's helpers, like claude-mem's note-takers, with folders named `900-2f` or `852-dd`) no longer walk in as employees. Nobody is at a terminal there. They also stay out of your Personnel files, and the office never calls one back while it's still running.
- **Rename while seated:** the Rename button on a clock-in toast no longer opens a hidden name box while you're sitting at a computer or your laptop. It tells you to stand up first.

## Upgrade
```bash
git pull && npm install && npm start
```
