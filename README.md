# SPŠE Ječná – kalendář testů a úkolů

Jednoduchý statický kalendář hostovaný na **GitHub Pages**. Události se ukládají do [`data/events.json`](./data/events.json) v repozitáři.

## Jak to funguje

- **Web (GitHub Pages)** – zobrazuje kalendář a nadcházející události.
- **Rychlé přidání** – do pole napíšeš zkratku (např. `matika test derivace 5.12. 9:30`). Web otevře předvyplněné GitHub Issue.
- **GitHub Action + Groq** – Action vezme text z issue/dispatch, pošle ho do Groq API, rozparsuje na strukturovanou událost a zapíše ji do `data/events.json`.
- **Přidání přes Issue** – funguje i přímo z GitHubu (mobil, email-to-issue, atd.). Stačí vytvořit issue se štítkem `event`.

## Nasazení

1. **Vytvoř nový GitHub repozitář** (např. `spse-jecna-kalendar`) a nahraj do něj obsah této složky.
2. **Přidej Groq API klíč**:
   - Získej klíč na [console.groq.com](https://console.groq.com/).
   - V repozitáři otevři **Settings → Secrets and variables → Actions → New repository secret**.
   - Název: `GROQ_API_KEY`, hodnota: tvůj klíč.
   - (Volitelné) **Variables → New repository variable**: `GROQ_MODEL` = `llama-3.3-70b-versatile` (výchozí).
3. **Zapni GitHub Pages**:
   - **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Povol Actions zápis**:
   - **Settings → Actions → General → Workflow permissions → Read and write permissions**.
5. Pushni do `main`. Workflow `Deploy GitHub Pages` nasadí web.

## Použití

### Přes web
1. Otevři stránku na GitHub Pages.
2. Napiš do pole např. `fyz test kinematika příští úterý 8:00`.
3. Klikni **Přidat do kalendáře** – otevře se Issue.
4. Odešli Issue. Action ho během chvíle zpracuje, přidá záznam a issue zavře.

### Přes GitHub Issue
- Vytvoř issue přes šablonu **Přidat událost** nebo jakékoliv issue se štítkem `event`.
- Do těla napiš text události.

### Ručně / lokálně
```bash
export GROQ_API_KEY=...
node scripts/parse-event.mjs "matika test 5.12. 9:30" > /tmp/event.json
node scripts/add-event.mjs data/events.json "$(cat /tmp/event.json)" manual
```

## Struktura dat

`data/events.json`:

```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Test – derivace",
      "subject": "Matematika",
      "type": "test",
      "date": "2026-12-05",
      "time": "09:30",
      "description": "matika test derivace 5.12. 9:30",
      "source": "issues",
      "createdAt": "2026-11-24T..."
    }
  ]
}
```

Typy: `test`, `zkouseni`, `ukol`, `projekt`, `akce`, `jine`.

## Poznámky

- **Token v prohlížeči není potřeba.** Web jen otevírá předvyplněné Issue; AI volá Groq až na serveru v GitHub Action přes secret.
- Groq free tier má limity – pro osobní školní kalendář obvykle stačí. Při chybě Action napíše detail do logu workflow.
- Pokud AI špatně určí datum, uprav `data/events.json` ručně nebo vytvoř issue s přesnějším textem (včetně roku).
