# trading_dashboard

A live **pixel-office dashboard** for an autonomous multi-agent LLM trading bot. The four decision
"brains" are rendered as characters in a pixel-art office; the dashboard streams the bot's live
events (from its log) and visualizes what each agent is doing in real time.

**Stack:** Python (server) + PixiJS (browser viz).

```bash
pip install -r requirements.txt
./run.sh          # serves the dashboard (default port 8501)
```

> Companion visualization for a personal research project. Not financial advice.

## Credits

Pixel-art tilesets by [LimeZu](https://limezu.itch.io/) (free asset packs). Rendering via [PixiJS](https://pixijs.com/).
