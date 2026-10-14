# Laya background services (macOS)

Two login services keep Laya's judgments current without a browser tab open:

- `ai.leadpulse.laya-server` runs the local Laya server on `127.0.0.1:8765`.
- `ai.leadpulse.laya-worker` runs `scripts/laya-judgment-worker.ts --watch 900`: every 15 minutes
  it saves fit judgments for new or edited prospects and buyer-reply judgments for deals into
  `laya_judgments`. The Hermes enrichment queue reads the fit judgments to research likely buyers first.

The worker needs the service-role key in `~/.config/leadpulse/supabase-secret-key` (mode 600).
Both run from this working tree, so a checkout of a broken branch stops them until you switch back.

Install (run each in Terminal):

```bash
mkdir -p ~/Library/Logs/leadpulse
cp scripts/launchd/ai.leadpulse.laya-*.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.leadpulse.laya-server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.leadpulse.laya-worker.plist
```

Check: `launchctl print gui/$(id -u)/ai.leadpulse.laya-worker | grep state` and
`tail ~/Library/Logs/leadpulse/laya-worker.log` (counts only; never reply text or keys).

Remove:

```bash
launchctl bootout gui/$(id -u)/ai.leadpulse.laya-worker
launchctl bootout gui/$(id -u)/ai.leadpulse.laya-server
rm ~/Library/LaunchAgents/ai.leadpulse.laya-*.plist
```
